import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/auth/interfaces/authenticated-user.interface.js';
import { PagbankLegadoService } from './legado.service.js';

@ApiTags('Formações — vendas legadas (admin)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin/formacoes/legado')
export class LegadoController {
  constructor(private readonly legado: PagbankLegadoService) {}

  @Post('sync')
  @ApiOperation({
    summary: 'Importar agora as vendas dos links pag.ae cadastrados nos lotes',
    description:
      'O mesmo que o cron faz de 30 em 30 minutos. Use depois de cadastrar um link novo, para não esperar o próximo ciclo.',
  })
  async sincronizar(@CurrentUser() user: AuthenticatedUser) {
    this.legado.assertPode(user);
    return this.legado.sincronizar();
  }

  @Get('descobrir')
  @ApiOperation({
    summary: 'Links com venda na conta que não estão em nenhum lote',
    description:
      'Varre o extrato por período à procura de links pag.ae desconhecidos do portal. É a lista do que está vendendo fora do sistema — cadastre o link no lote certo para as vendas passarem a contar vaga.',
  })
  async descobrir(
    @CurrentUser() user: AuthenticatedUser,
    @Query('dias') dias?: string,
  ) {
    this.legado.assertPode(user);
    // Teto de 180: a API legada guarda cerca de 6 meses e recusa janelas mais antigas.
    const janela = Math.min(Math.max(Number(dias) || 180, 25), 180);
    return this.legado.descobrir(janela);
  }
}
