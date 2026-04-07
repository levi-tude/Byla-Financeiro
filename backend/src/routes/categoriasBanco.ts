import { Router, Request, Response } from 'express';
import { getSupabase } from '../services/supabaseClient.js';
import { filtrarTransacoesOficiais, type TransacaoBase } from '../services/transacoesFiltro.js';
import { categoriasDetalheQuerySchema, categoriasResumoQuerySchema, parseQuery } from '../validation/apiQuery.js';

const router = Router();

type RowExport = TransacaoBase & {
  categoria_sugerida?: string | null;
  subcategoria_sugerida?: string | null;
  modalidade?: string | null;
  nome_aluno?: string | null;
  origem_categoria?: string | null;
};

function rangeMes(mes: number, ano: number): { inicio: string; fim: string } {
  const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const fim = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
  return { inicio, fim };
}

function normKey(s: string): string {
  return s.trim().toLowerCase();
}

/** GET /api/categorias-banco/resumo?mes=3&ano=2026&tipo=entrada|saida */
router.get('/categorias-banco/resumo', async (req: Request, res: Response) => {
  try {
    const parsed = parseQuery(categoriasResumoQuerySchema, req.query as Record<string, unknown>);
    if (!parsed.ok) return res.status(400).json({ error: parsed.message });

    const { mes, ano, tipo } = parsed.data;
    const supabase = getSupabase();
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });

    const { inicio, fim } = rangeMes(mes, ano);

    const { data, error } = await supabase
      .from('v_transacoes_export')
      .select(
        'id, data, pessoa, valor, descricao, tipo, categoria_sugerida, subcategoria_sugerida, modalidade, nome_aluno, origem_categoria',
      )
      .gte('data', inicio)
      .lte('data', fim)
      .limit(8000);

    if (error) return res.status(502).json({ error: error.message });

    const rows = (data ?? []) as RowExport[];
    const bases: TransacaoBase[] = rows.map((r) => ({
      id: r.id,
      data: r.data,
      pessoa: r.pessoa,
      valor: Number(r.valor),
      descricao: r.descricao,
      tipo: r.tipo,
    }));
    const oficiais = filtrarTransacoesOficiais(bases);
    const lista = tipo === 'entrada' ? oficiais.entradas : oficiais.saidas;
    const ids = new Set(lista.map((x) => x.id));
    const filtradas = rows.filter((r) => ids.has(r.id));

    const totalValor = filtradas.reduce((a, r) => a + Math.abs(Number(r.valor || 0)), 0);
    const qtd = filtradas.length;

    const porModalidade: { nome: string; total: number; qtd: number }[] = [];
    const porCategoria: { nome: string; total: number; qtd: number }[] = [];
    const mapMod = new Map<string, { total: number; qtd: number }>();
    const mapCat = new Map<string, { total: number; qtd: number }>();

    for (const r of filtradas) {
      const v = Math.abs(Number(r.valor || 0));
      const mod = (r.modalidade ?? '').trim() || 'Sem modalidade';
      const cat = (r.categoria_sugerida ?? '').trim() || 'A classificar';
      const em = mapMod.get(mod) ?? { total: 0, qtd: 0 };
      em.total += v;
      em.qtd += 1;
      mapMod.set(mod, em);
      const ec = mapCat.get(cat) ?? { total: 0, qtd: 0 };
      ec.total += v;
      ec.qtd += 1;
      mapCat.set(cat, ec);
    }
    for (const [nome, v] of mapMod) porModalidade.push({ nome, total: v.total, qtd: v.qtd });
    for (const [nome, v] of mapCat) porCategoria.push({ nome, total: v.total, qtd: v.qtd });
    porModalidade.sort((a, b) => b.total - a.total);
    porCategoria.sort((a, b) => b.total - a.total);

    let porFuncionario: { nome: string; total: number; qtd: number }[] = [];
    if (tipo === 'saida') {
      const { data: despesasData, error: despesasErr } = await supabase
        .from('despesas')
        .select('id, valor, funcionario')
        .gte('data', inicio)
        .lte('data', fim)
        .limit(5000);
      if (!despesasErr && despesasData) {
        const mapF = new Map<string, { total: number; qtd: number }>();
        for (const d of despesasData as { valor: number; funcionario: string | null }[]) {
          const nome = (d.funcionario ?? '').trim() || 'Sem funcionário';
          const e = mapF.get(nome) ?? { total: 0, qtd: 0 };
          e.total += Math.abs(Number(d.valor || 0));
          e.qtd += 1;
          mapF.set(nome, e);
        }
        porFuncionario = Array.from(mapF.entries())
          .map(([nome, v]) => ({ nome, total: v.total, qtd: v.qtd }))
          .sort((a, b) => b.total - a.total);
      }
    }

    res.json({
      mes,
      ano,
      tipo,
      totais: { total: totalValor, qtd },
      por_modalidade: tipo === 'entrada' ? porModalidade : [],
      por_categoria: porCategoria,
      por_funcionario: tipo === 'saida' ? porFuncionario : [],
      fonte: 'v_transacoes_export + filtro oficial' + (tipo === 'saida' ? '; por_funcionario: tabela despesas' : ''),
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/** GET /api/categorias-banco/detalhe?mes=&ano=&tipo=&grupo=modalidade|categoria|funcionario&chave=...&page=&pageSize= */
router.get('/categorias-banco/detalhe', async (req: Request, res: Response) => {
  try {
    const parsed = parseQuery(categoriasDetalheQuerySchema, req.query as Record<string, unknown>);
    if (!parsed.ok) return res.status(400).json({ error: parsed.message, itens: [], total: 0 });

    const { mes, ano, tipo, grupo, chave, page, pageSize } = parsed.data;
    const supabase = getSupabase();
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.', itens: [], total: 0 });

    if (grupo === 'funcionario' && tipo !== 'saida') {
      return res.status(400).json({
        error: 'grupo=funcionario só pode ser usado com tipo=saida (dados da tabela despesas).',
        itens: [],
        total: 0,
      });
    }

    const { inicio, fim } = rangeMes(mes, ano);
    const chaveNorm = normKey(chave);

    if (grupo === 'funcionario' && tipo === 'saida') {
      const { data, error } = await supabase
        .from('despesas')
        .select('id, data, valor, descricao, categoria, subcategoria, centro_custo, funcionario, origem')
        .gte('data', inicio)
        .lte('data', fim)
        .limit(5000);
      if (error) return res.status(502).json({ error: error.message, itens: [], total: 0 });

      const todos = (data ?? []) as {
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
      const filtrados = todos.filter((d) => {
        const f = (d.funcionario ?? '').trim() || 'Sem funcionário';
        return normKey(f) === chaveNorm || normKey(f).includes(chaveNorm) || chaveNorm.includes(normKey(f));
      });
      const total = filtrados.length;
      const start = (page - 1) * pageSize;
      const slice = filtrados.slice(start, start + pageSize);
      return res.json({
        mes,
        ano,
        tipo,
        grupo,
        chave,
        total,
        page,
        pageSize,
        itens: slice.map((d) => ({
          id: d.id,
          data: d.data,
          valor: Number(d.valor),
          descricao: d.descricao,
          categoria: d.categoria,
          funcionario: d.funcionario,
          origem: 'despesas',
        })),
      });
    }

    const { data, error } = await supabase
      .from('v_transacoes_export')
      .select(
        'id, data, pessoa, valor, descricao, tipo, categoria_sugerida, subcategoria_sugerida, modalidade, nome_aluno, origem_categoria',
      )
      .gte('data', inicio)
      .lte('data', fim)
      .limit(8000);

    if (error) return res.status(502).json({ error: error.message, itens: [], total: 0 });

    const rows = (data ?? []) as RowExport[];
    const bases: TransacaoBase[] = rows.map((r) => ({
      id: r.id,
      data: r.data,
      pessoa: r.pessoa,
      valor: Number(r.valor),
      descricao: r.descricao,
      tipo: r.tipo,
    }));
    const oficiais = filtrarTransacoesOficiais(bases);
    const lista = tipo === 'entrada' ? oficiais.entradas : oficiais.saidas;
    const ids = new Set(lista.map((x) => x.id));
    let filtradas = rows.filter((r) => ids.has(r.id));

    if (grupo === 'modalidade') {
      filtradas = filtradas.filter((r) => {
        const m = (r.modalidade ?? '').trim() || 'Sem modalidade';
        return normKey(m) === chaveNorm || normKey(m).includes(chaveNorm) || chaveNorm.includes(normKey(m));
      });
    } else if (grupo === 'categoria') {
      filtradas = filtradas.filter((r) => {
        const c = (r.categoria_sugerida ?? '').trim() || 'A classificar';
        return normKey(c) === chaveNorm || normKey(c).includes(chaveNorm) || chaveNorm.includes(normKey(c));
      });
    } else {
      return res.status(400).json({
        error: 'grupo deve ser modalidade ou categoria para detalhe do extrato (v_transacoes_export).',
        itens: [],
        total: 0,
      });
    }

    const total = filtradas.length;
    const start = (page - 1) * pageSize;
    const slice = filtradas.slice(start, start + pageSize).sort((a, b) => (a.data < b.data ? 1 : -1));

    res.json({
      mes,
      ano,
      tipo,
      grupo,
      chave,
      total,
      page,
      pageSize,
      itens: slice.map((r) => ({
        id: r.id,
        data: r.data,
        pessoa: r.pessoa,
        valor: Number(r.valor),
        descricao: r.descricao,
        tipo: r.tipo,
        categoria_sugerida: r.categoria_sugerida,
        subcategoria_sugerida: r.subcategoria_sugerida,
        modalidade: r.modalidade,
        nome_aluno: r.nome_aluno,
        origem_categoria: r.origem_categoria,
        origem: 'v_transacoes_export',
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e), itens: [], total: 0 });
  }
});

export default router;
