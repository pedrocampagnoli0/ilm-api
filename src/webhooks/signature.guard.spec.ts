import { ConfigService } from '@nestjs/config';
import {
  ExecutionContext,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac } from 'crypto';
import { EduzzSignatureGuard } from './signature.guard.js';

function makeContext(
  rawBody: Buffer | undefined,
  signature: string | undefined,
): ExecutionContext {
  const req = {
    rawBody,
    headers: signature ? { 'x-signature': signature } : {},
    method: 'POST',
    originalUrl: '/webhooks/eduzz/nutror',
  };
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}

function makeConfig(secretsCsv: string | undefined): ConfigService {
  return {
    get: (key: string) =>
      key === 'EDUZZ_WEBHOOK_SECRETS' ? secretsCsv : undefined,
  } as unknown as ConfigService;
}

describe('EduzzSignatureGuard', () => {
  const body = Buffer.from(
    JSON.stringify({ event: 'nutror.module_completed', id: 'evt_1' }),
  );

  it('accepts a request signed with the configured secret', () => {
    const secret = 'top-secret';
    const sig = createHmac('sha256', secret).update(body).digest('hex');
    const guard = new EduzzSignatureGuard(makeConfig(secret));
    expect(guard.canActivate(makeContext(body, sig))).toBe(true);
  });

  it('accepts a request signed with any of multiple configured secrets', () => {
    const sig = createHmac('sha256', 'new-secret').update(body).digest('hex');
    const guard = new EduzzSignatureGuard(makeConfig('old-secret,new-secret'));
    expect(guard.canActivate(makeContext(body, sig))).toBe(true);
  });

  it('rejects a request signed with an unknown secret', () => {
    const sig = createHmac('sha256', 'wrong-secret').update(body).digest('hex');
    const guard = new EduzzSignatureGuard(makeConfig('right-secret'));
    expect(() => guard.canActivate(makeContext(body, sig))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects when x-signature header is missing', () => {
    const guard = new EduzzSignatureGuard(makeConfig('s'));
    expect(() => guard.canActivate(makeContext(body, undefined))).toThrow(
      UnauthorizedException,
    );
  });

  it('throws ServiceUnavailable when no secrets are configured', () => {
    const guard = new EduzzSignatureGuard(makeConfig(undefined));
    expect(() => guard.canActivate(makeContext(body, 'whatever'))).toThrow(
      ServiceUnavailableException,
    );
  });

  it('throws ServiceUnavailable when rawBody is not captured', () => {
    const guard = new EduzzSignatureGuard(makeConfig('s'));
    expect(() => guard.canActivate(makeContext(undefined, 'whatever'))).toThrow(
      ServiceUnavailableException,
    );
  });

  it('rejects when the body is tampered after signing', () => {
    const secret = 'top-secret';
    const sig = createHmac('sha256', secret).update(body).digest('hex');
    const tampered = Buffer.from(
      JSON.stringify({ event: 'nutror.module_completed', id: 'evt_99' }),
    );
    const guard = new EduzzSignatureGuard(makeConfig(secret));
    expect(() => guard.canActivate(makeContext(tampered, sig))).toThrow(
      UnauthorizedException,
    );
  });
});
