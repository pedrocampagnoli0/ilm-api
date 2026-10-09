import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface.js';
import type { UpdateAssessoraMetaDto } from './dto/update-meta.dto.js';

export const META_PADRAO = { meta_semanal: 25, limite_verde: 18, limite_amarelo: 12 };

function assertAdmin(user: AuthenticatedUser) {
  if (user.perfil !== 'ilm' && user.perfil !== 'administrador') {
    throw new ForbiddenException('Apenas perfis ilm ou administrador podem acessar a meta de reuniões.');
  }
}

@Injectable()
export class AssessoraMetaReunioesService {
  constructor(private readonly prisma: PrismaService) {}

  async get(user: AuthenticatedUser) {
    assertAdmin(user);
    try {
      const row = await this.prisma.assessora_meta_reunioes.findUnique({
        where: { id: true },
        select: { meta_semanal: true, limite_verde: true, limite_amarelo: true },
      });
      return { data: row ?? META_PADRAO };
    } catch (e) {
      // P2021 = tabela inexistente (API publicada antes da migration) → padrão.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2021') {
        return { data: META_PADRAO };
      }
      throw e;
    }
  }

  async update(user: AuthenticatedUser, dto: UpdateAssessoraMetaDto) {
    assertAdmin(user);
    const { meta_semanal, limite_verde, limite_amarelo } = dto;
    if (!(limite_amarelo < limite_verde && limite_verde <= meta_semanal)) {
      throw new BadRequestException(
        'O limite amarelo deve ser menor que o verde, e o verde menor ou igual à meta.',
      );
    }
    const data = { meta_semanal, limite_verde, limite_amarelo, updated_by: user.id, updated_at: new Date() };
    await this.prisma.assessora_meta_reunioes.upsert({
      where: { id: true },
      create: { id: true, ...data },
      update: data,
    });
    return { data: { meta_semanal, limite_verde, limite_amarelo } };
  }
}
