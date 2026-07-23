import type { NextFunction, Request, Response } from 'express';

type RateLimitOptions = {
  /** Janela em ms */
  windowMs: number;
  /** Máximo de pedidos por chave na janela */
  max: number;
  /** Nome amigável no header/log */
  name?: string;
};

type Bucket = { count: number; resetAt: number };

const stores = new Map<string, Map<string, Bucket>>();

function getStore(name: string): Map<string, Bucket> {
  let s = stores.get(name);
  if (!s) {
    s = new Map();
    stores.set(name, s);
  }
  return s;
}

function clientKey(req: Request): string {
  const authUser = (req as Request & { authUser?: { userId?: string } }).authUser;
  if (authUser?.userId) return `u:${authUser.userId}`;
  const xf = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
  const ip = xf || req.ip || req.socket.remoteAddress || 'unknown';
  return `ip:${ip}`;
}

/**
 * Rate limit em memória (adequado ao Render free / single instance).
 * Responde 429 + Retry-After quando excede.
 */
export function rateLimit(opts: RateLimitOptions) {
  const name = opts.name ?? 'default';
  const store = getStore(name);

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
    const key = clientKey(req);
    const now = Date.now();
    let bucket = store.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + opts.windowMs };
      store.set(key, bucket);
    }
    bucket.count += 1;

    const remaining = Math.max(0, opts.max - bucket.count);
    res.setHeader('X-RateLimit-Limit', String(opts.max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > opts.max) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        error: 'Muitas requisições. Tente novamente em instantes.',
        retry_after_seconds: retryAfterSec,
        limit: opts.max,
      });
      return;
    }
    next();
  };
}

/** Limpa buckets expirados (testes / hygiene). */
export function clearRateLimitStores(): void {
  stores.clear();
}
