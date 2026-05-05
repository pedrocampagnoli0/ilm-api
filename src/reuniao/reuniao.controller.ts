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
import { ReuniaoService } from './reuniao.service.js';
import { CreateReuniaoDto } from './dto/create-reuniao.dto.js';
import { UpdateReuniaoDto, UpdateReuniaoQueryDto } from './dto/update-reuniao.dto.js';
import { ListReunioesQueryDto } from './dto/list-reunioes-query.dto.js';

@ApiTags('Reuniões')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reunioes')
export class ReuniaoController {
  constructor(private readonly reuniaoService: ReuniaoService) {}

  @Get()
  @ApiOperation({ summary: 'Listar reuniões (filtrado por CASL + janela de tempo)' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListReunioesQueryDto,
  ) {
    return this.reuniaoService.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar reunião por ID (com pessoas)' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reuniaoService.findOne(user, id);
  }

  @Post()
  @ApiOperation({ summary: 'Criar reunião (única) ou série (quando recorrencia é fornecida)' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReuniaoDto,
  ) {
    return this.reuniaoService.create(user, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar reunião — scope=this (default) ou series' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReuniaoDto,
    @Query() query: UpdateReuniaoQueryDto,
  ) {
    return this.reuniaoService.update(user, id, dto, query.scope ?? 'this');
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Apagar reunião — scope=this (default) ou series' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: UpdateReuniaoQueryDto,
  ) {
    return this.reuniaoService.remove(user, id, query.scope ?? 'this');
  }
}
