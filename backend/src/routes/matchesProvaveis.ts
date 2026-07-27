import { Router, Request, Response } from 'express';
import { getMatchesProvaveisMes } from '../services/matchesProvaveisMes.js';
import { mesAnoQuerySchema, parseQuery } from '../validation/apiQuery.js';

const router = Router();

/**
 * GET /api/validacao/matches-provaveis?mes=&ano=
 * Lista sugestões alto/médio da competência, agrupadas por data do Fluxo.
 * RBAC: admin (guard em api.ts). Read-only — não grava vínculos.
 */
router.get('/validacao/matches-provaveis', async (req: Request, res: Response) => {
  try {
    const parsed = parseQuery(mesAnoQuerySchema, req.query as Record<string, unknown>);
    if (!parsed.ok) return res.status(400).json({ error: parsed.message });

    const { mes, ano } = parsed.data;
    const result = await getMatchesProvaveisMes(mes, ano);
    return res.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('Supabase não configurado')) {
      return res.status(503).json({ error: msg });
    }
    return res.status(500).json({ error: msg });
  }
});

export default router;
