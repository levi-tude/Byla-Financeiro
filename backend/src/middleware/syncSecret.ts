import { timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';

/** Compara strings de segredo sem vazar comprimento/caracteres via timing. */
function secretsEqual(sent: string, expected: string): boolean {
  const a = Buffer.from(sent, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Valida header X-Byla-Sync-Secret para rotas internas (n8n). */
export function requireSyncSecret(req: Request, res: Response): boolean {
  const secret = (process.env.BYLA_SYNC_SECRET ?? '').trim();
  if (!secret) {
    res.status(503).json({ ok: false, error: 'BYLA_SYNC_SECRET não configurado no servidor' });
    return false;
  }
  const sent = (req.header('x-byla-sync-secret') ?? '').trim();
  if (!secretsEqual(sent, secret)) {
    res.status(401).json({ ok: false, error: 'Não autorizado' });
    return false;
  }
  return true;
}
