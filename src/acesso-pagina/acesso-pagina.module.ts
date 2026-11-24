import { Module } from '@nestjs/common';
import { AcessoPaginaController } from './acesso-pagina.controller.js';
import { AcessoPaginaService } from './acesso-pagina.service.js';

@Module({
  controllers: [AcessoPaginaController],
  providers: [AcessoPaginaService],
})
export class AcessoPaginaModule {}
