import { Router, Request, Response } from 'express';
import { getCadastroAlunosResumo } from '../services/cadastroAlunosResumoReadModel.js';
import { cadastroAlunosResumoQuerySchema, parseQuery } from '../validation/apiQuery.js';
import type { MeioPagamentoAluno } from '../logic/meioPagamentoVinculo.js';
import type {
  CadastroAlunoCadastroFiltro,
  CadastroAlunoDiaVencimentoFiltro,
  CadastroAlunoRegimeFiltro,
  CadastroAlunoVinculoFiltro,
} from '../services/cadastroAlunosResumoReadModel.js';
import {
  CACHE_TTL_SEC,
  cacheGetOrSet,
  cacheKeyCadastroResumo,
} from '../services/responseCache.js';

const router = Router();

/**
 * GET /api/cadastro-alunos/resumo
 * RBAC: secretária + admin (guard em api.ts)
 */
router.get('/cadastro-alunos/resumo', async (req: Request, res: Response) => {
  try {
    const parsed = parseQuery(cadastroAlunosResumoQuerySchema, req.query as Record<string, unknown>);
    if (!parsed.ok) return res.status(400).json({ error: parsed.message });

    const { aba, modalidade, vinculo, cadastro, regime, meio, dia_vencimento, ativo } = parsed.data;
    const filtroMeio: MeioPagamentoAluno | undefined =
      meio === 'todos' ? undefined : (meio as MeioPagamentoAluno);
    const filtroDiaVencimento: CadastroAlunoDiaVencimentoFiltro | undefined =
      dia_vencimento === 'sem' ? 'sem' : dia_vencimento;

    const result = await cacheGetOrSet(
      cacheKeyCadastroResumo({
        aba,
        modalidade,
        vinculo,
        cadastro,
        regime,
        meio,
        dia_vencimento,
        ativo,
      }),
      CACHE_TTL_SEC,
      () =>
        getCadastroAlunosResumo({
          filtroAba: aba,
          filtroModalidade: modalidade,
          filtroVinculo: vinculo as CadastroAlunoVinculoFiltro,
          filtroCadastro: cadastro as CadastroAlunoCadastroFiltro,
          filtroRegime: regime as CadastroAlunoRegimeFiltro,
          filtroMeio,
          filtroDiaVencimento,
          somenteAtivos: ativo !== 'false',
        }),
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
