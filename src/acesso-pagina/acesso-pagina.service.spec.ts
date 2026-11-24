import { ForbiddenException } from '@nestjs/common';
import { AcessoPaginaService } from './acesso-pagina.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface';

const user = (
  perfil: AuthenticatedUser['perfil'],
  municipioId: string | null = null,
): AuthenticatedUser => ({
  id: 'u',
  authUserId: 'u',
  nome: 'U',
  email: 'u@t.com',
  perfil,
  municipioId,
  escolaIds: [],
  turmaIds: [],
  assessoraMunicipioIds: [],
  ativo: true,
});

describe('AcessoPaginaService', () => {
  const prisma = {
    $queryRaw: jest
      .fn()
      .mockResolvedValue([{ usuarios: 0, acessos: 0, paginas: 0 }]),
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  const service = new AcessoPaginaService(prisma as unknown as PrismaService);
  const sqlEnviado = () => JSON.stringify(prisma.$queryRaw.mock.calls);

  beforeEach(() => jest.clearAllMocks());

  it.each(['professor', 'diretor', 'secretaria'] as const)(
    'nega %s',
    async (perfil) => {
      await expect(service.resumo(user(perfil, 'm'), {})).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    },
  );

  it('ilm lê', async () => {
    await expect(service.resumo(user('ilm'), {})).resolves.toBeDefined();
  });

  it('admin filtra pelo município pedido', async () => {
    await service.resumo(user('administrador'), { municipio_id: 'mun-x' });
    expect(sqlEnviado()).toContain('mun-x');
  });

  it('não registra usuário inativo', async () => {
    await service.registrar(
      { ...user('professor'), ativo: false },
      '/docente/portal',
    );
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });
});
