import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface.js';
import { AssessoraMetaReunioesService } from './assessora-meta-reunioes.service.js';
import { UpdateAssessoraMetaDto } from './dto/update-meta.dto.js';

@ApiTags('Assessora meta reuniões')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('assessora-meta-reunioes')
export class AssessoraMetaReunioesController {
  constructor(private readonly service: AssessoraMetaReunioesService) {}

  @Get()
  @ApiOperation({ summary: 'Meta semanal de reuniões (padrão 25/18/12 se não houver linha)' })
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.service.get(user);
  }

  @Put()
  @ApiOperation({ summary: 'Atualizar meta semanal de reuniões (ilm/admin)' })
  update(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateAssessoraMetaDto) {
    return this.service.update(user, dto);
  }
}
