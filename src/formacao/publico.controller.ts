import { Controller, Get, Header } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicoService } from './publico.service.js';

/**
 * Superfície pública das formações. **Sem autenticação** — é o site estático que
 * consome, e por isso nenhuma resposta aqui carrega número de venda ou capacidade.
 *
 * Sobre o caminho: o plano (`portal/docs/portal-eventos.md`, seção 8) escreve estas
 * rotas como `/publico/...`, mas o `main.ts` aplica `setGlobalPrefix('api')` a tudo
 * fora de `/health`. Ficam em `/api/publico/...`, consistente com o resto da API — o
 * mesmo plano já escreve o webhook como `/api/pagbank/webhook`.
 *
 * O `Access-Control-Allow-Origin` fixo cobre o caso de alguém chamar direto do
 * navegador. O caminho previsto, porém, é server-side: o site lê isto no build
 * (`sync-eventos`) e, em runtime, através de um proxy na Cloudflare — nenhum dos dois
 * envia `Origin`, então o CORS aqui é defesa extra, não requisito de funcionamento.
 */
@ApiTags('Formações — público')
@Controller('publico')
export class PublicoController {
  constructor(private readonly publicoService: PublicoService) {}

  @Get('eventos')
  @Header('Access-Control-Allow-Origin', 'https://ilm.com.br')
  // Cache maior que o do status: isto alimenta o build do site, não a página em
  // runtime, e muda só quando o admin publica alteração.
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({
    summary: 'Eventos publicados com lotes e links — alimenta o build do site',
  })
  eventos() {
    return this.publicoService.eventos();
  }

  @Get('status')
  @Header('Access-Control-Allow-Origin', 'https://ilm.com.br')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({
    summary: 'Só o selo de cada turma com capacidade definida — corrige a página em runtime',
  })
  status() {
    return this.publicoService.status();
  }
}
