import { Module } from '@nestjs/common';
import { AvaliacaoController } from './avaliacao.controller.js';
import { AvaliacaoService } from './avaliacao.service.js';
import { CaslModule } from '../common/casl/casl.module.js';

@Module({
  imports: [CaslModule],
  controllers: [AvaliacaoController],
  providers: [AvaliacaoService],
})
export class AvaliacaoModule {}
