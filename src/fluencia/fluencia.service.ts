import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ResultadoAvaliacaoService } from '../resultado-avaliacao/resultado-avaliacao.service.js';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface.js';
import { assertEscreveNaTurma } from '../avaliacao-online/avaliacao-online.service.js';
import { cicloGrupoDoNome } from '../avaliacao-online/scoring.js';
import type {
  CriarAplicacaoDto,
  TarefaDto,
} from './dto/criar-aplicacao.dto.js';

export interface AplicacaoSalva {
  id: string;
  ppm_gravado: number | null;
  avaliacao_id: string | null;
}

function validarTarefa(nome: string, t: TarefaDto): void {
  if (t.ultima > t.total) {
    throw new BadRequestException(
      `${nome}: ultima não pode ser maior que total.`,
    );
  }
  if (t.erros.length > t.total) {
    throw new BadRequestException(`${nome}: há mais erros do que itens.`);
  }
  if (new Set(t.erros).size !== t.erros.length) {
    throw new BadRequestException(`${nome}: erros duplicados.`);
  }
  if (t.erros.some((e) => e < 1 || e > t.ultima)) {
    throw new BadRequestException(
      `${nome}: cada erro deve estar entre 1 e o último item alcançado.`,
    );
  }
}

@Injectable()
export class FluenciaService {
  private readonly logger = new Logger(FluenciaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly resultadoService: ResultadoAvaliacaoService,
  ) {}

  async criar(
    user: AuthenticatedUser,
    dto: CriarAplicacaoDto,
  ): Promise<{ created: boolean; data: AplicacaoSalva }> {
    // 1. Idempotência: mesmo id => devolve o que foi salvo, sem efeitos.
    const existente = await this.buscarExistente(dto);
    if (existente) return { created: false, data: existente };

    validarTarefa('Pseudopalavras', dto.pseudopalavras);
    validarTarefa('Palavras', dto.palavras);
    validarTarefa('Texto', dto.texto);
    const iniciada = new Date(dto.iniciada_em);
    const concluida = new Date(dto.concluida_em);
    if (concluida < iniciada) {
      throw new BadRequestException(
        'concluida_em não pode ser anterior a iniciada_em.',
      );
    }

    // 2. Aluno e turma ATUAL (nunca a do cliente).
    const aluno = await this.prisma.aluno.findUnique({
      where: { id: dto.aluno_id },
      select: { turma_id: true, is_transferido: true },
    });
    if (!aluno) throw new NotFoundException('Aluno não encontrado');
    if (aluno.is_transferido) {
      throw new BadRequestException(
        'Aluno transferido — não é possível aplicar a fluência.',
      );
    }

    // 3. Acesso, piloto e ciclo.
    const turma = await this.prisma.turma.findUnique({
      where: { id: aluno.turma_id },
      select: {
        id: true,
        escola_id: true,
        ciclo: { select: { nome: true } },
        escola: {
          select: {
            municipio_id: true,
            municipio: {
              select: { avaliacao_online_ativa: true, faz_avaliacao: true, fluencia_1ano_ativa: true },
            },
          },
        },
      },
    });
    if (!turma) throw new NotFoundException('Turma não encontrada');
    assertEscreveNaTurma(user, turma.id, turma.escola_id);
    const municipio = turma.escola.municipio;
    if (!municipio.avaliacao_online_ativa || !municipio.faz_avaliacao) {
      throw new ForbiddenException(
        'Avaliação de fluência não habilitada para este município.',
      );
    }
    // 2º ano é padrão; 1º ano só com fluencia_1ano_ativa no município.
    const grupo = cicloGrupoDoNome(turma.ciclo.nome);
    if (grupo !== 'f2' && !(grupo === 'f1' && municipio.fluencia_1ano_ativa)) {
      throw new BadRequestException(
        'A avaliação de fluência não está liberada para turmas deste ciclo.',
      );
    }

    // PPM = palavras tentadas por minuto (decisão do produto; não é PCPM).
    const ppm = Math.round((dto.texto.ultima * 60) / dto.texto.segundos);

    // 5a. A aplicação nunca pode se perder: grava primeiro.
    try {
      await this.prisma.fluencia_aplicacao.create({
        data: {
          id: dto.id,
          aluno_id: dto.aluno_id,
          turma_id: turma.id,
          aplicado_por: user.id,
          forma_numero: dto.forma_numero,
          pseudo_total: dto.pseudopalavras.total,
          pseudo_ultima: dto.pseudopalavras.ultima,
          pseudo_erros: dto.pseudopalavras.erros,
          palavras_total: dto.palavras.total,
          palavras_ultima: dto.palavras.ultima,
          palavras_erros: dto.palavras.erros,
          texto_total: dto.texto.total,
          texto_ultima: dto.texto.ultima,
          texto_erros: dto.texto.erros,
          texto_segundos: dto.texto.segundos,
          prosodia: dto.prosodia,
          observacao: dto.observacao ?? null,
          iniciada_em: iniciada,
          concluida_em: concluida,
        },
      });
    } catch (e) {
      // Reenvio concorrente com o mesmo id: trata como idempotente.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        const ja = await this.buscarExistente(dto);
        if (ja) return { created: false, data: ja };
      }
      throw e;
    }

    // 5b. PPM na avaliação aberta do município (se houver).
    let avaliacaoId: string | null = null;
    let ppmGravado: number | null = null;
    try {
      const aberta = await this.prisma.avaliacao.findFirst({
        where: { municipio_id: turma.escola.municipio_id, ativo: true },
        // Municípios legados podem ter mais de uma aberta: vai na mais recente.
        orderBy: { created_at: 'desc' },
        select: { id: true },
      });
      if (aberta) {
        const atual = await this.prisma.resultado_avaliacao.findUnique({
          where: {
            avaliacao_id_aluno_id: {
              avaliacao_id: aberta.id,
              aluno_id: dto.aluno_id,
            },
          },
        });
        // A RPC sobrescreve ausente + campos do ciclo (f1_*/f2_*) com o payload;
        // devolvemos o que já existe para não apagar o lançamento manual.
        const doCiclo = Object.fromEntries(
          Object.entries(atual ?? {}).filter(([k]) => k.startsWith(`${grupo}_`)),
        );
        await this.resultadoService.upsertBatch(user, {
          avaliacao_id: aberta.id,
          turma_id: turma.id,
          resultados: [
            {
              aluno_id: dto.aluno_id,
              ausente: atual?.ausente ?? false,
              ...doCiclo,
              ppm,
            },
          ],
        });
        avaliacaoId = aberta.id;
        ppmGravado = ppm;
        await this.prisma.fluencia_aplicacao.update({
          where: { id: dto.id },
          data: { avaliacao_id: avaliacaoId, ppm_gravado: ppmGravado },
        });
      }
    } catch (e) {
      this.logger.error(
        `Aplicação ${dto.id} salva, mas o PPM não foi gravado: ${e instanceof Error ? e.message : String(e)}`,
      );
      return {
        created: true,
        data: { id: dto.id, ppm_gravado: null, avaliacao_id: null },
      };
    }

    return {
      created: true,
      data: { id: dto.id, ppm_gravado: ppmGravado, avaliacao_id: avaliacaoId },
    };
  }

  private async buscarExistente(
    dto: CriarAplicacaoDto,
  ): Promise<AplicacaoSalva | null> {
    const row = await this.prisma.fluencia_aplicacao.findUnique({
      where: { id: dto.id },
      select: {
        id: true,
        aluno_id: true,
        ppm_gravado: true,
        avaliacao_id: true,
      },
    });
    if (!row) return null;
    if (row.aluno_id !== dto.aluno_id) {
      throw new ConflictException(
        'Este id de aplicação já foi usado para outro aluno.',
      );
    }
    return {
      id: row.id,
      ppm_gravado: row.ppm_gravado,
      avaliacao_id: row.avaliacao_id,
    };
  }
}
