import { Module } from '@nestjs/common';
import { ObservacaoController } from './observacao.controller.js';
import { ObservacaoService } from './observacao.service.js';
import { CaslModule } from '../common/casl/casl.module.js';

@Module({
  imports: [CaslModule],
  controllers: [ObservacaoController],
  providers: [ObservacaoService],
})
export class ObservacaoModule {}
