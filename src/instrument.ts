import * as Sentry from '@sentry/node';

// Must be imported before any other module (see main.ts) so Sentry's
// auto-instrumentation can hook into Node's built-ins.
//
// Error tracking only — tracesSampleRate stays at 0 so we never send
// performance spans. We're on Sentry's free Developer plan (5k errors/mo,
// 1 user) and only need it to catch the occasional unexpected 500, not to
// profile every request.
if (process.env['SENTRY_DSN']) {
  Sentry.init({
    dsn: process.env['SENTRY_DSN'],
    environment: process.env['NODE_ENV'] ?? 'development',
    tracesSampleRate: 0,
  });
}
