import { Module } from '@nestjs/common';
import { TentativaContatoController } from './tentativa-contato.controller.js';
import { TentativaContatoService } from './tentativa-contato.service.js';
import { CaslModule } from '../common/casl/casl.module.js';

@Module({
  imports: [CaslModule],
  controllers: [TentativaContatoController],
  providers: [TentativaContatoService],
})
export class TentativaContatoModule {}
