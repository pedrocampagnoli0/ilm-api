import {
  Body,
  Controller,
  Delete,
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
import { AlunoService } from './aluno.service.js';
import { CreateAlunoDto } from './dto/create-aluno.dto.js';
import { UpdateAlunoDto } from './dto/update-aluno.dto.js';
import { ListAlunosQueryDto } from './dto/list-alunos-query.dto.js';
import { BulkDeleteAlunosDto } from './dto/bulk-delete-alunos.dto.js';
import { ImportAlunosDto } from './dto/import-alunos.dto.js';

@ApiTags('Alunos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('alunos')
export class AlunoController {
  constructor(private readonly alunoService: AlunoService) {}

  @Get()
  @ApiOperation({ summary: 'Listar alunos (paginado, com filtros)' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAlunosQueryDto,
  ) {
    return this.alunoService.findAll(user, query);
  }

  @Get('count')
  @ApiOperation({ summary: 'Contar alunos (com filtros)' })
  count(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAlunosQueryDto,
  ) {
    return this.alunoService.count(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar aluno por ID' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.alunoService.findOne(user, id);
  }

  @Post()
  @ApiOperation({ summary: 'Criar aluno' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAlunoDto,
  ) {
    return this.alunoService.create(user, dto);
  }

  @Post('import')
  @ApiOperation({ summary: 'Importar alunos em lote' })
  import(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ImportAlunosDto,
  ) {
    return this.alunoService.import(user, dto);
  }

  @Get('import-batches')
  @ApiOperation({ summary: 'Listar batches de importação de alunos' })
  listImportBatches(@CurrentUser() user: AuthenticatedUser) {
    return this.alunoService.listImportBatches(user);
  }

  @Post('import-batches')
  @ApiOperation({ summary: 'Criar batch de importação de alunos' })
  createImportBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { municipio_id: string },
  ) {
    return this.alunoService.createImportBatch(user, body.municipio_id);
  }

  @Patch('import-batches/:id')
  @ApiOperation({ summary: 'Finalizar batch de importação' })
  finalizeImportBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { total_turmas: number; alunos_importados: number; alunos_ignorados: number; erros: number },
  ) {
    return this.alunoService.finalizeImportBatch(user, id, body);
  }

  @Post('import-batches/:id/undo')
  @ApiOperation({ summary: 'Desfazer importação de alunos' })
  undoImportBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.alunoService.undoImportBatch(user, id);
  }

  @Post('bulk-delete')
  @ApiOperation({ summary: 'Excluir múltiplos alunos' })
  bulkDelete(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkDeleteAlunosDto,
  ) {
    return this.alunoService.bulkDelete(user, dto.ids);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar aluno' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAlunoDto,
  ) {
    return this.alunoService.update(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Excluir aluno' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.alunoService.delete(user, id);
  }
}
