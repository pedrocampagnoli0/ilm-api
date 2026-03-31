import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface.js';
import { MunicipioService } from './municipio.service.js';
import { CreateMunicipioDto } from './dto/create-municipio.dto.js';
import { UpdateMunicipioDto } from './dto/update-municipio.dto.js';
import { ListMunicipiosQueryDto } from './dto/list-municipios-query.dto.js';
import { UpdateLivrosAtivosDto } from './dto/update-livros-ativos.dto.js';
import { BulkInactivateMunicipiosDto } from './dto/bulk-inactivate-municipios.dto.js';

@ApiTags('Municípios')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('municipios')
export class MunicipioController {
  constructor(private readonly municipioService: MunicipioService) {}

  @Get('ufs')
  @ApiOperation({ summary: 'Listar UFs (estados brasileiros)' })
  listUfs() {
    return this.municipioService.listUfs();
  }

  @Get()
  @ApiOperation({ summary: 'Listar municípios (paginado, com filtros)' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListMunicipiosQueryDto,
  ) {
    return this.municipioService.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar município por ID' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.municipioService.findOne(user, id);
  }

  @Post()
  @ApiOperation({ summary: 'Criar município' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMunicipioDto,
  ) {
    return this.municipioService.create(user, dto);
  }

  @Patch('bulk-inactivate')
  @ApiOperation({ summary: 'Inativar múltiplos municípios' })
  bulkInactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkInactivateMunicipiosDto,
  ) {
    return this.municipioService.bulkInactivate(user, dto.ids);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar município' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMunicipioDto,
  ) {
    return this.municipioService.update(user, id, dto);
  }

  @Get(':id/livros-ativos')
  @ApiOperation({ summary: 'Listar livros ativos do município' })
  getLivrosAtivos(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.municipioService.getLivrosAtivos(user, id);
  }

  @Put(':id/livros-ativos')
  @ApiOperation({ summary: 'Atualizar livros ativos do município (substituição total)' })
  updateLivrosAtivos(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLivrosAtivosDto,
  ) {
    return this.municipioService.updateLivrosAtivos(user, id, dto);
  }
}
