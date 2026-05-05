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
import { ContatoPrincipalService } from './contato-principal.service.js';
import { CreateContatoPrincipalDto } from './dto/create-contato-principal.dto.js';
import { UpdateContatoPrincipalDto } from './dto/update-contato-principal.dto.js';
import { ListContatosPrincipaisQueryDto } from './dto/list-contatos-query.dto.js';

@ApiTags('Contatos Principais')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('contatos-principais')
export class ContatoPrincipalController {
  constructor(private readonly contatoService: ContatoPrincipalService) {}

  @Get()
  @ApiOperation({ summary: 'Listar contatos principais por município' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListContatosPrincipaisQueryDto,
  ) {
    return this.contatoService.findAll(user, query);
  }

  @Post()
  @ApiOperation({ summary: 'Criar contato principal' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateContatoPrincipalDto,
  ) {
    return this.contatoService.create(user, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar contato principal' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContatoPrincipalDto,
  ) {
    return this.contatoService.update(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Apagar contato principal' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.contatoService.remove(user, id);
  }
}
