import { Module } from '@nestjs/common';
import { ReuniaoController } from './reuniao.controller.js';
import { ReuniaoService } from './reuniao.service.js';
import { CaslModule } from '../common/casl/casl.module.js';

@Module({
  imports: [CaslModule],
  controllers: [ReuniaoController],
  providers: [ReuniaoService],
})
export class ReuniaoModule {}
