import { Module } from '@nestjs/common';
import { ImportBulkController } from './import-bulk.controller.js';
import { ImportBulkService } from './import-bulk.service.js';

@Module({
  controllers: [ImportBulkController],
  providers: [ImportBulkService],
})
export class ImportBulkModule {}
