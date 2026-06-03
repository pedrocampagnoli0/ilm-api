import { Controller, ForbiddenException, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface.js';
import { NutrorSyncService } from './nutror-sync.service.js';

@ApiTags('Nutror sync')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('nutror')
export class NutrorSyncController {
  constructor(private readonly sync: NutrorSyncService) {}

  @Post('sync')
  @ApiOperation({ summary: 'Trigger a full Nutror enrollment sync (admin only)' })
  async runSync(@CurrentUser() user: AuthenticatedUser) {
    if (user.perfil !== 'administrador' && user.perfil !== 'ilm') {
      throw new ForbiddenException('Only administrador/ilm can trigger Nutror sync');
    }
    return this.sync.runFullSync();
  }
}
