import { Router, Request, Response } from 'express';
import { getFinancasAlunos } from '../services/financasAlunosReadModel.js';
import { financasAlunosQuerySchema, parseQuery } from '../validation/apiQuery.js';
import type { MeioPagamentoAluno } from '../logic/meioPagamentoVinculo.js';
import type { FinancasAlunoVinculoFiltro } from '../services/financasAlunosReadModel.js';
import {
  CACHE_TTL_SEC,
  cacheGetOrSet,
  cacheKeyFinancasAlunos,
} from '../services/responseCache.js';

const router = Router();

/**
 * GET /api/financas/alunos?mes=&ano=&meio=&vinculo=
 * RBAC: admin (guard em api.ts)
 */
router.get('/financas/alunos', async (req: Request, res: Response) => {
  try {
    const parsed = parseQuery(financasAlunosQuerySchema, req.query as Record<string, unknown>);
    if (!parsed.ok) return res.status(400).json({ error: parsed.message });

    const { mes, ano, meio, vinculo } = parsed.data;
    const filtroMeio: MeioPagamentoAluno | undefined =
      meio === 'todos' ? undefined : (meio as MeioPagamentoAluno);
    const filtroVinculo: FinancasAlunoVinculoFiltro = vinculo as FinancasAlunoVinculoFiltro;

    const result = await cacheGetOrSet(
      cacheKeyFinancasAlunos(mes, ano, String(meio ?? 'todos'), String(vinculo ?? 'todos')),
      CACHE_TTL_SEC,
      () => getFinancasAlunos(mes, ano, filtroMeio, filtroVinculo),
    );
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
