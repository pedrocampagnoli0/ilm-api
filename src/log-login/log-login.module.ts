import { Module } from '@nestjs/common';
import { LogLoginController } from './log-login.controller.js';
import { LogLoginService } from './log-login.service.js';

@Module({
  controllers: [LogLoginController],
  providers: [LogLoginService],
})
export class LogLoginModule {}
