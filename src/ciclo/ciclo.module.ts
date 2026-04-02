import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CicloController } from './ciclo.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [CicloController],
})
export class CicloModule {}
