import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request } from 'express';

type RawBodyRequest = Request & { rawBody?: Buffer };

/**
 * HMAC-SHA256 guard for Eduzz webhooks.
 *
 * Eduzz signs the raw request body with one of N configured secrets and sends
 * the digest as `x-signature` (lowercase hex per PHP `hmac` convention).
 * We try each secret and accept if any matches via timingSafeEqual — supports
 * zero-downtime secret rotation.
 */
@Injectable()
export class EduzzSignatureGuard implements CanActivate {
  private readonly logger = new Logger(EduzzSignatureGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RawBodyRequest>();

    const secretsCsv = this.config.get<string>('EDUZZ_WEBHOOK_SECRETS');
    const secrets = (secretsCsv ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (secrets.length === 0) {
      this.logger.error('EDUZZ_WEBHOOK_SECRETS not configured');
      throw new ServiceUnavailableException('Webhook receiver not configured');
    }

    const provided = (req.headers['x-signature'] ?? '') as string;
    if (!provided) {
      throw new UnauthorizedException('Missing x-signature header');
    }
    if (!req.rawBody) {
      this.logger.error(
        'rawBody not captured — check json() verify callback in main.ts',
      );
      throw new ServiceUnavailableException('Raw body unavailable');
    }

    const providedBuf = Buffer.from(provided, 'utf8');

    for (const secret of secrets) {
      const expected = createHmac('sha256', secret)
        .update(req.rawBody)
        .digest('hex');
      const expectedBuf = Buffer.from(expected, 'utf8');
      if (providedBuf.length !== expectedBuf.length) continue;
      if (timingSafeEqual(providedBuf, expectedBuf)) {
        return true;
      }
    }

    this.logger.warn(`Bad Eduzz signature on ${req.method} ${req.originalUrl}`);
    throw new UnauthorizedException('Invalid signature');
  }
}
