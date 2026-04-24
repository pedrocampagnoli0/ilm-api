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
import { AvaliacaoService } from './avaliacao.service.js';
import { CreateAvaliacaoDto } from './dto/create-avaliacao.dto.js';
import { UpdateAvaliacaoDto } from './dto/update-avaliacao.dto.js';
import { ListAvaliacoesQueryDto } from './dto/list-avaliacoes-query.dto.js';

@ApiTags('Avaliacoes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('avaliacoes')
export class AvaliacaoController {
  constructor(private readonly avaliacaoService: AvaliacaoService) {}

  @Get()
  @ApiOperation({ summary: 'Listar avaliações (paginado, com filtros)' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAvaliacoesQueryDto,
  ) {
    return this.avaliacaoService.findAll(user, query);
  }

  @Get('tipos')
  @ApiOperation({ summary: 'Listar tipos de avaliação' })
  listTipos() {
    return this.avaliacaoService.listTipos();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar avaliação por ID' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.avaliacaoService.findOne(user, id);
  }

  @Post()
  @ApiOperation({ summary: 'Criar avaliação' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAvaliacaoDto,
  ) {
    return this.avaliacaoService.create(user, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar avaliação' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAvaliacaoDto,
  ) {
    return this.avaliacaoService.update(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Excluir avaliação (e seus resultados)' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.avaliacaoService.delete(user, id);
  }

  @Post('bulk-delete')
  @ApiOperation({ summary: 'Excluir múltiplas avaliações' })
  bulkDelete(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { ids: string[] },
  ) {
    return this.avaliacaoService.bulkDelete(user, body.ids);
  }
}
