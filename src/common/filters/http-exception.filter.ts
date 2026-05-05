import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

// Map Postgres FK constraint names to actionable pt-BR explanations. The
// generic "Referência inválida (chave estrangeira)" tells admins nothing about
// which related record is blocking the operation; this table converts the
// constraint name from the Prisma error meta into a sentence the operator can
// act on. Constraint names follow Postgres' default `<table>_<column>_fkey`.
const FK_CONSTRAINT_MESSAGES: Record<string, string> = {
  // ─── deleting a usuario ─────────────────────────────────
  turma_professora_id_fkey:
    'Este usuário é professora titular de uma ou mais turmas. Atribua outra professora antes de excluir.',
  pontuacao_avaliacao_aluno_professor_id_fkey:
    'Este usuário possui pontuações de avaliação registradas. Para preservar o histórico, desative o usuário (Ativo → Inativo) em vez de excluir.',
  ranking_professor_diario_professor_id_fkey:
    'Este usuário possui histórico de rankings. Para preservar o histórico, desative o usuário (Ativo → Inativo) em vez de excluir.',
  notificacao_usuario_id_fkey:
    'Este usuário possui notificações no sistema. Desative-o (Ativo → Inativo) em vez de excluir.',
  import_batch_usuario_id_fkey:
    'Este usuário executou importações registradas no sistema. Desative-o (Ativo → Inativo) em vez de excluir.',
  import_aluno_batch_usuario_id_fkey:
    'Este usuário executou importações de alunos registradas no sistema. Desative-o (Ativo → Inativo) em vez de excluir.',
  log_importacao_aluno_usuario_id_fkey:
    'Este usuário possui logs de importação de alunos. Desative-o (Ativo → Inativo) em vez de excluir.',
  avaliacao_log_usuario_id_fkey:
    'Este usuário possui logs de avaliação. Desative-o (Ativo → Inativo) em vez de excluir.',

  // ─── deleting a município ───────────────────────────────
  escola_municipio_id_fkey:
    'Existem escolas vinculadas a este município. Inative o município em vez de excluir.',
  aluno_municipio_id_fkey:
    'Existem alunos cadastrados neste município. Inative o município em vez de excluir.',
  avaliacao_municipio_id_fkey:
    'Existem avaliações cadastradas neste município. Inative o município em vez de excluir.',
  pontuacao_avaliacao_aluno_municipio_id_fkey:
    'Existem pontuações de avaliação vinculadas a este município. Inative o município em vez de excluir.',
  ranking_escola_diario_municipio_id_fkey:
    'Existem rankings de escolas vinculados a este município. Limpe os rankings antes de excluir.',
  ranking_professor_diario_municipio_id_fkey:
    'Existem rankings de professores vinculados a este município. Limpe os rankings antes de excluir.',
  import_batch_municipio_id_fkey:
    'Existem importações registradas para este município. Inative o município em vez de excluir.',
  import_aluno_batch_municipio_id_fkey:
    'Existem importações de alunos registradas para este município. Inative o município em vez de excluir.',
  log_importacao_aluno_municipio_id_fkey:
    'Existem logs de importação para este município. Inative o município em vez de excluir.',
  municipio_livros_ativos_municipio_id_fkey:
    'Existem livros configurados para este município. Remova os livros antes de excluir.',

  // ─── deleting an escola ────────────────────────────────
  turma_escola_id_fkey:
    'Existem turmas vinculadas a esta escola. Inative a escola em vez de excluir.',
  aluno_escola_id_fkey:
    'Existem alunos vinculados a esta escola. Inative a escola em vez de excluir.',
  pontuacao_avaliacao_aluno_escola_id_fkey:
    'Existem pontuações de avaliação vinculadas a esta escola. Inative a escola em vez de excluir.',
  ranking_escola_diario_escola_id_fkey:
    'Existem rankings vinculados a esta escola. Limpe os rankings antes de excluir.',
  ranking_professor_diario_escola_id_fkey:
    'Existem rankings de professores vinculados a esta escola. Limpe os rankings antes de excluir.',
  log_importacao_aluno_escola_id_fkey:
    'Existem logs de importação para esta escola. Inative a escola em vez de excluir.',

  // ─── deleting a turma ──────────────────────────────────
  aluno_turma_id_fkey:
    'Existem alunos vinculados a esta turma. Inative a turma em vez de excluir.',
  resultado_avaliacao_turma_id_fkey:
    'Esta turma possui resultados de avaliação registrados. Inative a turma em vez de excluir.',
  pontuacao_avaliacao_aluno_turma_id_fkey:
    'Esta turma possui pontuações de avaliação registradas. Inative a turma em vez de excluir.',
  avaliacao_log_turma_id_fkey:
    'Esta turma possui logs de avaliação. Inative a turma em vez de excluir.',
  log_importacao_aluno_turma_id_fkey:
    'Existem logs de importação para esta turma. Inative a turma em vez de excluir.',
  import_aluno_batch_item_turma_id_fkey:
    'Existem importações de alunos registradas para esta turma. Inative a turma em vez de excluir.',

  // ─── deleting an aluno ─────────────────────────────────
  resultado_avaliacao_aluno_id_fkey:
    'Este aluno possui resultados de avaliação registrados. Marque-o como transferido em vez de excluir.',
  pontuacao_avaliacao_aluno_aluno_id_fkey:
    'Este aluno possui pontuações de avaliação registradas. Marque-o como transferido em vez de excluir.',
  import_aluno_batch_item_aluno_id_fkey:
    'Este aluno foi cadastrado por uma importação registrada no sistema. Marque-o como transferido em vez de excluir.',

  // ─── deleting an avaliação ─────────────────────────────
  resultado_avaliacao_avaliacao_id_fkey:
    'Esta avaliação possui resultados registrados. Desative a avaliação (Status → Inativa) em vez de excluir.',
  pontuacao_avaliacao_aluno_avaliacao_id_fkey:
    'Esta avaliação possui pontuações calculadas. Limpe os rankings antes de excluir, ou desative a avaliação em vez de excluir.',
  avaliacao_log_avaliacao_id_fkey:
    'Esta avaliação possui logs registrados. Desative a avaliação (Status → Inativa) em vez de excluir.',
};

function friendlyForeignKeyMessage(meta: unknown): string {
  if (meta && typeof meta === 'object') {
    const m = meta as Record<string, unknown>;
    const candidates = [m.field_name, m.constraint, m.table, m.column].filter(
      (v): v is string => typeof v === 'string',
    );
    for (const candidate of candidates) {
      if (FK_CONSTRAINT_MESSAGES[candidate]) {
        return FK_CONSTRAINT_MESSAGES[candidate];
      }
    }
    if (candidates.length > 0) {
      return `Não é possível concluir: existem registros vinculados (${candidates[0]}).`;
    }
  }
  return 'Não é possível concluir: existem registros vinculados a este item. Considere desativá-lo em vez de excluir.';
}

function friendlyUniqueMessage(meta: unknown): string {
  if (meta && typeof meta === 'object') {
    const m = meta as Record<string, unknown>;
    const target = m.target;
    if (Array.isArray(target) && target.length > 0) {
      return `Já existe um registro com este(s) campo(s): ${target.join(', ')}.`;
    }
    if (typeof target === 'string') {
      return `Já existe um registro com este campo: ${target}.`;
    }
  }
  return 'Já existe um registro com esses dados.';
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Erro interno do servidor';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      message =
        typeof body === 'string'
          ? body
          : (body as { message: string | string[] }).message ?? exception.message;
    } else if (
      // CASL throws ForbiddenError (plain Error subclass) when no rules match.
      // Without this branch it falls through to the generic 500 path.
      exception instanceof Error &&
      (exception.name === 'ForbiddenError' || exception.constructor?.name === 'ForbiddenError')
    ) {
      status = HttpStatus.FORBIDDEN;
      message =
        'Você não tem permissão para esta operação. Verifique suas atribuições de município ou contate o administrador.';
    } else if (
      exception instanceof Prisma.PrismaClientKnownRequestError
    ) {
      switch (exception.code) {
        case 'P2002':
          status = HttpStatus.CONFLICT;
          message = friendlyUniqueMessage(exception.meta);
          break;
        case 'P2003':
          status = HttpStatus.UNPROCESSABLE_ENTITY;
          message = friendlyForeignKeyMessage(exception.meta);
          // Log the raw constraint so operators can extend FK_CONSTRAINT_MESSAGES
          // when an unmapped constraint surfaces in production.
          this.logger.warn(
            `P2003 foreign key violation: ${JSON.stringify(exception.meta)}`,
          );
          break;
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          message = 'Registro não encontrado';
          break;
        default:
          this.logger.error(
            `Prisma error ${exception.code}: ${exception.message}`,
          );
          break;
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
