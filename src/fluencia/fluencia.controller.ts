import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface.js';
import { FluenciaService } from './fluencia.service.js';
import { CriarAplicacaoDto } from './dto/criar-aplicacao.dto.js';
import { ListarAplicacoesQueryDto } from './dto/listar-aplicacoes-query.dto.js';

@ApiTags('Fluência')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('fluencia/aplicacoes')
export class FluenciaController {
  constructor(private readonly service: FluenciaService) {}

  @Get()
  @ApiOperation({
    summary:
      'Lista aplicações de fluência por turmas (relatório) ou por aluno (formas já aplicadas), no escopo de acesso do usuário',
  })
  async listar(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListarAplicacoesQueryDto,
  ) {
    return { data: await this.service.listar(user, query) };
  }

  @Post()
  @ApiOperation({
    summary:
      'Salva uma aplicação da avaliação de fluência (idempotente por id) e grava o PPM na avaliação aberta',
  })
  async criar(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CriarAplicacaoDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { created, data } = await this.service.criar(user, dto);
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return { data };
  }
}
