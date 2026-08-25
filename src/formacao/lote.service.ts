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
import type { CreateLoteDto } from './dto/create-lote.dto.js';
import type { UpdateLoteDto } from './dto/update-lote.dto.js';
import { PagbankService } from './pagbank/pagbank.service.js';
import { serializarLote } from './datas.js';
import { eventoRealizado } from './status.js';

@Injectable()
export class LoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilityFactory: AbilityFactory,
    private readonly pagbank: PagbankService,
  ) {}

  private assertPode(user: AuthenticatedUser, acao: 'read' | 'create' | 'update' | 'delete') {
    const ability = this.abilityFactory.createForUser(user);
    if (!ability.can(acao, 'formacao_lote')) {
      throw new ForbiddenException(
        'Apenas o perfil administrador gerencia lotes.',
      );
    }
  }

  async create(user: AuthenticatedUser, dto: CreateLoteDto) {
    this.assertPode(user, 'create');

    const evento = await this.prisma.formacao_evento.findUnique({
      where: { id: dto.evento_id },
      select: { id: true },
    });
    if (!evento) throw new NotFoundException('Evento não encontrado');

    const ocupada = await this.prisma.formacao_lote.findFirst({
      where: { evento_id: dto.evento_id, ordem: dto.ordem },
      select: { id: true, nome: true },
    });
    if (ocupada) {
      throw new ConflictException(
        `A ordem ${dto.ordem} já é do lote "${ocupada.nome}" neste evento.`,
      );
    }

    const criado = await this.prisma.formacao_lote.create({
      data: {
        evento_id: dto.evento_id,
        ordem: dto.ordem,
        nome: dto.nome,
        preco_centavos: dto.preco_centavos,
        ate: new Date(dto.ate),
        vagas_por_compra: dto.vagas_por_compra ?? 1,
        visivel_no_site: dto.visivel_no_site ?? true,
        checkout_url: dto.checkout_url ?? null,
      },
    });
    return serializarLote(criado);
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateLoteDto) {
    this.assertPode(user, 'update');

    const lote = await this.prisma.formacao_lote.findUnique({ where: { id } });
    if (!lote) throw new NotFoundException('Lote não encontrado');

    // Preço e data-limite ficam congelados DENTRO do checkout no PagBank: a API deles
    // não tem endpoint de edição de checkout. Enquanto a criação de checkout não
    // existir (fase 4), a única saída honesta é recusar — deixar passar publicaria um
    // preço no site diferente do que o link cobra.
    if (lote.checkout_id) {
      const mudaPreco =
        dto.preco_centavos !== undefined && dto.preco_centavos !== lote.preco_centavos;
      const mudaPrazo =
        dto.ate !== undefined &&
        new Date(dto.ate).getTime() !== lote.ate.getTime();

      if (mudaPreco || mudaPrazo) {
        throw new ConflictException(
          `Lote com checkout ativo (${lote.checkout_id}): preço e data-limite estão congelados dentro do link do PagBank e não podem ser editados. ` +
            'É preciso inativar o checkout e criar outro — e republicar o site com a URL nova.',
        );
      }
    }

    if (dto.ordem !== undefined && dto.ordem !== lote.ordem) {
      const ocupada = await this.prisma.formacao_lote.findFirst({
        where: { evento_id: lote.evento_id, ordem: dto.ordem, id: { not: id } },
        select: { nome: true },
      });
      if (ocupada) {
        throw new ConflictException(
          `A ordem ${dto.ordem} já é do lote "${ocupada.nome}" neste evento.`,
        );
      }
    }

    const data: Prisma.formacao_loteUpdateInput = {};
    if (dto.ordem !== undefined) data.ordem = dto.ordem;
    if (dto.nome !== undefined) data.nome = dto.nome;
    if (dto.preco_centavos !== undefined) data.preco_centavos = dto.preco_centavos;
    if (dto.ate !== undefined) data.ate = new Date(dto.ate);
    if (dto.vagas_por_compra !== undefined) data.vagas_por_compra = dto.vagas_por_compra;
    if (dto.visivel_no_site !== undefined) data.visivel_no_site = dto.visivel_no_site;
    if (dto.checkout_url !== undefined) data.checkout_url = dto.checkout_url;

    const atualizado = await this.prisma.formacao_lote.update({ where: { id }, data });
    return serializarLote(atualizado);
  }

  async remove(user: AuthenticatedUser, id: string) {
    this.assertPode(user, 'delete');

    const lote = await this.prisma.formacao_lote.findUnique({
      where: { id },
      select: { id: true, nome: true, checkout_id: true },
    });
    if (!lote) throw new NotFoundException('Lote não encontrado');

    const vendas = await this.prisma.formacao_venda.count({ where: { lote_id: id } });
    if (vendas > 0) {
      throw new ConflictException(
        `Lote tem ${vendas} venda(s) registrada(s) e não pode ser apagado. Use visivel_no_site = false para tirá-lo do site.`,
      );
    }

    if (lote.checkout_id) {
      throw new ConflictException(
        `Lote tem checkout ativo (${lote.checkout_id}). Inative o checkout no PagBank antes de apagar — senão o link continua vendendo sem destino.`,
      );
    }

    await this.prisma.formacao_lote.delete({ where: { id } });
    return { deleted: true, nome: lote.nome };
  }

  /**
   * Cria o link de pagamento do lote no PagBank.
   *
   * O checkout é carimbado com `lote:<uuid>`, e é esse carimbo que volta na notificação
   * e liga a venda ao lote. Link criado à mão no painel do PagBank vende normalmente,
   * mas **nunca conta vaga** — não carrega identificação nenhuma.
   */
  async criarCheckout(user: AuthenticatedUser, id: string) {
    this.assertPode(user, 'update');

    const lote = await this.prisma.formacao_lote.findUnique({
      where: { id },
      include: { evento: { select: { cidade: true, slug: true, data: true } } },
    });
    if (!lote) throw new NotFoundException('Lote não encontrado');

    // Turma que já aconteceu não vende. Sem esta porta, um clique distraído cria um
    // link vivo para uma data passada — e o PagBank aceita o pagamento normalmente,
    // porque para ele é só uma cobrança.
    if (eventoRealizado(lote.evento.data)) {
      throw new ConflictException(
        `A turma de ${lote.evento.cidade} aconteceu em ${lote.evento.data.toISOString().slice(0, 10)}. Não dá para criar link de pagamento para evento realizado.`,
      );
    }

    if (lote.checkout_id) {
      throw new ConflictException(
        `Lote já tem checkout ativo (${lote.checkout_id}). Inative o atual antes de criar outro — dois links vendendo o mesmo lote dobram a contagem de vaga.`,
      );
    }

    const ate = lote.ate.toISOString().slice(0, 10);
    const criado = await this.pagbank.criarCheckout({
      loteId: lote.id,
      nome: `Formação ILM — ${lote.evento.cidade} — ${lote.nome}`,
      precoCentavos: lote.preco_centavos,
      ate,
    });

    const atualizado = await this.prisma.formacao_lote.update({
      where: { id },
      data: {
        checkout_id: criado.id,
        checkout_url: criado.url,
        checkout_ambiente: this.pagbank.ambiente,
        checkout_criado_em: new Date(),
      },
    });

    return {
      ...serializarLote(atualizado),
      // A URL do checkout precisa ir para o site: o snapshot commitado em
      // src/data/eventos.json só muda quando alguém roda `npm run sync-eventos`.
      aviso:
        'Checkout criado. Rode `npm run sync-eventos` no repo do site e publique para o link novo entrar no ar.',
    };
  }

  /**
   * Inativa o checkout do lote: o link para de vender.
   *
   * Limpa os campos mesmo se o PagBank recusar por já estar inativo — o que importa é
   * o portal parar de anunciar um link morto.
   */
  async inativarCheckout(user: AuthenticatedUser, id: string) {
    this.assertPode(user, 'update');

    const lote = await this.prisma.formacao_lote.findUnique({
      where: { id },
      select: { id: true, nome: true, checkout_id: true },
    });
    if (!lote) throw new NotFoundException('Lote não encontrado');

    if (!lote.checkout_id) {
      throw new ConflictException(
        'Lote não tem checkout ativo. Links pag.ae legados não são gerenciados pelo portal — limpe o campo pela edição do lote.',
      );
    }

    await this.pagbank.inativar(lote.checkout_id);

    const inativado = await this.prisma.formacao_lote.update({
      where: { id },
      data: {
        checkout_id: null,
        checkout_url: null,
        checkout_ambiente: null,
        checkout_criado_em: null,
      },
    });
    return serializarLote(inativado);
  }
}
