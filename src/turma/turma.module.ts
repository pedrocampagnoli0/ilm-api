import { Module } from '@nestjs/common';
import { TurmaController } from './turma.controller.js';
import { TurmaService } from './turma.service.js';
import { CaslModule } from '../common/casl/casl.module.js';

@Module({
  imports: [CaslModule],
  controllers: [TurmaController],
  providers: [TurmaService],
})
export class TurmaModule {}
