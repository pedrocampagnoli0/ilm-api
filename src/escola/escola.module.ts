import { Module } from '@nestjs/common';
import { EscolaController } from './escola.controller.js';
import { EscolaService } from './escola.service.js';
import { CaslModule } from '../common/casl/casl.module.js';

@Module({
  imports: [CaslModule],
  controllers: [EscolaController],
  providers: [EscolaService],
})
export class EscolaModule {}