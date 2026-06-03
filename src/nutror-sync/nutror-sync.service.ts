import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { EduzzApiClient, EduzzEnrollment } from './eduzz-api.client.js';

export interface SyncResult {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  emailsProbed: number;
  matchedStudents: number;
  enrollmentsFetched: number;
  enrollmentsUpserted: number;
  coursesCreated: number;
  errors: string[];
}

@Injectable()
export class NutrorSyncService {
  private readonly logger = new Logger(NutrorSyncService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eduzz: EduzzApiClient,
  ) {}

  /**
   * Full sync:
   * 1. Pull all Nutror students (paginated).
   * 2. Intersect with usuario.email (lowercased).
   * 3. For each matched student, fetch enrollments and upsert into nutror_enrollment.
   * 4. Lazy-create nutror_curso rows for unseen course_hash values.
   */
  async runFullSync(): Promise<SyncResult> {
    if (this.running) {
      throw new Error('Sync already in progress');
    }
    this.running = true;
    const startedAt = new Date();
    const errors: string[] = [];
    let emailsProbed = 0;
    let matchedStudents = 0;
    let enrollmentsFetched = 0;
    let enrollmentsUpserted = 0;
    let coursesCreated = 0;

    try {
      // Build usuario email → id map (active users only).
      const usuarios = await this.prisma.usuario.findMany({
        where: { ativo: true },
        select: { id: true, email: true },
      });
      const usuarioByEmail = new Map<string, string>();
      for (const u of usuarios) {
        if (u.email) usuarioByEmail.set(u.email.toLowerCase().trim(), u.id);
      }
      this.logger.log(`Loaded ${usuarios.length} active usuarios for email matching`);

      // Build course_hash → curso_id cache (lazy-created on demand).
      const cursos = await this.prisma.nutror_curso.findMany({
        select: { id: true, course_hash: true },
      });
      const cursoByHash = new Map<string, string>(cursos.map((c) => [c.course_hash, c.id]));

      // Look up each of our active users on Nutror by email.
      // /students plain pagination caps at page<=50 (max 2,500), so we can't walk
      // the full 18k+ student list — must query per-email.
      const matched: Array<{ studentId: string; email: string; usuarioId: string }> = [];
      const allEmails = Array.from(usuarioByEmail.keys());
      for (const email of allEmails) {
        emailsProbed += 1;
        try {
          const student = await this.eduzz.findStudentByEmail(email);
          if (!student) continue;
          const usuarioId = usuarioByEmail.get(email);
          if (!usuarioId) continue;
          matched.push({ studentId: student.id, email, usuarioId });
        } catch (e) {
          const msg = `student lookup failed for ${email}: ${(e as Error).message}`;
          this.logger.warn(msg);
          errors.push(msg);
        }
      }
      matchedStudents = matched.length;
      this.logger.log(
        `Probed ${allEmails.length} usuario emails on Nutror; ${matchedStudents} matched`,
      );

      // Fetch + upsert per matched student.
      for (const { studentId, email, usuarioId } of matched) {
        let enrollments: EduzzEnrollment[];
        try {
          enrollments = await this.eduzz.listEnrollments(studentId);
        } catch (e) {
          const msg = `enrollments fetch failed for student ${studentId} (${email}): ${(e as Error).message}`;
          this.logger.warn(msg);
          errors.push(msg);
          continue;
        }
        enrollmentsFetched += enrollments.length;

        for (const enr of enrollments) {
          const course = enr.content?.courses?.[0];
          if (!course?.hash) continue;

          let cursoId = cursoByHash.get(course.hash);
          if (!cursoId) {
            const created = await this.prisma.nutror_curso.upsert({
              where: { course_hash: course.hash },
              create: { course_hash: course.hash, titulo: course.title || course.hash },
              update: { titulo: course.title || course.hash },
              select: { id: true },
            });
            cursoId = created.id;
            cursoByHash.set(course.hash, cursoId);
            coursesCreated += 1;
          }

          await this.prisma.nutror_enrollment.upsert({
            where: { nutror_enrollment_id: enr.id },
            create: {
              nutror_enrollment_id: enr.id,
              learner_email: email,
              nutror_student_id: studentId,
              course_hash: course.hash,
              course_titulo: course.title || null,
              curso_id: cursoId,
              usuario_id: usuarioId,
              progress: enr.progress ?? 0,
              status: enr.status,
              all_modules_released: enr.allModulesReleased,
              matriculado_em: new Date(enr.createdAt),
              expira_em: enr.expiredAt ? new Date(enr.expiredAt) : null,
              termos_aceitos_em: enr.acceptedTermAt ? new Date(enr.acceptedTermAt) : null,
              last_synced_at: new Date(),
            },
            update: {
              learner_email: email,
              nutror_student_id: studentId,
              course_hash: course.hash,
              course_titulo: course.title || null,
              curso_id: cursoId,
              usuario_id: usuarioId,
              progress: enr.progress ?? 0,
              status: enr.status,
              all_modules_released: enr.allModulesReleased,
              matriculado_em: new Date(enr.createdAt),
              expira_em: enr.expiredAt ? new Date(enr.expiredAt) : null,
              termos_aceitos_em: enr.acceptedTermAt ? new Date(enr.acceptedTermAt) : null,
              last_synced_at: new Date(),
            },
          });
          enrollmentsUpserted += 1;
        }
      }
    } finally {
      this.running = false;
    }

    const finishedAt = new Date();
    const result: SyncResult = {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      emailsProbed,
      matchedStudents,
      enrollmentsFetched,
      enrollmentsUpserted,
      coursesCreated,
      errors,
    };
    this.logger.log(`Nutror sync done: ${JSON.stringify(result)}`);
    return result;
  }
}
