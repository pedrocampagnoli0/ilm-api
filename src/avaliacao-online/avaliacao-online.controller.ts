import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface.js';
import { AvaliacaoOnlineService } from './avaliacao-online.service.js';
import { IniciarSessaoDto } from './dto/iniciar-sessao.dto.js';
import { SalvarRespostasDto } from './dto/salvar-respostas.dto.js';
import { ListSessoesQueryDto } from './dto/list-sessoes-query.dto.js';

@ApiTags('Avaliação Online')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('avaliacao-online/sessoes')
export class AvaliacaoOnlineController {
  constructor(private readonly service: AvaliacaoOnlineService) {}

  @Get()
  @ApiOperation({ summary: 'Status das sessões de uma turma+avaliação (para o botão "Aplicar Online")' })
  listarPorTurma(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListSessoesQueryDto,
  ) {
    return this.service.listarPorTurma(user, query);
  }

  @Post()
  @ApiOperation({ summary: 'Inicia (ou retoma) a sessão de avaliação online de um aluno' })
  iniciar(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: IniciarSessaoDto,
  ) {
    return this.service.iniciar(user, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca uma sessão (retomar após fechar a aba)' })
  obter(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.obter(user, id);
  }

  @Post(':id/respostas')
  @ApiOperation({ summary: 'Autosave — grava (upsert) as respostas de itens desta sessão' })
  salvarRespostas(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SalvarRespostasDto,
  ) {
    return this.service.salvarRespostas(user, id, dto);
  }

  @Post(':id/concluir')
  @ApiOperation({ summary: 'Calcula o resultado e grava em resultado_avaliacao (mesma RPC do lançamento manual)' })
  concluir(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.concluir(user, id);
  }

  @Post(':id/reiniciar')
  @ApiOperation({ summary: 'Zera as respostas e reabre a sessão para refazer' })
  reiniciar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.reiniciar(user, id);
  }
}
