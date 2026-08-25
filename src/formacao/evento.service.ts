import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AbilityFactory } from '../common/casl/ability.factory.js';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface.js';
import type { CreateEventoDto } from './dto/create-evento.dto.js';
import type { UpdateEventoDto } from './dto/update-evento.dto.js';
import type { ListEventosQueryDto } from './dto/list-eventos-query.dto.js';
import { eventoRealizado, statusDoEvento, vagasRestantes } from './status.js';
import { serializarEvento } from './datas.js';

/**
 * Vendas de sandbox convivem com as reais na mesma tabela. Toda contagem de vaga e
 * todo número de receita filtra por produção — senão um teste do PagBank fecha turma
 * de verdade.
 */
const VENDA_CONFIRMADA: Prisma.formacao_vendaWhereInput = {
  status: 'confirmada',
  ambiente: 'producao',
};

@Injectable()
export class EventoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  private assertPode(user: AuthenticatedUser, acao: 'read' | 'create' | 'update' | 'delete') {
    const ability = this.abilityFactory.createForUser(user);
    if (!ability.can(acao, 'formacao_evento')) {
      throw new ForbiddenException(
        'Apenas o perfil administrador gerencia formações.',
      );
    }
  }

  /**
   * Vagas ocupadas por evento.
   *
   * `sum(vagas)`, não `count(*)`: é o que faz a compra em grupo funcionar — um pacote
   * institucional é uma venda só, valendo 50 lugares.
   */
  private async vendidasPorEvento(eventoIds: string[]) {
    if (eventoIds.length === 0) return new Map<string, { vagas: number; centavos: number }>();

    const agregado = await this.prisma.formacao_venda.groupBy({
      by: ['evento_id'],
      where: { ...VENDA_CONFIRMADA, evento_id: { in: eventoIds } },
      _sum: { vagas: true, valor_centavos: true },
    });

    return new Map(
      agregado
        .filter((a) => a.evento_id !== null)
        .map((a) => [
          a.evento_id as string,
          {
            vagas: a._sum.vagas ?? 0,
            centavos: a._sum.valor_centavos ?? 0,
          },
        ]),
    );
  }

  async findAll(user: AuthenticatedUser, query: ListEventosQueryDto) {
    this.assertPode(user, 'read');

    const where: Prisma.formacao_eventoWhereInput = {};
    if (query.publicado !== undefined) where.publicado = query.publicado;

    if (query.quando === 'futuros' || query.quando === 'passados') {
      // Comparação por dia: um evento que acontece hoje ainda é "futuro".
      const hoje = new Date();
      const meiaNoite = new Date(
        Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()),
      );
      where.data = query.quando === 'futuros' ? { gte: meiaNoite } : { lt: meiaNoite };
    }

    const eventos = await this.prisma.formacao_evento.findMany({
      where,
      orderBy: [{ data: 'asc' }, { cidade: 'asc' }],
      include: { lotes: { orderBy: { ordem: 'asc' } } },
    });

    const vendas = await this.vendidasPorEvento(eventos.map((e) => e.id));

    return {
      data: eventos.map((evento) => {
        const v = vendas.get(evento.id) ?? { vagas: 0, centavos: 0 };
        return {
          ...serializarEvento(evento),
          vendidas: v.vagas,
          receita_centavos: v.centavos,
          restantes: vagasRestantes(evento, v.vagas),
          status: statusDoEvento(evento, v.vagas),
          realizado: eventoRealizado(evento.data),
          // O PagBank não recusa venda quando lota: a 51ª pessoa consegue pagar um
          // link de turma com 50 lugares. Sinalizar é o que o admin tem.
          excedente: evento.vagas !== null && v.vagas > evento.vagas,
        };
      }),
    };
  }

  async findOne(user: AuthenticatedUser, id: string) {
    this.assertPode(user, 'read');

    const evento = await this.prisma.formacao_evento.findUnique({
      where: { id },
      include: { lotes: { orderBy: { ordem: 'asc' } } },
    });
    if (!evento) throw new NotFoundException('Evento não encontrado');

    const vendas = await this.vendidasPorEvento([evento.id]);
    const v = vendas.get(evento.id) ?? { vagas: 0, centavos: 0 };

    return {
      ...serializarEvento(evento),
      vendidas: v.vagas,
      receita_centavos: v.centavos,
      restantes: vagasRestantes(evento, v.vagas),
      status: statusDoEvento(evento, v.vagas),
      realizado: eventoRealizado(evento.data),
      excedente: evento.vagas !== null && v.vagas > evento.vagas,
    };
  }

  async create(user: AuthenticatedUser, dto: CreateEventoDto) {
    this.assertPode(user, 'create');

    const jaExiste = await this.prisma.formacao_evento.findUnique({
      where: { slug: dto.slug },
      select: { id: true },
    });
    if (jaExiste) {
      throw new ConflictException(
        `Já existe um evento com o slug "${dto.slug}". O slug é permanente e liga o evento às vendas.`,
      );
    }

    const criado = await this.prisma.formacao_evento.create({
      data: {
        slug: dto.slug,
        cidade: dto.cidade,
        data: new Date(dto.data),
        local: dto.local,
        endereco: dto.endereco,
        como_chegar: dto.como_chegar ?? null,
        vagas: dto.vagas ?? null,
        publicado: dto.publicado ?? false,
      },
    });
    return serializarEvento(criado);
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateEventoDto) {
    this.assertPode(user, 'update');

    const evento = await this.prisma.formacao_evento.findUnique({ where: { id } });
    if (!evento) throw new NotFoundException('Evento não encontrado');

    const data: Prisma.formacao_eventoUpdateInput = {};
    if (dto.cidade !== undefined) data.cidade = dto.cidade;
    if (dto.data !== undefined) data.data = new Date(dto.data);
    if (dto.local !== undefined) data.local = dto.local;
    if (dto.endereco !== undefined) data.endereco = dto.endereco;
    if (dto.como_chegar !== undefined) data.como_chegar = dto.como_chegar;
    if (dto.vagas !== undefined) data.vagas = dto.vagas;

    const atualizado = await this.prisma.formacao_evento.update({ where: { id }, data });
    return serializarEvento(atualizado);
  }

  async publicar(user: AuthenticatedUser, id: string, publicado: boolean) {
    this.assertPode(user, 'update');

    const evento = await this.prisma.formacao_evento.findUnique({
      where: { id },
      include: { lotes: true },
    });
    if (!evento) throw new NotFoundException('Evento não encontrado');

    if (publicado) {
      const vendaveis = evento.lotes.filter(
        (l) => l.visivel_no_site && l.checkout_url,
      );
      // Turma já esgotada continua podendo ser publicada sem link: ela aparece no site
      // com o selo ESGOTADO e o botão de lista de espera, que é o comportamento certo.
      const esgotada = evento.status_manual === 'esgotado';
      if (vendaveis.length === 0 && !esgotada) {
        throw new ConflictException(
          'Evento sem nenhum lote visível com link de pagamento — não há como se inscrever. Crie um lote e gere o link antes de publicar.',
        );
      }
    }

    const publicadoEvento = await this.prisma.formacao_evento.update({
      where: { id },
      data: { publicado },
    });
    return serializarEvento(publicadoEvento);
  }

  async remove(user: AuthenticatedUser, id: string) {
    this.assertPode(user, 'delete');

    const evento = await this.prisma.formacao_evento.findUnique({
      where: { id },
      select: { id: true, slug: true },
    });
    if (!evento) throw new NotFoundException('Evento não encontrado');

    // Apagar um evento com venda apagaria histórico financeiro: as vendas só têm
    // FK ON DELETE SET NULL e virariam órfãs sem rastro de qual turma eram.
    const vendas = await this.prisma.formacao_venda.count({
      where: { evento_id: id },
    });
    if (vendas > 0) {
      throw new ConflictException(
        `Evento tem ${vendas} venda(s) registrada(s) e não pode ser apagado. Despublique em vez de apagar.`,
      );
    }

    await this.prisma.formacao_evento.delete({ where: { id } });
    return { deleted: true, slug: evento.slug };
  }

  /** Extrato da turma: toda venda, inclusive as de sandbox e as canceladas. */
  async vendas(user: AuthenticatedUser, id: string) {
    const ability = this.abilityFactory.createForUser(user);
    if (!ability.can('read', 'formacao_venda')) {
      throw new ForbiddenException(
        'Apenas o perfil administrador vê vendas.',
      );
    }

    const evento = await this.prisma.formacao_evento.findUnique({
      where: { id },
      // `data` entra porque o selo depende dela: turma realizada não anuncia vaga.
      select: {
        id: true,
        slug: true,
        cidade: true,
        data: true,
        vagas: true,
        status_manual: true,
      },
    });
    if (!evento) throw new NotFoundException('Evento não encontrado');

    // Seleção EXPLÍCITA, nunca `include` solto: o que sai daqui é decidido campo a
    // campo, não por omissão.
    //
    // `comprador_cpf` entra por decisão do ILM em 24/08/2026 — o extrato é a tela de
    // conferência da turma e o CPF ajuda a identificar o inscrito. A rota já exige
    // perfil `administrador`, e nenhuma superfície pública devolve o campo.
    const vendas = await this.prisma.formacao_venda.findMany({
      where: { evento_id: id },
      orderBy: { created_at: 'desc' },
      select: {
        cobranca_id: true,
        pedido_id: true,
        lote_id: true,
        vagas: true,
        valor_centavos: true,
        origem: true,
        ambiente: true,
        observacao: true,
        status: true,
        created_at: true,
        updated_at: true,
        comprador_nome: true,
        comprador_email: true,
        comprador_celular: true,
        comprador_cpf: true,
        dados_expurgados_em: true,
        lote: { select: { id: true, nome: true, ordem: true } },
      },
    });

    const confirmadas = vendas.filter(
      (v) => v.status === 'confirmada' && v.ambiente === 'producao',
    );
    const vendidas = confirmadas.reduce((soma, v) => soma + v.vagas, 0);

    return {
      evento: {
        ...evento,
        vendidas,
        restantes: vagasRestantes(evento, vendidas),
        status: statusDoEvento(evento, vendidas),
        realizado: eventoRealizado(evento.data),
      },
      totais: {
        confirmadas: confirmadas.length,
        canceladas: vendas.filter((v) => v.status === 'cancelada').length,
        sandbox: vendas.filter((v) => v.ambiente === 'sandbox').length,
        receita_centavos: confirmadas.reduce(
          (soma, v) => soma + (v.valor_centavos ?? 0),
          0,
        ),
      },
      data: vendas,
    };
  }
}
