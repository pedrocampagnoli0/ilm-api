import { Module } from '@nestjs/common';
import { EduzzController } from './eduzz.controller.js';
import { EduzzService } from './eduzz.service.js';
import { EduzzSignatureGuard } from './signature.guard.js';

@Module({
  controllers: [EduzzController],
  providers: [EduzzService, EduzzSignatureGuard],
})
export class WebhooksModule {}
