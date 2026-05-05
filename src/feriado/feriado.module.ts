import { Module } from '@nestjs/common';
import { FeriadoController } from './feriado.controller.js';
import { FeriadoService } from './feriado.service.js';
import { CaslModule } from '../common/casl/casl.module.js';

@Module({
  imports: [CaslModule],
  controllers: [FeriadoController],
  providers: [FeriadoService],
})
export class FeriadoModule {}
