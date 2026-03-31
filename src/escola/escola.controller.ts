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
import { EscolaService } from './escola.service.js';
import { CreateEscolaDto } from './dto/create-escola.dto.js';
import { UpdateEscolaDto } from './dto/update-escola.dto.js';
import { ListEscolasQueryDto } from './dto/list-escolas-query.dto.js';
import { BulkInactivateDto } from './dto/bulk-inactivate.dto.js';

@ApiTags('Escolas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('escolas')
export class EscolaController {
  constructor(private readonly escolaService: EscolaService) {}

  @Get()
  @ApiOperation({ summary: 'Listar escolas (paginado, com filtros)' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListEscolasQueryDto,
  ) {
    return this.escolaService.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar escola por ID' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.escolaService.findOne(user, id);
  }

  @Post()
  @ApiOperation({ summary: 'Criar escola' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEscolaDto,
  ) {
    return this.escolaService.create(user, dto);
  }

  @Patch('bulk-inactivate')
  @ApiOperation({ summary: 'Inativar múltiplas escolas' })
  bulkInactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkInactivateDto,
  ) {
    return this.escolaService.bulkInactivate(user, dto.ids);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar escola' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEscolaDto,
  ) {
    return this.escolaService.update(user, id, dto);
  }
}