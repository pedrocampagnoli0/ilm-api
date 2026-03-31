import { Module } from '@nestjs/common';
import { MunicipioController } from './municipio.controller.js';
import { MunicipioService } from './municipio.service.js';
import { CaslModule } from '../common/casl/casl.module.js';

@Module({
  imports: [CaslModule],
  controllers: [MunicipioController],
  providers: [MunicipioService],
})
export class MunicipioModule {}
