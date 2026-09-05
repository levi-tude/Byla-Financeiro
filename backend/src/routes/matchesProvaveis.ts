import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getMatchesProvaveisMes } from '../services/matchesProvaveisMes.js';
import {
  aplicarMatchesProvaveisSegurosMes,
  desfazerLoteMatchesProvaveis,
} from '../services/matchesProvaveisLote.js';
import { mesAnoQuerySchema, parseQuery } from '../validation/apiQuery.js';

const router = Router();
const aplicarLoteSchema = z.object({
  mes: z.number().int().min(1).max(12),
  ano: z.number().int().min(2000).max(2100),
  analise_id: z.string().trim().regex(/^[a-f0-9]{24}$/),
});

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

/**
 * POST /api/validacao/matches-provaveis/aplicar-seguros
 * Recalcula e grava somente os casos 1:1 que continuam seguros.
 * RBAC: admin (guard em api.ts).
 */
router.post('/validacao/matches-provaveis/aplicar-seguros', async (req: Request, res: Response) => {
  try {
    const parsed = aplicarLoteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Dados do lote inválidos.' });
    const result = await aplicarMatchesProvaveisSegurosMes({
      mes: parsed.data.mes,
      ano: parsed.data.ano,
      analiseId: parsed.data.analise_id,
      actor: {
        userId: req.authUser?.userId,
        email: req.authUser?.email,
        role: req.authUser?.role,
      },
    });
    if (result.status === 'desatualizado') return res.status(409).json(result);
    return res.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('Supabase não configurado')) return res.status(503).json({ error: msg });
    return res.status(500).json({ error: 'Não foi possível aplicar o lote seguro.' });
  }
});

/**
 * DELETE /api/validacao/matches-provaveis/lotes/:loteId
 * Remove apenas vínculos que ainda possuem a marca exata do lote informado.
 */
router.delete('/validacao/matches-provaveis/lotes/:loteId', async (req: Request, res: Response) => {
  try {
    const parsed = z.string().uuid().safeParse(req.params.loteId);
    if (!parsed.success) return res.status(400).json({ error: 'Lote inválido.' });
    return res.json(await desfazerLoteMatchesProvaveis(parsed.data));
  } catch {
    return res.status(500).json({ error: 'Não foi possível desfazer o lote.' });
  }
});

export default router;
