import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface.js';
import { LogLoginService } from './log-login.service.js';
import { ListLogsQueryDto } from './dto/list-logs-query.dto.js';
import { CreateLogDto } from './dto/create-log.dto.js';

@ApiTags('Log Login')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('log-login')
export class LogLoginController {
  constructor(private readonly logLoginService: LogLoginService) {}

  @Get()
  @ApiOperation({ summary: 'Listar logs de login (paginado, com filtros)' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListLogsQueryDto,
  ) {
    return this.logLoginService.findAll(user, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Estatísticas de login (agregadas)' })
  stats(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListLogsQueryDto,
  ) {
    return this.logLoginService.stats(user, query);
  }

  @Post()
  @ApiOperation({ summary: 'Registrar tentativa de login' })
  create(@Body() dto: CreateLogDto) {
    return this.logLoginService.create(dto);
  }
}
