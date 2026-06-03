/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
// jest .mock.calls is typed as any[][]; introspecting call args inevitably trips
// the no-unsafe-* rules. Suppressing at the file level for test-mock ergonomics.
import { Test, TestingModule } from '@nestjs/testing';
import { EduzzService } from './eduzz.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { NutrorModuleCompletedPayload } from './dto/nutror-module-completed.dto.js';

type MockedPrisma = {
  eduzz_webhook_event: {
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  nutror_curso: { upsert: jest.Mock };
  nutror_modulo_conclusao: { upsert: jest.Mock };
  usuario: { findFirst: jest.Mock };
};

function makePrismaMock(): MockedPrisma {
  return {
    eduzz_webhook_event: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'evt-row-1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    nutror_curso: {
      upsert: jest.fn().mockResolvedValue({ id: 'curso-1' }),
    },
    nutror_modulo_conclusao: {
      upsert: jest.fn().mockResolvedValue({ id: 'concl-1' }),
    },
    usuario: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
}

const validPayload: NutrorModuleCompletedPayload = {
  id: 'eduzz-evt-1',
  event: 'nutror.module_completed',
  data: {
    producer: { email: 'producer@ilm.com.br', name: 'ILM' },
    learner: { email: 'Professor.Test@ilm.com.br', name: 'Professor Test' },
    course: { hash: 'course-hash-abc', title: 'Alfabetização Inicial' },
    lesson: { id: 'lesson-9', title: 'Aula 9' },
    module: { id: 'module-3', title: 'Módulo 3' },
    createdAt: '2026-06-02T15:00:00Z',
  },
  sentDate: '2026-06-02T15:00:01Z',
};

describe('EduzzService.processNutrorModuleCompleted', () => {
  let service: EduzzService;
  let prisma: MockedPrisma;

  beforeEach(async () => {
    prisma = makePrismaMock();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [EduzzService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(EduzzService);
  });

  it('returns "duplicate" when evento_externo_id already exists', async () => {
    prisma.eduzz_webhook_event.findUnique.mockResolvedValue({
      id: 'evt-row-prior',
      processed_at: new Date(),
    });
    const r = await service.processNutrorModuleCompleted(validPayload, 'sig');
    expect(r.status).toBe('duplicate');
    expect(prisma.eduzz_webhook_event.create).not.toHaveBeenCalled();
    expect(prisma.nutror_curso.upsert).not.toHaveBeenCalled();
  });

  it('lowercases learner email before upserting and matching', async () => {
    prisma.usuario.findFirst.mockResolvedValue({ id: 'usr-1' });
    const r = await service.processNutrorModuleCompleted(validPayload, 'sig');
    expect(r.status).toBe('matched');
    const lookupArg = prisma.usuario.findFirst.mock.calls[0][0];
    expect(lookupArg.where.email.equals).toBe('professor.test@ilm.com.br');
    const conclArg = prisma.nutror_modulo_conclusao.upsert.mock.calls[0][0];
    expect(conclArg.where.uq_nutror_conclusao.learner_email).toBe(
      'professor.test@ilm.com.br',
    );
    expect(conclArg.create.learner_email).toBe('professor.test@ilm.com.br');
  });

  it('returns "unmatched" when no usuario matches but still persists the conclusao', async () => {
    prisma.usuario.findFirst.mockResolvedValue(null);
    const r = await service.processNutrorModuleCompleted(validPayload, 'sig');
    expect(r.status).toBe('unmatched');
    expect(prisma.nutror_modulo_conclusao.upsert).toHaveBeenCalled();
    const conclArg = prisma.nutror_modulo_conclusao.upsert.mock.calls[0][0];
    expect(conclArg.create.usuario_id).toBeNull();
  });

  it('returns "matched" with usuario_id when learner is found', async () => {
    prisma.usuario.findFirst.mockResolvedValue({ id: 'usr-42' });
    const r = await service.processNutrorModuleCompleted(validPayload, 'sig');
    expect(r.status).toBe('matched');
    if (r.status === 'matched') expect(r.usuarioId).toBe('usr-42');
  });

  it('marks the event invalid when required fields are missing', async () => {
    const broken = {
      ...validPayload,
      data: { ...validPayload.data, learner: { email: '' } },
    } as unknown as NutrorModuleCompletedPayload;
    const r = await service.processNutrorModuleCompleted(broken, 'sig');
    expect(r.status).toBe('invalid');
    expect(prisma.eduzz_webhook_event.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ processing_error: expect.any(String) }),
      }),
    );
    expect(prisma.nutror_curso.upsert).not.toHaveBeenCalled();
  });

  it('rejects invalid createdAt as "invalid" without crashing', async () => {
    const broken: NutrorModuleCompletedPayload = {
      ...validPayload,
      data: { ...validPayload.data, createdAt: 'not-a-date' },
    };
    const r = await service.processNutrorModuleCompleted(broken, 'sig');
    expect(r.status).toBe('invalid');
  });

  it('upserts the course catalog by course_hash', async () => {
    await service.processNutrorModuleCompleted(validPayload, 'sig');
    expect(prisma.nutror_curso.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { course_hash: 'course-hash-abc' } }),
    );
  });

  it('records processed_at on success', async () => {
    await service.processNutrorModuleCompleted(validPayload, 'sig');
    const lastUpdate = prisma.eduzz_webhook_event.update.mock.calls.at(-1);
    expect(lastUpdate?.[0].data.processed_at).toBeInstanceOf(Date);
  });

  it('swallows Prisma errors and marks the event with processing_error', async () => {
    prisma.nutror_modulo_conclusao.upsert.mockRejectedValue(
      new Error('DB down'),
    );
    const r = await service.processNutrorModuleCompleted(validPayload, 'sig');
    expect(r.status).toBe('invalid');
    const errorCall = prisma.eduzz_webhook_event.update.mock.calls.find(
      (c) => c[0].data.processing_error,
    );
    expect(errorCall?.[0].data.processing_error).toContain('DB down');
  });
});
