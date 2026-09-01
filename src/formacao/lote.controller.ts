import {
  Body,
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface.js';
import { LoteService } from './lote.service.js';
import { CreateLoteDto } from './dto/create-lote.dto.js';
import { UpdateLoteDto } from './dto/update-lote.dto.js';

@ApiTags('Formações — lotes (admin)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin/formacoes/lotes')
export class LoteController {
  constructor(private readonly loteService: LoteService) {}

  @Post()
  @ApiOperation({ summary: 'Criar lote (individual ou pacote em grupo)' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateLoteDto) {
    return this.loteService.create(user, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Editar lote — preço e data-limite são recusados se já houver checkout ativo',
  })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLoteDto,
  ) {
    return this.loteService.update(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Apagar lote (recusa se houver venda ou checkout ativo)' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.loteService.remove(user, id);
  }

  @Post(':id/checkout')
  @ApiOperation({
    summary: 'Criar o link de pagamento do lote no PagBank',
    description:
      'Carimba o checkout com lote:<uuid> — é esse carimbo que faz a venda contar vaga. Depois de criar, é preciso rodar sync-eventos no site e republicar.',
  })
  criarCheckout(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.loteService.criarCheckout(user, id);
  }

  @Delete(':id/checkout')
  @ApiOperation({ summary: 'Inativar o link de pagamento (o link para de vender)' })
  inativarCheckout(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.loteService.inativarCheckout(user, id);
  }
}
