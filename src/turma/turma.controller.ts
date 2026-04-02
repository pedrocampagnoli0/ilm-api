import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface.js';
import { TurmaService } from './turma.service.js';
import { CreateTurmaDto } from './dto/create-turma.dto.js';
import { UpdateTurmaDto } from './dto/update-turma.dto.js';
import { ListTurmasQueryDto } from './dto/list-turmas-query.dto.js';
import { BulkInactivateTurmasDto } from './dto/bulk-inactivate-turmas.dto.js';

@ApiTags('Turmas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('turmas')
export class TurmaController {
  constructor(private readonly turmaService: TurmaService) {}

  @Get()
  @ApiOperation({ summary: 'Listar turmas (paginado, com filtros, CASL-scoped)' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListTurmasQueryDto,
  ) {
    return this.turmaService.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar turma por ID' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.turmaService.findOne(user, id);
  }

  @Post()
  @ApiOperation({ summary: 'Criar turma' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTurmaDto,
  ) {
    return this.turmaService.create(user, dto);
  }

  @Patch('bulk-inactivate')
  @ApiOperation({ summary: 'Inativar múltiplas turmas' })
  bulkInactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkInactivateTurmasDto,
  ) {
    return this.turmaService.bulkInactivate(user, dto.ids);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar turma' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTurmaDto,
  ) {
    return this.turmaService.update(user, id, dto);
  }
}
