import { Test, TestingModule } from '@nestjs/testing';
import { UsuarioController } from './usuario.controller';
import { UsuarioService } from './usuario.service';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface';

const mockAdmin: AuthenticatedUser = {
  id: 'admin-uuid',
  authUserId: 'auth-admin-uuid',
  nome: 'Admin',
  email: 'admin@test.com',
  perfil: 'administrador',
  municipioId: null,
  escolaIds: [],
  turmaIds: [],
  ativo: true,
};

const mockUsuarioResponse = {
  data: {
    id: 'user-uuid',
    nome: 'Test User',
    email: 'test@test.com',
    perfil: { id: 'perfil-uuid', nome: 'professor' },
    municipio: { id: 'muni-uuid', nome: 'Test', uf_sigla: 'SP' },
  },
};

const mockPaginatedResponse = {
  data: [mockUsuarioResponse.data],
  meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
};

describe('UsuarioController', () => {
  let controller: UsuarioController;
  let service: jest.Mocked<UsuarioService>;

  beforeEach(async () => {
    const mockService = {
      findAll: jest.fn().mockResolvedValue(mockPaginatedResponse),
      findOne: jest.fn().mockResolvedValue(mockUsuarioResponse),
      findByAuthUserId: jest.fn().mockResolvedValue(mockUsuarioResponse),
      create: jest.fn().mockResolvedValue(mockUsuarioResponse),
      update: jest.fn().mockResolvedValue(mockUsuarioResponse),
      delete: jest.fn().mockResolvedValue({ data: { id: 'user-uuid' } }),
      bulkInactivate: jest.fn().mockResolvedValue({ data: { count: 1 } }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsuarioController],
      providers: [{ provide: UsuarioService, useValue: mockService }],
    }).compile();

    controller = module.get<UsuarioController>(UsuarioController);
    service = module.get(UsuarioService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated usuarios', async () => {
      const query = { page: 1, limit: 20 } as any;
      const result = await controller.findAll(mockAdmin, query);
      expect(result.data).toHaveLength(1);
      expect(service.findAll).toHaveBeenCalledWith(mockAdmin, query);
    });
  });

  describe('findMe', () => {
    it('should return the authenticated user profile', async () => {
      const result = await controller.findMe(mockAdmin);
      expect(result.data.id).toBe('user-uuid');
      expect(service.findByAuthUserId).toHaveBeenCalledWith('auth-admin-uuid');
    });
  });

  describe('findOne', () => {
    it('should return a single usuario', async () => {
      const result = await controller.findOne(mockAdmin, 'user-uuid');
      expect(result.data.id).toBe('user-uuid');
      expect(service.findOne).toHaveBeenCalledWith(mockAdmin, 'user-uuid');
    });
  });

  describe('create', () => {
    it('should create a usuario', async () => {
      const dto = { nome: 'New User', email: 'new@test.com', perfil_id: 'perfil-uuid' };
      const result = await controller.create(mockAdmin, dto);
      expect(result.data).toBeDefined();
      expect(service.create).toHaveBeenCalledWith(mockAdmin, dto);
    });
  });

  describe('update', () => {
    it('should update a usuario', async () => {
      const dto = { nome: 'Updated' };
      const result = await controller.update(mockAdmin, 'user-uuid', dto);
      expect(result.data).toBeDefined();
      expect(service.update).toHaveBeenCalledWith(mockAdmin, 'user-uuid', dto);
    });
  });

  describe('remove', () => {
    it('should delete a usuario', async () => {
      const result = await controller.remove(mockAdmin, 'user-uuid');
      expect(result.data.id).toBe('user-uuid');
      expect(service.delete).toHaveBeenCalledWith(mockAdmin, 'user-uuid');
    });
  });

  describe('bulkInactivate', () => {
    it('should inactivate multiple usuarios', async () => {
      const result = await controller.bulkInactivate(mockAdmin, { ids: ['user-uuid'] });
      expect(result.data.count).toBe(1);
      expect(service.bulkInactivate).toHaveBeenCalledWith(mockAdmin, ['user-uuid']);
    });
  });
});
