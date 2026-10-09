import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { EduzzApiClient, EduzzAuthError, EduzzEnrollment } from './eduzz-api.client.js';

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
   * Garante que só uma máquina rode o ciclo agendado. O `ilm-api` roda em duas máquinas
   * no Fly e cada uma tem seu cron; rodando juntas fariam ~430 req/min contra o limite de
   * 200 da Eduzz (429 em cascata). Mesma eleição do sync legado do PagBank: quem consegue
   * inserir a chave do dia, roda — `INSERT ... ON CONFLICT DO NOTHING` é atômico e não
   * depende de lock de sessão (que não presta com pool de conexões).
   */
  async ganhouOCiclo(): Promise<boolean> {
    const chave = `nutror-sync:${new Date().toISOString().slice(0, 10)}`;
    const inseridos = await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO public.formacao_webhook_evento (evento_id, evento)
      VALUES (${chave}, 'sync-nutror')
      ON CONFLICT (evento_id) DO NOTHING
    `);
    return inseridos > 0;
  }

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

      // Look up each of our active users on Nutror by email and upsert its enrollments
      // right away. Doing it per student (instead of probing all ~3.9k emails first and
      // writing at the end) means a restart or deploy mid-run keeps everything already
      // synced, rather than throwing away ~20 minutes of work.
      // /students plain pagination caps at page<=50 (max 2,500), so we can't walk
      // the full 18k+ student list — must query per-email.
      const allEmails = Array.from(usuarioByEmail.keys());
      for (const email of allEmails) {
        emailsProbed += 1;
        const usuarioId = usuarioByEmail.get(email);
        if (!usuarioId) continue;

        let studentId: string;
        try {
          const student = await this.eduzz.findStudentByEmail(email);
          if (!student) continue;
          studentId = student.id;
        } catch (e) {
          if (e instanceof EduzzAuthError) throw e;
          const msg = `student lookup failed for ${email}: ${(e as Error).message}`;
          this.logger.warn(msg);
          errors.push(msg);
          continue;
        }
        matchedStudents += 1;

        let enrollments: EduzzEnrollment[];
        try {
          enrollments = await this.eduzz.listEnrollments(studentId);
        } catch (e) {
          if (e instanceof EduzzAuthError) throw e;
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

          const data = {
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
          };
          await this.prisma.nutror_enrollment.upsert({
            where: { nutror_enrollment_id: enr.id },
            create: { nutror_enrollment_id: enr.id, ...data },
            update: data,
          });
          enrollmentsUpserted += 1;
        }
      }
      this.logger.log(`Probed ${allEmails.length} usuario emails on Nutror; ${matchedStudents} matched`);
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
