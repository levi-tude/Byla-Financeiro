import { Router, Request, Response } from 'express';
import { getSupabase } from '../services/supabaseClient.js';
import {
  amarrarRegraStickyAssinatura,
  classificarAssinatura,
  listAlertasParouDePagar,
  listAssinaturas,
  patchAssinatura,
  upsertAssinatura,
} from '../services/assinaturaCreditoRecorrente.js';
import {
  assinaturaCreditoRecorrenteClassificarBodySchema,
  assinaturaCreditoRecorrentePatchBodySchema,
  assinaturaCreditoRecorrenteUpsertBodySchema,
  mesAnoQuerySchema,
  parseBody,
  parseQuery,
} from '../validation/apiQuery.js';

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseAssinaturaId(req: Request, res: Response): string | null {
  const id = String(req.params.id ?? '').trim();
  if (!UUID_RE.test(id)) {
    res.status(400).json({ error: 'id inválido.' });
    return null;
  }
  return id;
}

/**
 * GET /api/assinaturas-credito-recorrente/alertas-parou?mes=&ano=
 * RBAC: admin + secretaria (guard em api.ts)
 */
router.get('/assinaturas-credito-recorrente/alertas-parou', async (req: Request, res: Response) => {
  try {
    const parsed = parseQuery(mesAnoQuerySchema, req.query as Record<string, unknown>);
    if (!parsed.ok) return res.status(400).json({ error: parsed.message });
    const { mes, ano } = parsed.data;

    const supabase = getSupabase();
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });

    const alertas = await listAlertasParouDePagar(supabase, mes, ano);
    const role = req.authUser?.role;
    const safe =
      role === 'secretaria'
        ? alertas.map(({ assinatura_id, nome_exibicao, mensagem }) => ({
            assinatura_id,
            nome_exibicao,
            mensagem,
          }))
        : alertas;

    return res.json({ mes, ano, alertas: safe });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/**
 * POST /api/assinaturas-credito-recorrente/:id/classificar
 * RBAC: admin + secretaria (guard em api.ts)
 */
router.post(
  '/assinaturas-credito-recorrente/:id/classificar',
  async (req: Request, res: Response) => {
    try {
      const id = parseAssinaturaId(req, res);
      if (!id) return;

      const parsed = parseBody(assinaturaCreditoRecorrenteClassificarBodySchema, req.body);
      if (!parsed.ok) return res.status(400).json({ error: parsed.message });

      const supabase = getSupabase();
      if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });

      const assinatura = await classificarAssinatura(supabase, id, parsed.data.acao);
      if (!assinatura) return res.status(404).json({ error: 'Assinatura não encontrada.' });

      return res.json({ ok: true, assinatura });
    } catch (e) {
      return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  },
);

/**
 * GET /api/assinaturas-credito-recorrente
 * RBAC: admin only (guard em api.ts)
 */
router.get('/assinaturas-credito-recorrente', async (_req: Request, res: Response) => {
  try {
    const supabase = getSupabase();
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });

    const assinaturas = await listAssinaturas(supabase);
    return res.json({ assinaturas });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/**
 * POST /api/assinaturas-credito-recorrente
 * RBAC: admin only (guard em api.ts)
 */
router.post('/assinaturas-credito-recorrente', async (req: Request, res: Response) => {
  try {
    const parsed = parseBody(assinaturaCreditoRecorrenteUpsertBodySchema, req.body);
    if (!parsed.ok) return res.status(400).json({ error: parsed.message });

    const supabase = getSupabase();
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });

    const assinatura = await upsertAssinatura(supabase, parsed.data);
    if (!assinatura) {
      return res.status(503).json({ error: 'Cadastro de assinaturas indisponível.' });
    }

    return res.json({ ok: true, assinatura });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/**
 * PATCH /api/assinaturas-credito-recorrente/:id
 * RBAC: admin only (guard em api.ts)
 */
router.patch('/assinaturas-credito-recorrente/:id', async (req: Request, res: Response) => {
  try {
    const id = parseAssinaturaId(req, res);
    if (!id) return;

    const parsed = parseBody(assinaturaCreditoRecorrentePatchBodySchema, req.body);
    if (!parsed.ok) return res.status(400).json({ error: parsed.message });

    const supabase = getSupabase();
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });

    const assinatura = await patchAssinatura(supabase, id, parsed.data);
    if (!assinatura) return res.status(404).json({ error: 'Assinatura não encontrada.' });

    return res.json({ ok: true, assinatura });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
