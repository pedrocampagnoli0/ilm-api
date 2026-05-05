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
import { ObservacaoService } from './observacao.service.js';
import { CreateObservacaoDto } from './dto/create-observacao.dto.js';
import { UpdateObservacaoDto } from './dto/update-observacao.dto.js';
import { ListObservacoesQueryDto } from './dto/list-observacoes-query.dto.js';

@ApiTags('Observações')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('observacoes')
export class ObservacaoController {
  constructor(private readonly observacaoService: ObservacaoService) {}

  @Get()
  @ApiOperation({ summary: 'Listar observações filtradas por município/pessoa' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListObservacoesQueryDto,
  ) {
    return this.observacaoService.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar observação por ID' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.observacaoService.findOne(user, id);
  }

  @Post()
  @ApiOperation({ summary: 'Criar observação' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateObservacaoDto,
  ) {
    return this.observacaoService.create(user, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar observação' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateObservacaoDto,
  ) {
    return this.observacaoService.update(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Apagar observação' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.observacaoService.remove(user, id);
  }
}
