import { timingSafeEqual, createHash } from 'node:crypto';
import type { Request, Response } from 'express';

/** Comparação em tempo constante (hash SHA-256 iguala tamanhos antes do timingSafeEqual). */
export function secretsEqualConstantTime(sent: string, expected: string): boolean {
  const a = createHash('sha256').update(sent, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b) && sent.length === expected.length;
}

/** Header X-Sync-Webhook-Secret = env SYNC_WEBHOOK_SECRET (webhook do Apps Script). */
export function requireSyncWebhookSecret(req: Request, res: Response): boolean {
  const secret = (process.env.SYNC_WEBHOOK_SECRET ?? '').trim();
  if (!secret) {
    res.status(503).json({ ok: false, error: 'SYNC_WEBHOOK_SECRET não configurado no servidor' });
    return false;
  }
  const sent = (req.header('x-sync-webhook-secret') ?? '').trim();
  if (!sent || !secretsEqualConstantTime(sent, secret)) {
    res.status(401).json({ ok: false, error: 'Não autorizado' });
    return false;
  }
  return true;
}
