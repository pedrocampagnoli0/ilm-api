import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface.js';

export interface ImpersonatePermSummary {
  usuario_id: string;
  granted_at: string;
  granted_by: string | null;
}

@Injectable()
export class UsuarioImpersonatePermService {
  constructor(private readonly prisma: PrismaService) {}

  /** Retorna se o usuário autenticado pode usar impersonate.
   *  Requer perfil 'administrador' E uma linha em usuario_impersonate_perm. */
  async me(
    user: AuthenticatedUser,
  ): Promise<{ data: { can_impersonate: boolean } }> {
    if (user.perfil !== 'administrador') {
      return { data: { can_impersonate: false } };
    }
    const row = await this.prisma.usuario_impersonate_perm.findUnique({
      where: { usuario_id: user.id },
      select: { usuario_id: true },
    });
    return { data: { can_impersonate: !!row } };
  }

  /** Lista todas as permissões. Somente administrador. */
  async list(
    user: AuthenticatedUser,
  ): Promise<{ data: ImpersonatePermSummary[] }> {
    if (user.perfil !== 'administrador') {
      throw new ForbiddenException(
        'Apenas administrador pode listar permissões de impersonate.',
      );
    }
    const rows = await this.prisma.usuario_impersonate_perm.findMany({
      orderBy: { granted_at: 'desc' },
    });
    return {
      data: rows.map((r) => ({
        usuario_id: r.usuario_id,
        granted_at: r.granted_at.toISOString(),
        granted_by: r.granted_by,
      })),
    };
  }

  /** Retorna a permissão de um usuário específico. Administrador (qualquer alvo) ou self. */
  async getOne(
    user: AuthenticatedUser,
    usuarioId: string,
  ): Promise<{ data: ImpersonatePermSummary | null }> {
    if (user.perfil !== 'administrador' && user.id !== usuarioId) {
      throw new ForbiddenException(
        'Sem permissão para consultar esta permissão.',
      );
    }
    const row = await this.prisma.usuario_impersonate_perm.findUnique({
      where: { usuario_id: usuarioId },
    });
    return {
      data: row
        ? {
            usuario_id: row.usuario_id,
            granted_at: row.granted_at.toISOString(),
            granted_by: row.granted_by,
          }
        : null,
    };
  }

  /** Concede permissão. Apenas administrador. Alvo deve ter perfil 'administrador'. */
  async grant(
    user: AuthenticatedUser,
    usuarioId: string,
  ): Promise<{ data: ImpersonatePermSummary }> {
    if (user.perfil !== 'administrador') {
      throw new ForbiddenException(
        'Apenas administrador pode conceder impersonate.',
      );
    }
    const target = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      include: { perfil: true },
    });
    if (!target) throw new NotFoundException('Usuário não encontrado');
    if (target.perfil.nome !== 'administrador') {
      throw new BadRequestException(
        `Apenas perfil administrador pode receber impersonate (perfil atual: ${target.perfil.nome})`,
      );
    }

    const row = await this.prisma.usuario_impersonate_perm.upsert({
      where: { usuario_id: usuarioId },
      update: { granted_by: user.id, granted_at: new Date() },
      create: { usuario_id: usuarioId, granted_by: user.id },
    });
    return {
      data: {
        usuario_id: row.usuario_id,
        granted_at: row.granted_at.toISOString(),
        granted_by: row.granted_by,
      },
    };
  }

  /** Revoga permissão. Apenas administrador. */
  async revoke(
    user: AuthenticatedUser,
    usuarioId: string,
  ): Promise<{ data: { usuario_id: string } }> {
    if (user.perfil !== 'administrador') {
      throw new ForbiddenException(
        'Apenas administrador pode revogar impersonate.',
      );
    }
    await this.prisma.usuario_impersonate_perm.deleteMany({
      where: { usuario_id: usuarioId },
    });
    return { data: { usuario_id: usuarioId } };
  }
}
