import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AbilityFactory } from '../common/casl/ability.factory.js';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface.js';

/**
 * O que registrar sobre uma criação/inativação de checkout.
 *
 * Os campos do evento e do lote são desnormalizados de propósito: o log tem que
 * continuar legível depois que o evento for apagado (o que leva os lotes junto por
 * ON DELETE CASCADE).
 */
export interface RegistroCheckout {
  loteId: string;
  eventoId: string;
  eventoSlug: string;
  eventoCidade: string;
  loteNome: string;
  acao: 'criado' | 'inativado';
  motivo: 'manual' | 'lotou';
  /** null = o próprio sistema. */
  atorUsuarioId?: string | null;
  checkoutId?: string | null;
  checkoutUrl?: string | null;
  checkoutAmbiente?: string | null;
  /** Só na inativação automática: o placar que motivou a decisão. */
  vendidas?: number | null;
  vagas?: number | null;
  /** Mensagem do PagBank quando a chamada foi recusada. */
  erro?: string | null;
}

/**
 * Auditoria dos links de pagamento.
 *
 * Existe porque duas coisas diferentes derrubam um checkout — o clique de um
 * administrador e a inativação automática por turma lotada — e nenhuma das duas
 * deixava rastro. A segunda é a que importa: acontece sozinha, não avisa ninguém, e
 * quando o PagBank recusa a chamada o link segue vendendo numa turma cheia.
 *
 * Toda escrita é best-effort. Falhar em gravar auditoria não pode derrubar uma venda
 * nem um webhook — um log perdido é ruim, uma venda perdida é pior.
 */
@Injectable()
export class CheckoutLogService {
  private readonly logger = new Logger(CheckoutLogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  async registrar(r: RegistroCheckout): Promise<void> {
    try {
      await this.prisma.formacao_checkout_log.create({
        data: {
          lote_id: r.loteId,
          evento_id: r.eventoId,
          evento_slug: r.eventoSlug,
          evento_cidade: r.eventoCidade,
          lote_nome: r.loteNome,
          acao: r.acao,
          motivo: r.motivo,
          ator_usuario_id: r.atorUsuarioId ?? null,
          checkout_id: r.checkoutId ?? null,
          checkout_url: r.checkoutUrl ?? null,
          checkout_ambiente: r.checkoutAmbiente ?? null,
          vendidas: r.vendidas ?? null,
          vagas: r.vagas ?? null,
          erro: r.erro ?? null,
        },
      });
    } catch (e) {
      this.logger.error(
        `falha ao gravar auditoria de checkout (${r.acao}/${r.motivo}) do lote ${r.loteId}: ${(e as Error).message}`,
      );
    }
  }

  /**
   * Histórico para o painel. `motivo=lotou` responde a pergunta que originou a
   * tabela: o sistema já derrubou algum link sozinho?
   */
  async listar(
    user: AuthenticatedUser,
    filtros: {
      eventoId?: string;
      motivo?: 'manual' | 'lotou';
      limit?: number;
    } = {},
  ) {
    const ability = this.abilityFactory.createForUser(user);
    if (!ability.can('read', 'formacao_lote')) {
      throw new ForbiddenException(
        'Apenas o perfil administrador vê a auditoria de checkout.',
      );
    }

    const linhas = await this.prisma.formacao_checkout_log.findMany({
      where: {
        ...(filtros.eventoId ? { evento_id: filtros.eventoId } : {}),
        ...(filtros.motivo ? { motivo: filtros.motivo } : {}),
      },
      orderBy: { created_at: 'desc' },
      take: Math.min(filtros.limit ?? 100, 500),
    });

    return { data: linhas, total: linhas.length };
  }
}
