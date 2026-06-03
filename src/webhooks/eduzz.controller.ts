import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { EduzzService } from './eduzz.service.js';
import { EduzzSignatureGuard } from './signature.guard.js';
import type { NutrorModuleCompletedPayload } from './dto/nutror-module-completed.dto.js';

@ApiTags('Webhooks — Eduzz')
@Controller('webhooks/eduzz')
export class EduzzController {
  private readonly logger = new Logger(EduzzController.name);

  constructor(private readonly eduzz: EduzzService) {}

  /**
   * Eduzz Nutror — module_completed.
   *
   * Public route (no JWT) — authenticity verified via HMAC-SHA256 of the raw
   * body against EDUZZ_WEBHOOK_SECRETS. Returns 200 on success, duplicate,
   * email-no-match, or schema-mismatch (all are non-retryable from Eduzz's
   * perspective). Only bad signature → 401; truly unexpected errors → 5xx.
   */
  @Post('nutror')
  @HttpCode(200)
  @UseGuards(EduzzSignatureGuard)
  @ApiOperation({ summary: 'Receber webhook nutror.module_completed' })
  async receiveNutror(
    @Body() payload: NutrorModuleCompletedPayload,
    @Headers('x-signature') signature: string | undefined,
  ): Promise<{ ok: true; status: string }> {
    const outcome = await this.eduzz.processNutrorModuleCompleted(
      payload,
      signature,
    );
    return { ok: true, status: outcome.status };
  }
}
