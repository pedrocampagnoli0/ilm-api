import { Module } from '@nestjs/common';
import { ResultadoAvaliacaoController } from './resultado-avaliacao.controller.js';
import { ResultadoAvaliacaoService } from './resultado-avaliacao.service.js';
import { CaslModule } from '../common/casl/casl.module.js';

@Module({
  imports: [CaslModule],
  controllers: [ResultadoAvaliacaoController],
  providers: [ResultadoAvaliacaoService],
})
export class ResultadoAvaliacaoModule {}
