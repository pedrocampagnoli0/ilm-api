import { Module } from '@nestjs/common';
import { AvaliacaoOnlineController } from './avaliacao-online.controller.js';
import { AvaliacaoOnlineService } from './avaliacao-online.service.js';
import { ResultadoAvaliacaoModule } from '../resultado-avaliacao/resultado-avaliacao.module.js';

@Module({
  imports: [ResultadoAvaliacaoModule],
  controllers: [AvaliacaoOnlineController],
  providers: [AvaliacaoOnlineService],
})
export class AvaliacaoOnlineModule {}
