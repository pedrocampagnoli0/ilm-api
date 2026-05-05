import { Module } from '@nestjs/common';
import { ContatoPrincipalController } from './contato-principal.controller.js';
import { ContatoPrincipalService } from './contato-principal.service.js';
import { CaslModule } from '../common/casl/casl.module.js';

@Module({
  imports: [CaslModule],
  controllers: [ContatoPrincipalController],
  providers: [ContatoPrincipalService],
})
export class ContatoPrincipalModule {}
