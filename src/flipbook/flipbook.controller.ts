import {
  Body,
  Controller,
  Delete,
  Get,
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
import { FlipbookService } from './flipbook.service.js';
import { CreateFlipbookDto } from './dto/create-flipbook.dto.js';
import { UpdateFlipbookDto } from './dto/update-flipbook.dto.js';

@ApiTags('Flipbooks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('flipbooks')
export class FlipbookController {
  constructor(private readonly flipbookService: FlipbookService) {}

  @Get()
  @ApiOperation({ summary: 'Listar flipbooks (ilm/admin: todos; demais: só os liberados no próprio usuário)' })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.flipbookService.findAll(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar flipbook por ID' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.flipbookService.findOne(user, id);
  }

  @Post()
  @ApiOperation({ summary: 'Criar flipbook (ilm/admin)' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateFlipbookDto,
  ) {
    return this.flipbookService.create(user, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar flipbook (ilm/admin)' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFlipbookDto,
  ) {
    return this.flipbookService.update(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Apagar flipbook (ilm/admin)' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.flipbookService.remove(user, id);
  }
}
