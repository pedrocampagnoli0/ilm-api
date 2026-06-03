import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { NutrorModuleCompletedPayload } from './dto/nutror-module-completed.dto.js';

type ProcessOutcome =
  | { status: 'duplicate'; eventId: string }
  | { status: 'unmatched'; eventId: string; conclusaoId: string }
  | {
      status: 'matched';
      eventId: string;
      conclusaoId: string;
      usuarioId: string;
    }
  | { status: 'invalid'; eventId: string; reason: string };

@Injectable()
export class EduzzService {
  private readonly logger = new Logger(EduzzService.name);

  constructor(private readonly prisma: PrismaService) {}

  async processNutrorModuleCompleted(
    payload: NutrorModuleCompletedPayload,
    signature: string | undefined,
  ): Promise<ProcessOutcome> {
    // 1. Log the raw event first. Dedup on evento_externo_id.
    if (payload.id) {
      const existing = await this.prisma.eduzz_webhook_event.findUnique({
        where: { evento_externo_id: payload.id },
        select: { id: true, processed_at: true },
      });
      if (existing) {
        this.logger.log(`Duplicate Eduzz event ${payload.id} — skipping`);
        return { status: 'duplicate', eventId: existing.id };
      }
    }

    const eventRow = await this.prisma.eduzz_webhook_event.create({
      data: {
        evento_externo_id: payload.id ?? null,
        event_type: payload.event ?? 'unknown',
        payload: payload as unknown as object,
        signature: signature ?? null,
        signature_valid: true,
      },
      select: { id: true },
    });

    // 2. Validate the parts we need before doing more writes.
    const data = payload.data;
    if (
      !data?.learner?.email ||
      !data?.course?.hash ||
      !data?.module?.id ||
      !data?.createdAt
    ) {
      await this.markFailed(
        eventRow.id,
        'Missing required fields (learner.email, course.hash, module.id, createdAt)',
      );
      return {
        status: 'invalid',
        eventId: eventRow.id,
        reason: 'missing-fields',
      };
    }

    const learnerEmail = data.learner.email.trim().toLowerCase();
    if (!learnerEmail.includes('@')) {
      await this.markFailed(
        eventRow.id,
        `Invalid learner email: ${data.learner.email}`,
      );
      return {
        status: 'invalid',
        eventId: eventRow.id,
        reason: 'invalid-email',
      };
    }

    const concluidoEm = new Date(data.createdAt);
    if (Number.isNaN(concluidoEm.getTime())) {
      await this.markFailed(
        eventRow.id,
        `Invalid createdAt: ${data.createdAt}`,
      );
      return {
        status: 'invalid',
        eventId: eventRow.id,
        reason: 'invalid-date',
      };
    }

    try {
      // 3. Upsert course catalog by hash.
      const curso = await this.prisma.nutror_curso.upsert({
        where: { course_hash: data.course.hash },
        update: { titulo: data.course.title },
        create: { course_hash: data.course.hash, titulo: data.course.title },
        select: { id: true },
      });

      // 4. Match learner to usuario (case-insensitive).
      const usuario = await this.prisma.usuario.findFirst({
        where: { email: { equals: learnerEmail, mode: 'insensitive' } },
        select: { id: true },
      });

      // 5. Upsert the completion. Idempotent on (learner_email, curso_id, module_id).
      const conclusao = await this.prisma.nutror_modulo_conclusao.upsert({
        where: {
          uq_nutror_conclusao: {
            learner_email: learnerEmail,
            curso_id: curso.id,
            module_id: data.module.id,
          },
        },
        update: {
          usuario_id: usuario?.id ?? null,
          learner_nome: data.learner.name ?? null,
          module_titulo: data.module.title ?? null,
          lesson_id: data.lesson?.id ?? null,
          lesson_titulo: data.lesson?.title ?? null,
          concluido_em: concluidoEm,
          evento_id: eventRow.id,
        },
        create: {
          usuario_id: usuario?.id ?? null,
          learner_email: learnerEmail,
          learner_nome: data.learner.name ?? null,
          curso_id: curso.id,
          module_id: data.module.id,
          module_titulo: data.module.title ?? null,
          lesson_id: data.lesson?.id ?? null,
          lesson_titulo: data.lesson?.title ?? null,
          concluido_em: concluidoEm,
          evento_id: eventRow.id,
        },
        select: { id: true },
      });

      await this.prisma.eduzz_webhook_event.update({
        where: { id: eventRow.id },
        data: { processed_at: new Date() },
      });

      if (usuario) {
        return {
          status: 'matched',
          eventId: eventRow.id,
          conclusaoId: conclusao.id,
          usuarioId: usuario.id,
        };
      }
      this.logger.warn(
        `Eduzz module completed by unknown learner ${learnerEmail} — kept for reconcile`,
      );
      return {
        status: 'unmatched',
        eventId: eventRow.id,
        conclusaoId: conclusao.id,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Eduzz processing error on event ${eventRow.id}: ${msg}`,
        (err as Error)?.stack,
      );
      // Don't rethrow — we want the receiver to return 200 and avoid retry storms
      // for application-level errors. The event row is preserved with processing_error
      // so we can fix and replay manually.
      await this.markFailed(eventRow.id, msg);
      return {
        status: 'invalid',
        eventId: eventRow.id,
        reason: 'processing-error',
      };
    }
  }

  private async markFailed(eventId: string, error: string): Promise<void> {
    try {
      await this.prisma.eduzz_webhook_event.update({
        where: { id: eventId },
        data: { processing_error: error.slice(0, 2000) },
      });
    } catch (e) {
      this.logger.error(
        `Could not update processing_error on ${eventId}`,
        e as Error,
      );
    }
  }
}
