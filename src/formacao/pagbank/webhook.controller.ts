import {
  Controller,
  HttpCode,
  Logger,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { PagbankSignatureGuard } from './pagbank-signature.guard.js';
import { WebhookService } from './webhook.service.js';
import type { PagbankNotificacao } from './tipos.js';

type RawBodyRequest = Request & { rawBody?: Buffer };

/**
 * Recebe as notificações de cobrança do PagBank.
 *
 * A política de resposta é o que mais importa aqui, porque o PagBank não tem tela de
 * acompanhamento nem botão de reenviar — uma notificação perdida é silenciosa:
 *
 *   - **500 em falha de banco** — o reenvio deles é a rede de segurança.
 *   - **200 em corpo ilegível** — reenviar não melhora um JSON quebrado.
 *   - **401 em assinatura inválida** — no guard.
 *
 * Sem throttling: o PagBank pode mandar uma rajada depois de instabilidade, e o
 * ThrottlerGuard global (100/min) descartaria vendas de verdade.
 */
@ApiExcludeController()
@SkipThrottle()
@Controller('pagbank')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly webhookService: WebhookService) {}

  @Post('webhook')
  @HttpCode(200)
  @UseGuards(PagbankSignatureGuard)
  async receber(@Req() req: RawBodyRequest) {
    let corpo: PagbankNotificacao;
    try {
      // O guard já validou a assinatura sobre o corpo cru; aqui só interpretamos.
      corpo = JSON.parse(req.rawBody!.toString('utf8')) as PagbankNotificacao;
    } catch {
      this.logger.warn('corpo não é JSON — aceitando para não gerar reenvio inútil');
      return { ok: true, ignorado: 'corpo inválido' };
    }

    const cobrancas = await this.webhookService.processar(corpo);

    if (cobrancas.length === 0) {
      return {
        ok: true,
        ignorado: corpo?.status ? `checkout ${corpo.status}` : 'sem cobranças',
      };
    }

    return { ok: true, cobrancas };
  }
}
