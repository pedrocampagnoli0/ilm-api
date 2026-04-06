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
import { UsuarioService } from './usuario.service.js';
import { CreateUsuarioDto } from './dto/create-usuario.dto.js';
import { UpdateUsuarioDto } from './dto/update-usuario.dto.js';
import { ListUsuariosQueryDto } from './dto/list-usuarios-query.dto.js';
import { BulkInactivateUsuariosDto } from './dto/bulk-inactivate-usuarios.dto.js';

@ApiTags('Usuarios')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('usuarios')
export class UsuarioController {
  constructor(private readonly usuarioService: UsuarioService) {}

  @Get()
  @ApiOperation({ summary: 'Listar usuários (paginado, com filtros)' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListUsuariosQueryDto,
  ) {
    return this.usuarioService.findAll(user, query);
  }

  @Get('me')
  @ApiOperation({ summary: 'Buscar perfil do usuário autenticado' })
  findMe(@CurrentUser() user: AuthenticatedUser) {
    return this.usuarioService.findByAuthUserId(user.authUserId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar usuário por ID' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.usuarioService.findOne(user, id);
  }

  @Post()
  @ApiOperation({ summary: 'Criar usuário' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateUsuarioDto,
  ) {
    return this.usuarioService.create(user, dto);
  }

  @Patch('bulk-inactivate')
  @ApiOperation({ summary: 'Inativar múltiplos usuários' })
  bulkInactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkInactivateUsuariosDto,
  ) {
    return this.usuarioService.bulkInactivate(user, dto.ids);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar usuário' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUsuarioDto,
  ) {
    return this.usuarioService.update(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Excluir usuário' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.usuarioService.delete(user, id);
  }
}
