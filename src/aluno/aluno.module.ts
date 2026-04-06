import { Module } from '@nestjs/common';
import { AlunoController } from './aluno.controller.js';
import { AlunoService } from './aluno.service.js';
import { CaslModule } from '../common/casl/casl.module.js';

@Module({
  imports: [CaslModule],
  controllers: [AlunoController],
  providers: [AlunoService],
})
export class AlunoModule {}
