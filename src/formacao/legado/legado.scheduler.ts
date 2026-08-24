import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PagbankLegadoService } from './legado.service.js';

/**
 * Puxa as vendas dos links `pag.ae` de meia em meia hora.
 *
 * Meia hora é o meio-termo entre dois erros: rodar de minuto em minuto martelaria uma
 * API legada e lenta para quase sempre não achar nada; rodar de hora em hora deixaria o
 * selo do site defasado justamente nos dias de pico, quando uma turma fecha em horas.
 *
 * O serviço já sai sozinho quando não está em produção ou quando falta `PAGBANK_EMAIL`,
 * então o cron pode ficar ligado em qualquer ambiente sem efeito colateral.
 */
@Injectable()
export class PagbankLegadoScheduler {
  private readonly logger = new Logger(PagbankLegadoScheduler.name);

  constructor(private readonly legado: PagbankLegadoService) {}

  @Cron('*/30 * * * *')
  async sincronizar() {
    try {
      const r = await this.legado.sincronizar();
      if (!r.executado) {
        // Log de debug: em ambiente sem PagBank isso repetiria a cada 30 min por nada.
        this.logger.debug(`sync legado não executado — ${r.motivo}`);
        return;
      }
      if (r.novas || r.atualizadas) {
        this.logger.log(
          `sync legado: +${r.novas} nova(s), ${r.atualizadas} atualizada(s) em ${r.links} link(s)`,
        );
      }
      const comErro = r.detalhes.filter((d) => d.erro);
      if (comErro.length) {
        this.logger.warn(
          `sync legado: ${comErro.length} link(s) falharam — ${comErro.map((d) => d.link).join(', ')}`,
        );
      }
    } catch (e) {
      this.logger.error(`sync legado falhou: ${(e as Error).message}`);
    }
  }
}
