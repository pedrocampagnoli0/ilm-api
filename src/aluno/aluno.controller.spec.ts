import { Test, TestingModule } from '@nestjs/testing';
import { AlunoController } from './aluno.controller';
import { AlunoService } from './aluno.service';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface';

const mockAdmin: AuthenticatedUser = {
  id: 'admin-uuid', authUserId: 'auth-admin', nome: 'Admin', email: 'admin@test.com',
  perfil: 'administrador', municipioId: null, escolaIds: [], turmaIds: [], ativo: true,
};

const mockAluno = { id: 'aluno-uuid', nome: 'Test Aluno' };
const mockPaginated = { data: [mockAluno], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } };

describe('AlunoController', () => {
  let controller: AlunoController;
  let service: jest.Mocked<AlunoService>;

  beforeEach(async () => {
    const mockService = {
      findAll: jest.fn().mockResolvedValue(mockPaginated),
      count: jest.fn().mockResolvedValue({ data: { count: 10 } }),
      findOne: jest.fn().mockResolvedValue({ data: mockAluno }),
      create: jest.fn().mockResolvedValue({ data: mockAluno }),
      update: jest.fn().mockResolvedValue({ data: mockAluno }),
      delete: jest.fn().mockResolvedValue({ data: { id: 'aluno-uuid' } }),
      bulkDelete: jest.fn().mockResolvedValue({ data: { count: 2 } }),
      import: jest.fn().mockResolvedValue({ data: { total_importados: 5, total_ignorados: 1 } }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AlunoController],
      providers: [{ provide: AlunoService, useValue: mockService }],
    }).compile();

    controller = module.get<AlunoController>(AlunoController);
    service = module.get(AlunoService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('findAll delegates to service', async () => {
    const query = { page: 1, limit: 20 } as any;
    const result = await controller.findAll(mockAdmin, query);
    expect(result.data).toHaveLength(1);
    expect(service.findAll).toHaveBeenCalledWith(mockAdmin, query);
  });

  it('count delegates to service', async () => {
    const query = { is_transferido: false } as any;
    const result = await controller.count(mockAdmin, query);
    expect(result.data.count).toBe(10);
  });

  it('findOne delegates to service', async () => {
    const result = await controller.findOne(mockAdmin, 'aluno-uuid');
    expect(result.data.id).toBe('aluno-uuid');
  });

  it('create delegates to service', async () => {
    const dto = { nome: 'New', turma_id: 'tid', municipio_id: 'mid' };
    await controller.create(mockAdmin, dto);
    expect(service.create).toHaveBeenCalledWith(mockAdmin, dto);
  });

  it('update delegates to service', async () => {
    const dto = { nome: 'Updated' };
    await controller.update(mockAdmin, 'aluno-uuid', dto);
    expect(service.update).toHaveBeenCalledWith(mockAdmin, 'aluno-uuid', dto);
  });

  it('remove delegates to service', async () => {
    await controller.remove(mockAdmin, 'aluno-uuid');
    expect(service.delete).toHaveBeenCalledWith(mockAdmin, 'aluno-uuid');
  });

  it('bulkDelete delegates to service', async () => {
    await controller.bulkDelete(mockAdmin, { ids: ['a', 'b'] });
    expect(service.bulkDelete).toHaveBeenCalledWith(mockAdmin, ['a', 'b']);
  });

  it('import delegates to service', async () => {
    const dto = { rows: [{ nome: 'X' }], municipio_id: 'm', escola_id: 'e', turma_id: 't' };
    const result = await controller.import(mockAdmin, dto);
    expect(result.data.total_importados).toBe(5);
  });
});
