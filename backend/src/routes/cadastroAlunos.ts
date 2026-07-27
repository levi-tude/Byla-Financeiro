import { Router, Request, Response } from 'express';
import { getCadastroAlunosResumo } from '../services/cadastroAlunosResumoReadModel.js';
import { cadastroAlunosResumoQuerySchema, parseQuery } from '../validation/apiQuery.js';
import type { MeioPagamentoAluno } from '../logic/meioPagamentoVinculo.js';
import type {
  CadastroAlunoCadastroFiltro,
  CadastroAlunoVinculoFiltro,
} from '../services/cadastroAlunosResumoReadModel.js';

const router = Router();

/**
 * GET /api/cadastro-alunos/resumo
 * RBAC: secretária + admin (guard em api.ts)
 */
router.get('/cadastro-alunos/resumo', async (req: Request, res: Response) => {
  try {
    const parsed = parseQuery(cadastroAlunosResumoQuerySchema, req.query as Record<string, unknown>);
    if (!parsed.ok) return res.status(400).json({ error: parsed.message });

    const { aba, modalidade, vinculo, cadastro, meio, ativo } = parsed.data;
    const filtroMeio: MeioPagamentoAluno | undefined =
      meio === 'todos' ? undefined : (meio as MeioPagamentoAluno);

    const result = await getCadastroAlunosResumo({
      filtroAba: aba,
      filtroModalidade: modalidade,
      filtroVinculo: vinculo as CadastroAlunoVinculoFiltro,
      filtroCadastro: cadastro as CadastroAlunoCadastroFiltro,
      filtroMeio,
      somenteAtivos: ativo !== 'false',
    });
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
