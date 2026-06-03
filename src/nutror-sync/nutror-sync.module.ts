import { Module } from '@nestjs/common';
import { NutrorSyncController } from './nutror-sync.controller.js';
import { NutrorSyncService } from './nutror-sync.service.js';
import { NutrorSyncScheduler } from './nutror-sync.scheduler.js';
import { EduzzApiClient } from './eduzz-api.client.js';

@Module({
  controllers: [NutrorSyncController],
  providers: [NutrorSyncService, NutrorSyncScheduler, EduzzApiClient],
})
export class NutrorSyncModule {}
