import { Module } from '@nestjs/common';
import { UsuarioImpersonatePermController } from './usuario-impersonate-perm.controller.js';
import { UsuarioImpersonatePermService } from './usuario-impersonate-perm.service.js';

@Module({
  controllers: [UsuarioImpersonatePermController],
  providers: [UsuarioImpersonatePermService],
})
export class UsuarioImpersonatePermModule {}
