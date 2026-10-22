import { Module } from '@nestjs/common';
import { FluenciaController } from './fluencia.controller.js';
import { FluenciaService } from './fluencia.service.js';
import { ResultadoAvaliacaoModule } from '../resultado-avaliacao/resultado-avaliacao.module.js';
import { CaslModule } from '../common/casl/casl.module.js';

@Module({
  imports: [ResultadoAvaliacaoModule, CaslModule],
  controllers: [FluenciaController],
  providers: [FluenciaService],
})
export class FluenciaModule {}
