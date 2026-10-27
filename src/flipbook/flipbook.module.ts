import { Module } from '@nestjs/common';
import { FlipbookController } from './flipbook.controller.js';
import { FlipbookService } from './flipbook.service.js';
import { CaslModule } from '../common/casl/casl.module.js';

@Module({
  imports: [CaslModule],
  controllers: [FlipbookController],
  providers: [FlipbookService],
})
export class FlipbookModule {}
