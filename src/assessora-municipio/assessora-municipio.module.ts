import { Module } from '@nestjs/common';
import { AssessoraMunicipioController } from './assessora-municipio.controller.js';
import { AssessoraMunicipioService } from './assessora-municipio.service.js';

@Module({
  controllers: [AssessoraMunicipioController],
  providers: [AssessoraMunicipioService],
})
export class AssessoraMunicipioModule {}
