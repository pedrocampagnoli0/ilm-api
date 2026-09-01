import { Module } from '@nestjs/common';
import { CaslModule } from '../common/casl/casl.module.js';
import { EventoController } from './evento.controller.js';
import { EventoService } from './evento.service.js';
import { InscricaoService } from './inscricao.service.js';
import { LoteController } from './lote.controller.js';
import { LoteService } from './lote.service.js';
import { PublicoController } from './publico.controller.js';
import { PublicoService } from './publico.service.js';
import { InsightsController } from './insights.controller.js';
import { InsightsService } from './insights.service.js';
import { WebhookController } from './pagbank/webhook.controller.js';
import { WebhookService } from './pagbank/webhook.service.js';
import { PagbankService } from './pagbank/pagbank.service.js';
import { LegadoController } from './legado/legado.controller.js';
import { PagbankLegadoClient } from './legado/legado.client.js';
import { PagbankLegadoService } from './legado/legado.service.js';
import { PagbankLegadoScheduler } from './legado/legado.scheduler.js';

/**
 * Formações presenciais — CRUD administrativo (fase 1) + superfície pública (fase 2)
 * de `portal/docs/portal-eventos.md`.
 *
 * Três superfícies bem separadas: `admin/formacoes/*` exige JWT e perfil administrador;
 * `publico/*` é aberto e nunca devolve número de venda; `pagbank/webhook` é assinado.
 *
 * O subdiretório `legado/` é ponte, não fundação: enquanto a API de Checkout não é
 * liberada em produção, ele importa pela API antiga as vendas dos links `pag.ae` feitos
 * à mão. Quando o webhook estiver entregando, ele vira rede de segurança e nada mais no
 * módulo depende dele.
 */
@Module({
  imports: [CaslModule],
  controllers: [
    EventoController,
    LoteController,
    PublicoController,
    InsightsController,
    LegadoController,
    WebhookController,
  ],
  providers: [
    EventoService,
    InscricaoService,
    LoteService,
    PublicoService,
    InsightsService,
    WebhookService,
    PagbankService,
    PagbankLegadoClient,
    PagbankLegadoService,
    PagbankLegadoScheduler,
  ],
  exports: [EventoService, LoteService, PublicoService, PagbankService],
})
export class FormacaoModule {}
