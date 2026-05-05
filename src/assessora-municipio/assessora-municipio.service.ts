import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface.js';

export interface AssessoraSummary {
  usuario_id: string;
  nome: string;
  email: string;
  perfil: string;
  municipio_ids: string[];
}

@Injectable()
export class AssessoraMunicipioService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns all ilm/administrador users with their current município assignment list. */
  async list(user: AuthenticatedUser): Promise<{ data: AssessoraSummary[] }> {
    if (user.perfil !== 'ilm' && user.perfil !== 'administrador') {
      throw new ForbiddenException('Apenas perfis ilm ou administrador podem listar assessoras.');
    }

    const usuarios = await this.prisma.usuario.findMany({
      where: {
        ativo: true,
        perfil: { nome: { in: ['ilm', 'administrador'] } },
      },
      include: {
        perfil: true,
        assessora_municipios: { select: { municipio_id: true } },
      },
      orderBy: [{ nome: 'asc' }],
    });

    const data = usuarios.map((u) => ({
      usuario_id: u.id,
      nome: u.nome,
      email: u.email,
      perfil: u.perfil.nome,
      municipio_ids: u.assessora_municipios.map((am) => am.municipio_id),
    }));

    return { data };
  }

  /**
   * Replaces the entire município set for the given assessora. Only `administrador`
   * may write (matches RLS policy). Validates target is ilm/admin.
   */
  async set(user: AuthenticatedUser, usuarioId: string, municipioIds: string[]) {
    if (user.perfil !== 'administrador') {
      throw new ForbiddenException('Apenas administrador pode editar atribuições');
    }

    const target = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      include: { perfil: true },
    });
    if (!target) throw new NotFoundException('Usuário não encontrado');
    if (target.perfil.nome !== 'ilm' && target.perfil.nome !== 'administrador') {
      throw new BadRequestException(
        `Apenas perfis ilm ou administrador podem ser assessoras (perfil: ${target.perfil.nome})`,
      );
    }

    // Validate all municípios exist
    if (municipioIds.length > 0) {
      const municipios = await this.prisma.municipio.findMany({
        where: { id: { in: municipioIds } },
        select: { id: true },
      });
      if (municipios.length !== municipioIds.length) {
        const found = new Set(municipios.map((m) => m.id));
        const missing = municipioIds.filter((id) => !found.has(id));
        throw new BadRequestException(
          `Município(s) não encontrado(s): ${missing.join(', ')}`,
        );
      }
    }

    await this.prisma.$transaction([
      this.prisma.assessora_municipio.deleteMany({ where: { usuario_id: usuarioId } }),
      ...(municipioIds.length > 0
        ? [
            this.prisma.assessora_municipio.createMany({
              data: municipioIds.map((m) => ({
                usuario_id: usuarioId,
                municipio_id: m,
                created_by: user.id,
              })),
            }),
          ]
        : []),
    ]);

    return { data: { usuario_id: usuarioId, municipio_ids: municipioIds } };
  }
}
