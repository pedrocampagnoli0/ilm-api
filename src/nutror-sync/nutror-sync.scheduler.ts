import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NutrorSyncService } from './nutror-sync.service.js';

@Injectable()
export class NutrorSyncScheduler {
  private readonly logger = new Logger(NutrorSyncScheduler.name);

  constructor(private readonly sync: NutrorSyncService) {}

  // 06:00 UTC daily = 03:00 BRT (UTC-3).
  @Cron('0 6 * * *', { timeZone: 'UTC' })
  async dailySync() {
    this.logger.log('Starting scheduled Nutror sync');
    try {
      const result = await this.sync.runFullSync();
      this.logger.log(`Scheduled sync complete: ${JSON.stringify(result)}`);
    } catch (e) {
      this.logger.error(`Scheduled sync failed: ${(e as Error).message}`);
    }
  }
}
