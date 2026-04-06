import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface.js';
import { ResultadoAvaliacaoService } from './resultado-avaliacao.service.js';
import { ListResultadosQueryDto } from './dto/list-resultados-query.dto.js';
import { UpsertBatchDto } from './dto/upsert-batch.dto.js';

@ApiTags('Resultados Avaliação')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('resultados-avaliacao')
export class ResultadoAvaliacaoController {
  constructor(private readonly resultadoService: ResultadoAvaliacaoService) {}

  @Get()
  @ApiOperation({ summary: 'Listar resultados (paginado, com filtros)' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListResultadosQueryDto,
  ) {
    return this.resultadoService.findAll(user, query);
  }

  @Post('upsert-batch')
  @ApiOperation({ summary: 'Upsert resultados em lote (wrapper do RPC)' })
  upsertBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertBatchDto,
  ) {
    return this.resultadoService.upsertBatch(user, dto);
  }

  @Post('radar')
  @ApiOperation({ summary: 'Dados para radar report (F2 alunos com nível 1-2)' })
  radar(
    @Body() body: { avaliacao_ids: string[]; ciclo_id: string },
  ) {
    return this.resultadoService.radar(body.avaliacao_ids, body.ciclo_id);
  }

  @Get('history/:turmaId/:avaliacaoId')
  @ApiOperation({ summary: 'Histórico de alterações de avaliação' })
  getChangeHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('turmaId', ParseUUIDPipe) turmaId: string,
    @Param('avaliacaoId', ParseUUIDPipe) avaliacaoId: string,
  ) {
    return this.resultadoService.getChangeHistory(user, turmaId, avaliacaoId);
  }

  @Delete('blank/:alunoId')
  @ApiOperation({ summary: 'Excluir resultados em branco de um aluno' })
  deleteBlankForAluno(
    @Param('alunoId', ParseUUIDPipe) alunoId: string,
  ) {
    return this.resultadoService.deleteBlankForAluno(alunoId);
  }

  @Delete(':avaliacaoId/:alunoId')
  @ApiOperation({ summary: 'Excluir resultados de um aluno para uma avaliação' })
  deleteForAlunoAvaliacao(
    @Param('avaliacaoId', ParseUUIDPipe) avaliacaoId: string,
    @Param('alunoId', ParseUUIDPipe) alunoId: string,
  ) {
    return this.resultadoService.deleteForAlunoAvaliacao(avaliacaoId, alunoId);
  }
}
