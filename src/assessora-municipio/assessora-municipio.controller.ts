import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface.js';
import { AssessoraMunicipioService } from './assessora-municipio.service.js';
import { SetAssessoraMunicipiosDto } from './dto/set-assessora-municipios.dto.js';

@ApiTags('Assessoras-Municípios')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('assessoras')
export class AssessoraMunicipioController {
  constructor(private readonly service: AssessoraMunicipioService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todas as assessoras (ilm/admin) com seus municípios atribuídos' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user);
  }

  @Put(':usuarioId/municipios')
  @ApiOperation({ summary: 'Substituir a lista de municípios de uma assessora (somente administrador)' })
  set(
    @CurrentUser() user: AuthenticatedUser,
    @Param('usuarioId', ParseUUIDPipe) usuarioId: string,
    @Body() dto: SetAssessoraMunicipiosDto,
  ) {
    return this.service.set(user, usuarioId, dto.municipio_ids);
  }
}
