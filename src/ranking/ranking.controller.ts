import { Controller, Delete, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface.js';
import { RankingService } from './ranking.service.js';
import { ListRankingsQueryDto } from './dto/list-rankings-query.dto.js';

@ApiTags('Rankings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('rankings')
export class RankingController {
  constructor(private readonly rankingService: RankingService) {}

  @Get('professores')
  @ApiOperation({ summary: 'Listar ranking de professores' })
  findProfessores(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListRankingsQueryDto,
  ) {
    return this.rankingService.findProfessores(user, query);
  }

  @Get('escolas')
  @ApiOperation({ summary: 'Listar ranking de escolas' })
  findEscolas(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListRankingsQueryDto,
  ) {
    return this.rankingService.findEscolas(user, query);
  }

  @Get('last-updates')
  @ApiOperation({ summary: 'Últimas atualizações de ranking por município' })
  getLastUpdates() {
    return this.rankingService.getLastUpdates();
  }

  @Delete('municipio/:municipioId')
  @ApiOperation({ summary: 'Limpar rankings de um município' })
  deleteForMunicipio(
    @CurrentUser() user: AuthenticatedUser,
    @Param('municipioId', ParseUUIDPipe) municipioId: string,
  ) {
    return this.rankingService.deleteForMunicipio(user, municipioId);
  }
}
