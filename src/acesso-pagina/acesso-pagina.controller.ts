import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface.js';
import { AcessoPaginaService } from './acesso-pagina.service.js';
import {
  RegistrarAcessoPaginaDto,
  ResumoAcessoPaginaQueryDto,
} from './dto/acesso-pagina.dto.js';

@ApiTags('Acesso por página')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('acesso-pagina')
export class AcessoPaginaController {
  constructor(private readonly service: AcessoPaginaService) {}

  // Disparado a cada navegação: não deve consumir a cota do throttler das telas.
  @SkipThrottle()
  @Post()
  @ApiOperation({ summary: 'Registrar acesso do usuário logado a uma página' })
  registrar(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegistrarAcessoPaginaDto,
  ) {
    return this.service.registrar(user, dto.pagina);
  }

  @Get('resumo')
  @ApiOperation({
    summary:
      'Acessos por página, município, usuário e dia (só administrador/ilm)',
  })
  resumo(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ResumoAcessoPaginaQueryDto,
  ) {
    return this.service.resumo(user, query);
  }
}
