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
import { EventoService } from './evento.service.js';
import { InscricaoService } from './inscricao.service.js';
import { CreateInscricaoDto } from './dto/create-inscricao.dto.js';
import { CreateEventoDto } from './dto/create-evento.dto.js';
import { UpdateEventoDto } from './dto/update-evento.dto.js';
import { PublicarEventoDto } from './dto/publicar-evento.dto.js';
import { ListEventosQueryDto } from './dto/list-eventos-query.dto.js';

@ApiTags('Formações — eventos (admin)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin/formacoes/eventos')
export class EventoController {
  constructor(
    private readonly eventoService: EventoService,
    private readonly inscricaoService: InscricaoService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Listar eventos com vagas, vendidas, receita e selo calculado',
  })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListEventosQueryDto,
  ) {
    return this.eventoService.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de um evento com seus lotes' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.eventoService.findOne(user, id);
  }

  @Get(':id/vendas')
  @ApiOperation({ summary: 'Extrato de vendas da turma' })
  vendas(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.eventoService.vendas(user, id);
  }

  @Post(':id/inscricoes')
  @ApiOperation({
    summary:
      'Lançar inscrição de cortesia (voucher, multiplicadora, parceria) — ocupa vaga, valor zero',
  })
  criarInscricao(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateInscricaoDto,
  ) {
    return this.inscricaoService.create(user, id, dto);
  }

  @Delete(':id/inscricoes/:cobrancaId')
  @ApiOperation({
    summary: 'Apagar inscrição de cortesia lançada por engano (só cortesia)',
  })
  removerInscricao(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('cobrancaId') cobrancaId: string,
  ) {
    return this.inscricaoService.remove(user, id, cobrancaId);
  }

  @Post()
  @ApiOperation({ summary: 'Criar evento' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEventoDto,
  ) {
    return this.eventoService.create(user, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Editar evento (o slug é permanente e não entra aqui)',
  })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventoDto,
  ) {
    return this.eventoService.update(user, id, dto);
  }

  @Post(':id/publicar')
  @ApiOperation({ summary: 'Publicar / despublicar no site' })
  publicar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PublicarEventoDto,
  ) {
    return this.eventoService.publicar(user, id, dto.publicado);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Apagar evento (recusa se já houver venda)' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.eventoService.remove(user, id);
  }
}
