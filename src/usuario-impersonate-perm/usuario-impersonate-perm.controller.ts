import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface.js';
import { UsuarioImpersonatePermService } from './usuario-impersonate-perm.service.js';
import { GrantImpersonatePermDto } from './dto/grant-impersonate-perm.dto.js';

@ApiTags('Usuário Impersonate Perm')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('usuario-impersonate-perm')
export class UsuarioImpersonatePermController {
  constructor(private readonly service: UsuarioImpersonatePermService) {}

  @Get('me')
  @ApiOperation({
    summary:
      'Verifica se o usuário autenticado pode usar impersonate no Painel da Assessora.',
  })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.service.me(user);
  }

  @Get()
  @ApiOperation({
    summary:
      'Lista todas as permissões de impersonate (somente administrador).',
  })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user);
  }

  @Get(':usuarioId')
  @ApiOperation({
    summary: 'Retorna a permissão de impersonate de um usuário específico.',
  })
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('usuarioId', ParseUUIDPipe) usuarioId: string,
  ) {
    return this.service.getOne(user, usuarioId);
  }

  @Post()
  @ApiOperation({
    summary:
      'Concede permissão de impersonate a um administrador (somente administrador).',
  })
  grant(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GrantImpersonatePermDto,
  ) {
    return this.service.grant(user, dto.usuario_id);
  }

  @Delete(':usuarioId')
  @ApiOperation({
    summary: 'Revoga permissão de impersonate (somente administrador).',
  })
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('usuarioId', ParseUUIDPipe) usuarioId: string,
  ) {
    return this.service.revoke(user, usuarioId);
  }
}
