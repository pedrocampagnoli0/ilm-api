import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ResultadoAvaliacaoService } from '../resultado-avaliacao/resultado-avaliacao.service.js';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface.js';
import type { IniciarSessaoDto } from './dto/iniciar-sessao.dto.js';
import type { SalvarRespostasDto } from './dto/salvar-respostas.dto.js';
import type { ListSessoesQueryDto } from './dto/list-sessoes-query.dto.js';
import { calcularResultado, cicloGrupoDoNome } from './scoring.js';

interface TurmaAcesso {
  id: string;
  escola_id: string;
  ciclo_id: string;
  ciclo_nome: string;
}

@Injectable()
export class AvaliacaoOnlineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resultadoService: ResultadoAvaliacaoService,
  ) {}

  /**
   * Checagem única para todos os endpoints: (1) a turma existe e o usuário
   * pode escrever nela — mesmas regras de
   * ResultadoAvaliacaoService.upsertBatch; (2) o município da turma tem
   * avaliacao_online_ativa=true (piloto); (3) a avaliação existe.
   */
  private async assertAcesso(
    user: AuthenticatedUser,
    turmaId: string,
    avaliacaoId: string,
  ): Promise<{ turma: TurmaAcesso; avaliacaoAtiva: boolean }> {
    const turma = await this.prisma.turma.findUnique({
      where: { id: turmaId },
      select: {
        id: true,
        escola_id: true,
        ciclo_id: true,
        ciclo: { select: { nome: true } },
        escola: { select: { municipio: { select: { avaliacao_online_ativa: true } } } },
      },
    });
    if (!turma) {
      throw new NotFoundException('Turma não encontrada');
    }

    const isAdmin = user.perfil === 'administrador' || user.perfil === 'ilm';
    if (!isAdmin) {
      if (user.perfil === 'coordenacao' && !user.escolaIds.includes(turma.escola_id)) {
        throw new ForbiddenException('Acesso negado');
      }
      if (user.perfil === 'professor' && !user.turmaIds.includes(turmaId)) {
        throw new ForbiddenException('Acesso negado');
      }
      if (user.perfil === 'secretaria' && !user.escolaIds.includes(turma.escola_id)) {
        throw new ForbiddenException('Acesso negado');
      }
      if (user.perfil === 'diretor' && !user.escolaIds.includes(turma.escola_id)) {
        throw new ForbiddenException('Acesso negado');
      }
    }

    if (!turma.escola.municipio.avaliacao_online_ativa) {
      throw new ForbiddenException('Avaliação online não habilitada para este município.');
    }

    const avaliacao = await this.prisma.avaliacao.findUnique({
      where: { id: avaliacaoId },
      select: { ativo: true },
    });
    if (!avaliacao) {
      throw new NotFoundException('Avaliação não encontrada');
    }
    if (!avaliacao.ativo && !isAdmin) {
      throw new ForbiddenException('Avaliação encerrada — apenas administradores podem aplicar.');
    }

    return {
      turma: { id: turma.id, escola_id: turma.escola_id, ciclo_id: turma.ciclo_id, ciclo_nome: turma.ciclo.nome },
      avaliacaoAtiva: avaliacao.ativo,
    };
  }

  private async getSessaoOrThrow(sessaoId: string) {
    const sessao = await this.prisma.avaliacao_online_sessao.findUnique({
      where: { id: sessaoId },
      include: { respostas: { orderBy: { created_at: 'asc' } } },
    });
    if (!sessao) {
      throw new NotFoundException('Sessão não encontrada');
    }
    return sessao;
  }

  /** Get-or-create: reaplicar retoma a mesma sessão (unique em avaliacao_id+aluno_id). */
  async iniciar(user: AuthenticatedUser, dto: IniciarSessaoDto) {
    const aluno = await this.prisma.aluno.findUnique({
      where: { id: dto.aluno_id },
      select: { id: true, turma_id: true },
    });
    if (!aluno) {
      throw new NotFoundException('Aluno não encontrado');
    }

    const existente = await this.prisma.avaliacao_online_sessao.findUnique({
      where: { avaliacao_id_aluno_id: { avaliacao_id: dto.avaliacao_id, aluno_id: dto.aluno_id } },
      include: { respostas: { orderBy: { created_at: 'asc' } } },
    });
    if (existente) {
      await this.assertAcesso(user, existente.turma_id, dto.avaliacao_id);
      return { data: existente };
    }

    const { turma } = await this.assertAcesso(user, aluno.turma_id, dto.avaliacao_id);
    if (!cicloGrupoDoNome(turma.ciclo_nome)) {
      throw new BadRequestException('Ciclo sem suporte a avaliação online.');
    }

    const criada = await this.prisma.avaliacao_online_sessao.create({
      data: {
        avaliacao_id: dto.avaliacao_id,
        turma_id: aluno.turma_id,
        aluno_id: dto.aluno_id,
        ciclo_id: turma.ciclo_id,
        iniciada_por: user.id,
      },
      include: { respostas: true },
    });
    return { data: criada };
  }

  async obter(user: AuthenticatedUser, sessaoId: string) {
    const sessao = await this.getSessaoOrThrow(sessaoId);
    await this.assertAcesso(user, sessao.turma_id, sessao.avaliacao_id);
    return { data: sessao };
  }

  /** Status por aluno de uma turma+avaliação — alimenta o "Aplicar Online" na tela da turma. */
  async listarPorTurma(user: AuthenticatedUser, query: ListSessoesQueryDto) {
    await this.assertAcesso(user, query.turma_id, query.avaliacao_id);
    const data = await this.prisma.avaliacao_online_sessao.findMany({
      where: { turma_id: query.turma_id, avaliacao_id: query.avaliacao_id },
      select: { id: true, aluno_id: true, status: true, iniciada_em: true, concluida_em: true },
    });
    return { data };
  }

  async salvarRespostas(user: AuthenticatedUser, sessaoId: string, dto: SalvarRespostasDto) {
    const sessao = await this.getSessaoOrThrow(sessaoId);
    await this.assertAcesso(user, sessao.turma_id, sessao.avaliacao_id);
    if (sessao.status !== 'em_andamento') {
      throw new ConflictException('Sessão não está em andamento — use reiniciar para refazer.');
    }

    await this.prisma.$transaction(
      dto.respostas.map((r) =>
        this.prisma.avaliacao_online_resposta.upsert({
          where: { sessao_id_item_key: { sessao_id: sessaoId, item_key: r.item_key } },
          create: {
            sessao_id: sessaoId,
            bloco: r.bloco,
            item_key: r.item_key,
            tipo: r.tipo,
            correta: r.correta ?? null,
            valor: (r.valor ?? {}) as Prisma.InputJsonValue,
            tempo_ms: r.tempo_ms ?? null,
          },
          update: {
            bloco: r.bloco,
            tipo: r.tipo,
            correta: r.correta ?? null,
            valor: (r.valor ?? {}) as Prisma.InputJsonValue,
            tempo_ms: r.tempo_ms ?? null,
            respondido_em: new Date(),
          },
        }),
      ),
    );

    return { data: { count: dto.respostas.length } };
  }

  /**
   * Calcula os campos deriváveis (ver scoring.ts) e grava via a MESMA RPC
   * upsert_resultados_avaliacao_batch do lançamento manual — preserva
   * auditoria (avaliacao_log) e o gate de avaliação encerrada. `nivel_escrita`
   * e `escreve_nome` (exigem amostra em papel) e `ausente` são preservados do
   * que já estiver salvo, porque a RPC sobrescreve a linha inteira a cada
   * chamada.
   */
  async concluir(user: AuthenticatedUser, sessaoId: string) {
    const sessao = await this.prisma.avaliacao_online_sessao.findUnique({
      where: { id: sessaoId },
      include: { respostas: true, ciclo: { select: { nome: true } } },
    });
    if (!sessao) {
      throw new NotFoundException('Sessão não encontrada');
    }
    await this.assertAcesso(user, sessao.turma_id, sessao.avaliacao_id);

    if (sessao.status === 'concluida') {
      return { data: { sessao, resultado_calculado: sessao.resultado_calculado } };
    }

    const grupo = cicloGrupoDoNome(sessao.ciclo.nome);
    if (!grupo) {
      throw new BadRequestException('Ciclo sem suporte a avaliação online.');
    }

    const calculado = calcularResultado(
      grupo,
      sessao.respostas.map((r) => ({
        bloco: r.bloco,
        tipo: r.tipo,
        correta: r.correta,
        valor: r.valor,
        tempo_ms: r.tempo_ms,
      })),
    );

    const existente = await this.prisma.resultado_avaliacao.findUnique({
      where: { avaliacao_id_aluno_id: { avaliacao_id: sessao.avaliacao_id, aluno_id: sessao.aluno_id } },
    });

    const preservados: Record<string, unknown> = { ausente: existente?.ausente ?? false };
    if (grupo === 'ei2') {
      preservados.ei2_escreve_nome = existente?.ei2_escreve_nome ?? null;
      preservados.ei2_nivel_escrita = existente?.ei2_nivel_escrita ?? null;
    } else if (grupo === 'f1') {
      preservados.f1_escreve_nome = existente?.f1_escreve_nome ?? null;
      preservados.f1_nivel_escrita = existente?.f1_nivel_escrita ?? null;
    } else {
      preservados.f2_nivel_escrita = existente?.f2_nivel_escrita ?? null;
    }
    if (existente?.ppm != null && calculado.ppm === undefined) {
      preservados.ppm = existente.ppm;
    }

    const resultado = await this.resultadoService.upsertBatch(user, {
      avaliacao_id: sessao.avaliacao_id,
      turma_id: sessao.turma_id,
      resultados: [{ aluno_id: sessao.aluno_id, ...preservados, ...calculado }],
    });

    const atualizada = await this.prisma.avaliacao_online_sessao.update({
      where: { id: sessaoId },
      data: {
        status: 'concluida',
        concluida_em: new Date(),
        resultado_calculado: calculado as Prisma.InputJsonValue,
      },
    });

    return { data: { sessao: atualizada, resultado_calculado: calculado, resultado } };
  }

  /** Zera as respostas e reabre a sessão — para quando a professora precisa refazer. */
  async reiniciar(user: AuthenticatedUser, sessaoId: string) {
    const sessao = await this.getSessaoOrThrow(sessaoId);
    await this.assertAcesso(user, sessao.turma_id, sessao.avaliacao_id);

    await this.prisma.avaliacao_online_resposta.deleteMany({ where: { sessao_id: sessaoId } });
    const atualizada = await this.prisma.avaliacao_online_sessao.update({
      where: { id: sessaoId },
      data: {
        status: 'em_andamento',
        concluida_em: null,
        resultado_calculado: Prisma.JsonNull,
        iniciada_em: new Date(),
        iniciada_por: user.id,
      },
      include: { respostas: true },
    });
    return { data: atualizada };
  }
}
