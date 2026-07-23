import { Router, Request, Response } from 'express';
import { config } from '../config.js';
import { requireSyncSecret } from '../middleware/syncSecret.js';
import { rateLimit } from '../middleware/rateLimit.js';
import {
  montarLinhaMovimentacoes,
  type ExportRowInput,
  syncEntradaSaidaPlanilhaCompleto,
} from '../services/entradaSaidaPlanilhaSync.js';

const router = Router();

const syncLimiter = rateLimit({
  name: 'planilha-sync',
  max: config.rateLimitSyncMax,
  windowMs: config.rateLimitSyncWindowMs,
});

/**
 * POST /api/planilha-entrada-saida/sync
 * Header: X-Byla-Sync-Secret: <BYLA_SYNC_SECRET>
 *
 * Roda a mesma lógica de `npm run sync:entrada-saida` (contrato final de 8 colunas na aba Movimentações).
 */
/**
 * POST /api/planilha-entrada-saida/montar-linhas
 * Body: { rows: ExportRowInput[] } (mesmas colunas de `v_transacoes_export`)
 * Header: X-Byla-Sync-Secret
 *
 * Retorna linhas no contrato da aba Movimentações (8 colunas) para o n8n usar sem duplicar regra.
 */
router.post('/planilha-entrada-saida/montar-linhas', syncLimiter, (req: Request, res: Response) => {
  if (!requireSyncSecret(req, res)) return;

  const body = req.body as { rows?: unknown };
  const raw = body?.rows;
  if (!Array.isArray(raw)) {
    return res.status(400).json({ ok: false, error: 'Body deve enviar { rows: [...] }' });
  }

  const linhas = raw.map((row) => montarLinhaMovimentacoes(row as ExportRowInput));
  return res.json({ ok: true, linhas });
});

router.post('/planilha-entrada-saida/sync', syncLimiter, async (req: Request, res: Response) => {
  if (!requireSyncSecret(req, res)) return;

  if (!config.sheets.entradaSaidaSpreadsheetId) {
    return res.status(503).json({ ok: false, error: 'GOOGLE_SHEETS_ENTRADA_SAIDA_ID não configurado' });
  }

  try {
    const { sync } = await syncEntradaSaidaPlanilhaCompleto();
    return res.json({ ok: sync.ok, sync });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

export default router;
