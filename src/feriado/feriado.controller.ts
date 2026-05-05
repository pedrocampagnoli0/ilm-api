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
import { FeriadoService } from './feriado.service.js';
import { CreateFeriadoDto } from './dto/create-feriado.dto.js';
import { UpdateFeriadoDto } from './dto/update-feriado.dto.js';
import { ListFeriadosQueryDto } from './dto/list-feriados-query.dto.js';

@ApiTags('Feriados')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('feriados')
export class FeriadoController {
  constructor(private readonly feriadoService: FeriadoService) {}

  @Get()
  @ApiOperation({ summary: 'Listar feriados (nacional + UF + município)' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListFeriadosQueryDto,
  ) {
    return this.feriadoService.findAll(user, query);
  }

  @Post()
  @ApiOperation({ summary: 'Criar feriado (ilm/admin)' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateFeriadoDto,
  ) {
    return this.feriadoService.create(user, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar feriado' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFeriadoDto,
  ) {
    return this.feriadoService.update(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Apagar feriado' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.feriadoService.remove(user, id);
  }
}
