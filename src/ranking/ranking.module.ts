import { Module } from '@nestjs/common';
import { RankingController } from './ranking.controller.js';
import { RankingService } from './ranking.service.js';
import { CaslModule } from '../common/casl/casl.module.js';

@Module({
  imports: [CaslModule],
  controllers: [RankingController],
  providers: [RankingService],
})
export class RankingModule {}
