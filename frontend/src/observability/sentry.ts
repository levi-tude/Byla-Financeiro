import * as Sentry from '@sentry/react';
import { scrubPii } from './scrubPii';

/** Sentry só liga se VITE_SENTRY_DSN existir. Sem DSN = desligado. */
const dsn = (import.meta.env.VITE_SENTRY_DSN as string | undefined)?.trim();

export function initSentry(): void {
  if (!dsn) return;
  const n = Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? '0.05');
  Sentry.init({
    dsn,
    environment: (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) || import.meta.env.MODE,
    sendDefaultPii: false,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.05,
    beforeSend(event) {
      delete event.user;
      if (event.request) delete event.request.cookies;
      return scrubPii(event);
    },
    beforeBreadcrumb(b) {
      return scrubPii(b);
    },
  });
}

export { Sentry };
