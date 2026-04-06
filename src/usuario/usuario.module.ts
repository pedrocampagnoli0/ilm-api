import { Module } from '@nestjs/common';
import { UsuarioController } from './usuario.controller.js';
import { UsuarioService } from './usuario.service.js';
import { CaslModule } from '../common/casl/casl.module.js';

@Module({
  imports: [CaslModule],
  controllers: [UsuarioController],
  providers: [UsuarioService],
})
export class UsuarioModule {}
