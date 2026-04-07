import { Router, Request, Response } from 'express';
import { getSupabase } from '../services/supabaseClient.js';
import { filtrarTransacoesOficiais } from '../services/transacoesFiltro.js';
import { parseQuery, transacoesQuerySchema } from '../validation/apiQuery.js';

const router = Router();

/** GET /api/transacoes?mes=3&ano=2026&tipo=entrada|saida – Lista transações do mês (Supabase) para detalhes na visão geral. */
router.get('/transacoes', async (req: Request, res: Response) => {
  try {
    const parsed = parseQuery(transacoesQuerySchema, req.query as Record<string, unknown>);
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.message, itens: [] });
    }
    const { mes, ano, tipo } = parsed.data;
    const supabase = getSupabase();
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.', itens: [] });

    const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const fim = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;

    const { data, error } = await supabase
      .from('transacoes')
      .select('id, data, pessoa, valor, descricao, tipo')
      .gte('data', inicio)
      .lte('data', fim)
      .order('data', { ascending: false })
      .order('id', { ascending: false })
      .limit(2000);

    if (error) return res.status(502).json({ error: error.message, itens: [] });

    const todas = (data ?? []) as { id: string; data: string; pessoa: string; valor: number; descricao: string | null; tipo: string }[];

    const oficiais = filtrarTransacoesOficiais(todas);
    const filtradas = (tipo === 'entrada' ? oficiais.entradas : oficiais.saidas).slice(0, 500);

    res.json({ itens: filtradas, mes, ano, tipo });
  } catch (e) {
    res.status(500).json({
      error: e instanceof Error ? e.message : String(e),
      itens: [],
    });
  }
});

export default router;
