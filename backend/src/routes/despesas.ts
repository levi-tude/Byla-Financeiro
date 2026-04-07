import { Router, Request, Response } from 'express';
import { getSupabase } from '../services/supabaseClient.js';
import { mesAnoQuerySchema, parseQuery } from '../validation/apiQuery.js';

const router = Router();

/** GET /api/despesas e /api/saidas – mesma resposta (lista despesas + resumos). */
async function handleDespesasMes(req: Request, res: Response): Promise<void> {
  try {
    const parsed = parseQuery(mesAnoQuerySchema, req.query as Record<string, unknown>);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.message, itens: [], resumo: {} });
      return;
    }
    const { mes, ano } = parsed.data;
    const supabase = getSupabase();
    if (!supabase) {
      res.status(503).json({ error: 'Supabase não configurado.', itens: [], resumo: {} });
      return;
    }

    const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const fim = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;

    const { data, error } = await supabase
      .from('despesas')
      .select('id, data, valor, descricao, categoria, subcategoria, centro_custo, funcionario, origem')
      .gte('data', inicio)
      .lte('data', fim)
      .order('data', { ascending: false })
      .order('id', { ascending: false });

    if (error) {
      res.status(502).json({ error: error.message, itens: [], resumo: {} });
      return;
    }

    const itens = (data ?? []) as {
      id: string;
      data: string;
      valor: number;
      descricao: string;
      categoria: string;
      subcategoria: string | null;
      centro_custo: string | null;
      funcionario: string | null;
      origem: string;
    }[];

    const totalGeral = itens.reduce((acc, d) => acc + Number(d.valor || 0), 0);

    const resumoPorFuncionario: { funcionario: string; total: number; qtd: number }[] = [];
    const mapFunc = new Map<string, { total: number; qtd: number }>();
    for (const d of itens) {
      const nome = (d.funcionario ?? '').trim() || 'Sem funcionário';
      const entry = mapFunc.get(nome) ?? { total: 0, qtd: 0 };
      entry.total += Number(d.valor || 0);
      entry.qtd += 1;
      mapFunc.set(nome, entry);
    }
    for (const [funcionario, v] of mapFunc) {
      resumoPorFuncionario.push({ funcionario, total: v.total, qtd: v.qtd });
    }
    resumoPorFuncionario.sort((a, b) => b.total - a.total);

    const resumoPorCategoria: { categoria: string; total: number; qtd: number }[] = [];
    const mapCat = new Map<string, { total: number; qtd: number }>();
    for (const d of itens) {
      const cat = (d.categoria ?? '').trim() || 'Sem categoria';
      const entry = mapCat.get(cat) ?? { total: 0, qtd: 0 };
      entry.total += Number(d.valor || 0);
      entry.qtd += 1;
      mapCat.set(cat, entry);
    }
    for (const [categoria, v] of mapCat) {
      resumoPorCategoria.push({ categoria, total: v.total, qtd: v.qtd });
    }
    resumoPorCategoria.sort((a, b) => b.total - a.total);

    res.json({
      itens,
      resumo: {
        total_geral: totalGeral,
        por_funcionario: resumoPorFuncionario,
        por_categoria: resumoPorCategoria,
      },
      mes,
      ano,
    });
  } catch (e) {
    res.status(500).json({
      error: e instanceof Error ? e.message : String(e),
      itens: [],
      resumo: {},
    });
  }
}

router.get('/despesas', handleDespesasMes);
router.get('/saidas', handleDespesasMes);

export default router;
