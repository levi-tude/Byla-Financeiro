import * as Sentry from '@sentry/node';
import { scrubPii } from './scrubPii.js';

/** Sentry só liga se SENTRY_DSN existir. Sem DSN = desligado, nada muda. */
export const sentryEnabled = Boolean(process.env.SENTRY_DSN?.trim());

function sampleRate(): number {
  const n = Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.05');
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.05;
}

if (sentryEnabled) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN!.trim(),
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'production',
    release: process.env.RENDER_GIT_COMMIT || undefined,
    sendDefaultPii: false,
    tracesSampleRate: sampleRate(),
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.data;
        if (event.request.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
        }
      }
      delete event.user;
      return scrubPii(event);
    },
    beforeBreadcrumb(b) {
      return scrubPii(b);
    },
  });
}

export { Sentry };
