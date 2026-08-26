import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AbilityFactory } from '../common/casl/ability.factory.js';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface.js';
import type { CreateInscricaoDto } from './dto/create-inscricao.dto.js';

/**
 * Inscrições de cortesia — quem entra na turma sem passar pelo checkout.
 *
 * Voucher, multiplicadora vinda de outra formação, convite de parceria, palestrante,
 * equipe. Antes disso essa gente ocupava cadeira sem existir no sistema: não contava
 * vaga, não saía na lista que a equipe leva para o evento.
 *
 * A linha nasce em `formacao_venda` de propósito, e não numa tabela à parte — é o que
 * faz a vaga ser descontada da capacidade, o nome aparecer no extrato e o Excel sair
 * completo sem precisar juntar duas fontes. O que a separa de uma venda é
 * `origem = 'cortesia'` com `valor_centavos = 0`.
 */
@Injectable()
export class InscricaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  private assertPode(user: AuthenticatedUser, acao: 'create' | 'delete') {
    const ability = this.abilityFactory.createForUser(user);
    if (!ability.can(acao, 'formacao_venda')) {
      throw new ForbiddenException(
        'Apenas o perfil administrador lança inscrições.',
      );
    }
  }

  async create(user: AuthenticatedUser, eventoId: string, dto: CreateInscricaoDto) {
    this.assertPode(user, 'create');

    const evento = await this.prisma.formacao_evento.findUnique({
      where: { id: eventoId },
      select: { id: true, cidade: true, vagas: true },
    });
    if (!evento) throw new NotFoundException('Evento não encontrado');

    // "Outro" sem explicação não é motivo, é campo em branco com outro nome.
    if (dto.gratuidade_origem === 'outro' && !dto.observacao) {
      throw new ConflictException(
        'Com a origem "outro", descreva o motivo no campo de detalhe.',
      );
    }

    if (dto.lote_id) {
      const lote = await this.prisma.formacao_lote.findUnique({
        where: { id: dto.lote_id },
        select: { id: true, evento_id: true, nome: true },
      });
      if (!lote) throw new NotFoundException('Lote não encontrado');
      if (lote.evento_id !== eventoId) {
        throw new ConflictException(
          `O lote "${lote.nome}" é de outra turma. Escolha um lote desta turma ou deixe em branco.`,
        );
      }
    }

    // Mesma pessoa duas vezes na mesma turma é engano em quase todos os casos — e o
    // caso em que não é (comprou e depois ganhou cortesia) se resolve cancelando a
    // compra, não somando duas vagas para uma pessoa só.
    //
    // `insensitive` porque o e-mail da cortesia chega normalizado pelo DTO, mas o da
    // venda vem como o comprador digitou no PagBank: 'Maria@x.com' e 'maria@x.com' são
    // a mesma pessoa e uma comparação exata deixaria as duas linhas passarem.
    const jaInscrita = await this.prisma.formacao_venda.findFirst({
      where: {
        evento_id: eventoId,
        status: 'confirmada',
        ambiente: 'producao',
        comprador_email: { equals: dto.email, mode: 'insensitive' },
      },
      select: { cobranca_id: true, origem: true },
    });
    if (jaInscrita) {
      throw new ConflictException(
        jaInscrita.origem === 'cortesia'
          ? `${dto.email} já tem uma inscrição de cortesia nesta turma.`
          : `${dto.email} já tem uma inscrição paga nesta turma. Cancele a compra antes de lançar a cortesia, para não ocupar duas vagas.`,
      );
    }

    const vagas = dto.vagas ?? 1;

    const criada = await this.prisma.formacao_venda.create({
      data: {
        cobranca_id: `cortesia:${randomUUID()}`,
        evento_id: eventoId,
        lote_id: dto.lote_id ?? null,
        vagas,
        // Zero, não nulo: nulo significaria "não sabemos quanto foi" e sumiria da
        // soma de receita como se fosse dado faltando. Foi de graça e isso é o dado.
        valor_centavos: 0,
        origem: 'cortesia',
        ambiente: 'producao',
        status: 'confirmada',
        observacao: dto.observacao ?? null,
        gratuidade_origem: dto.gratuidade_origem,
        // Não houve pagamento, mas a data da inscrição é real — ao contrário do
        // backfill 'manual', que é um total agregado sem data. É `pago_em` que põe a
        // linha na semana certa da série de inscrições do painel.
        pago_em: new Date(),
        metodo_pagamento: 'cortesia',
        comprador_nome: dto.nome,
        comprador_email: dto.email,
        comprador_celular: dto.celular ?? null,
      },
    });

    // A capacidade não bloqueia o lançamento — quem digita sabe se cabe mais uma
    // cadeira na sala melhor que o sistema. Mas estourar em silêncio seria pior.
    let aviso: string | null = null;
    if (evento.vagas !== null) {
      const ocupadas = await this.prisma.formacao_venda.aggregate({
        where: { evento_id: eventoId, status: 'confirmada', ambiente: 'producao' },
        _sum: { vagas: true },
      });
      const total = ocupadas._sum.vagas ?? 0;
      if (total > evento.vagas) {
        aviso = `Esta turma passou da capacidade: ${total} inscrições para ${evento.vagas} vagas.`;
      }
    }

    return { ...criada, aviso };
  }

  /**
   * Apaga uma cortesia lançada por engano.
   *
   * Apaga de verdade em vez de cancelar: a linha foi digitada à mão e nunca existiu
   * fora daqui — não há pagamento, estorno nem histórico financeiro a preservar. Só
   * cortesia pode ser apagada; venda de verdade, nem por engano.
   */
  async remove(user: AuthenticatedUser, eventoId: string, cobrancaId: string) {
    this.assertPode(user, 'delete');

    const venda = await this.prisma.formacao_venda.findUnique({
      where: { cobranca_id: cobrancaId },
      select: {
        cobranca_id: true,
        evento_id: true,
        origem: true,
        comprador_nome: true,
      },
    });
    if (!venda || venda.evento_id !== eventoId) {
      throw new NotFoundException('Inscrição não encontrada nesta turma');
    }
    if (venda.origem !== 'cortesia') {
      throw new ConflictException(
        'Só inscrição de cortesia pode ser apagada. Venda paga é histórico financeiro.',
      );
    }

    await this.prisma.formacao_venda.delete({ where: { cobranca_id: cobrancaId } });
    return { deleted: true, nome: venda.comprador_nome };
  }
}
