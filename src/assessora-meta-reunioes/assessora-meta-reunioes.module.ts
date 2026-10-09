import { Module } from '@nestjs/common';
import { AssessoraMetaReunioesController } from './assessora-meta-reunioes.controller.js';
import { AssessoraMetaReunioesService } from './assessora-meta-reunioes.service.js';

@Module({
  controllers: [AssessoraMetaReunioesController],
  providers: [AssessoraMetaReunioesService],
})
export class AssessoraMetaReunioesModule {}
