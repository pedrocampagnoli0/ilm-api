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
import { TentativaContatoService } from './tentativa-contato.service.js';
import { CreateTentativaContatoDto } from './dto/create-tentativa-contato.dto.js';
import { UpdateTentativaContatoDto } from './dto/update-tentativa-contato.dto.js';
import { ListTentativasContatoQueryDto } from './dto/list-tentativas-query.dto.js';

@ApiTags('Tentativas de contato')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tentativas-contato')
export class TentativaContatoController {
  constructor(private readonly service: TentativaContatoService) {}

  @Get()
  @ApiOperation({ summary: 'Listar tentativas de contato filtradas por município/pessoa' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListTentativasContatoQueryDto,
  ) {
    return this.service.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar tentativa por ID' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(user, id);
  }

  @Post()
  @ApiOperation({ summary: 'Registrar tentativa de contato' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTentativaContatoDto,
  ) {
    return this.service.create(user, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar tentativa' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTentativaContatoDto,
  ) {
    return this.service.update(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Apagar tentativa' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(user, id);
  }
}
