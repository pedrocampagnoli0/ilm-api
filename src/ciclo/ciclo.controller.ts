import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/auth/guards/jwt-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';

@ApiTags('Ciclos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ciclos')
export class CicloController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Listar ciclos (referência)' })
  async findAll() {
    const ciclos = await this.prisma.ciclo.findMany({
      orderBy: { nome: 'asc' },
    });
    return { data: ciclos };
  }
}
