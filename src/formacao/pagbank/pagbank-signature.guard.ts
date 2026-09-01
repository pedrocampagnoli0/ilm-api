import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';
import type { Request } from 'express';

type RawBodyRequest = Request & { rawBody?: Buffer };

/**
 * Verifica a assinatura das notificações do PagBank.
 *
 * O PagBank manda `x-authenticity-token` = SHA-256 de `{token}-{corpo_cru}`, em
 * hexadecimal minúsculo. Repare que é **hash com o token concatenado**, não HMAC — por
 * isso este guard não reaproveita o `EduzzSignatureGuard`, que faz HMAC-SHA256.
 *
 * O corpo tem que ser o texto **exato** que chegou. Fazer `JSON.parse` e reserializar
 * muda espaço em branco e ordem de chave, e aí o hash nunca bate. Por isso lemos
 * `req.rawBody`, capturado pelo `verify` do `json()` em main.ts.
 */
@Injectable()
export class PagbankSignatureGuard implements CanActivate {
  private readonly logger = new Logger(PagbankSignatureGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RawBodyRequest>();

    const token = this.config.get<string>('PAGBANK_TOKEN');
    if (!token) {
      this.logger.error('PAGBANK_TOKEN não configurado');
      throw new ServiceUnavailableException('Webhook não configurado');
    }

    if (!req.rawBody) {
      this.logger.error(
        'rawBody não capturado — conferir o callback verify do json() em main.ts',
      );
      throw new ServiceUnavailableException('Corpo cru indisponível');
    }

    const recebida = (req.headers['x-authenticity-token'] ?? '') as string;

    if (!recebida) {
      // O sandbox de algumas contas não manda o header. Aceitar sem assinatura é
      // aceitar qualquer um escrevendo venda no banco, então isso exige uma variável
      // explícita e grita no log — se aparecer em produção, é erro de configuração.
      if (this.config.get<string>('PAGBANK_WEBHOOK_SEM_ASSINATURA') === '1') {
        this.logger.warn(
          'ACEITANDO NOTIFICAÇÃO SEM ASSINATURA — só deveria acontecer em teste',
        );
        return true;
      }
      throw new UnauthorizedException('Sem assinatura');
    }

    const esperada = createHash('sha256')
      .update(`${token}-${req.rawBody.toString('utf8')}`)
      .digest('hex');

    const a = Buffer.from(recebida, 'utf8');
    const b = Buffer.from(esperada, 'utf8');

    // Comparação em tempo constante: não vaza em quantos caracteres as assinaturas
    // começam a divergir. timingSafeEqual exige mesmo tamanho.
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      this.logger.warn(`Assinatura inválida em ${req.method} ${req.originalUrl}`);
      throw new UnauthorizedException('Assinatura inválida');
    }

    return true;
  }
}
