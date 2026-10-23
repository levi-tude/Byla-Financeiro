import { Router, type Request, type Response } from 'express';
import { requireSyncWebhookSecret } from '../middleware/syncWebhookSecret.js';
import { getSupabase } from '../services/supabaseClient.js';
import { executarSyncSoInserir, type SyncDeps } from '../services/syncFluxoSoInserirAuto.js';
import { createSyncDepsReais } from '../services/syncFluxoSoInserirDeps.js';

/**
 * POST /api/sync/fluxo-so-inserir — chamado pelo Google Apps Script quando a planilha muda.
 * Auth: header X-Sync-Webhook-Secret. Só INSERE; com conflito, não grava nada.
 */
export function createSyncFluxoAutoRouter(depsFactory?: () => SyncDeps | null): Router {
  const router = Router();
  router.post('/sync/fluxo-so-inserir', async (req: Request, res: Response) => {
    if (!requireSyncWebhookSecret(req, res)) return;
    const deps = depsFactory
      ? depsFactory()
      : (() => {
          const sb = getSupabase();
          return sb ? createSyncDepsReais(sb) : null;
        })();
    if (!deps) return void res.status(503).json({ ok: false, error: 'Supabase não configurado' });
    const resumo = await executarSyncSoInserir(deps);
    const code = resumo.status === 'ocupado' ? 409 : resumo.status === 'erro' ? 500 : 200;
    // Resposta sem PII: só contagens e tipos de conflito.
    res.status(code).json({
      ...resumo,
      conflitos: resumo.conflitos.map((c) => ({ tipo: c.tipo, quantidade: c.quantidade })),
    });
  });
  return router;
}

export default createSyncFluxoAutoRouter;
