import { Router, Request, Response } from 'express';
import { getSupabase } from '../services/supabaseClient.js';
import {
  filtrarTransacoesOficiais,
  metodoPagamentoFinal,
  normalizarMetodoPagamento,
  normalizarTipoTransacao,
  type MetodoPagamento,
} from '../services/transacoesFiltro.js';
import { parseQuery, transacoesQuerySchema } from '../validation/apiQuery.js';

const router = Router();

type TransacaoComMetodo = {
  id: string;
  data: string;
  pessoa: string;
  valor: number;
  descricao: string | null;
  tipo: 'entrada' | 'saida';
  metodo: MetodoPagamento;
  metodoRaw: string | null;
};

type ResumoDia = { data: string; entradas: number; saidas: number; saldo: number; qtd: number };
type ResumoMetodo = {
  metodo: MetodoPagamento;
  entradas_valor: number;
  entradas_qtd: number;
  saidas_valor: number;
  saidas_qtd: number;
  total_valor: number;
  total_qtd: number;
};

function inferirMetodoRaw(pessoa: string, descricao: string | null): string {
  return `${pessoa ?? ''} ${descricao ?? ''}`.trim();
}

/** GET /api/transacoes?mes=3&ano=2026&tipo=entrada|saida|todos – Lista transações do mês (Supabase) com filtros e resumos. */
router.get('/transacoes', async (req: Request, res: Response) => {
  try {
    const parsed = parseQuery(transacoesQuerySchema, req.query as Record<string, unknown>);
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.message, itens: [] });
    }
    const { mes, ano, tipo, metodo, q, dia, dia_fim, limit, offset } = parsed.data;
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
      .limit(5000);

    if (error) return res.status(502).json({ error: error.message, itens: [] });

    const todas = (data ?? []) as { id: string; data: string; pessoa: string; valor: number; descricao: string | null; tipo: string }[];

    const oficiais = filtrarTransacoesOficiais(todas);
    const base = tipo === 'entrada' ? oficiais.entradas : tipo === 'saida' ? oficiais.saidas : [...oficiais.entradas, ...oficiais.saidas];

    const comMetodo: TransacaoComMetodo[] = base.map((t) => {
      const metodoRaw = inferirMetodoRaw(t.pessoa, t.descricao);
      const tipoN = normalizarTipoTransacao(t.tipo);
      return {
        id: t.id,
        data: t.data,
        pessoa: t.pessoa,
        valor: Number(t.valor || 0),
        descricao: t.descricao,
        tipo: tipoN,
        metodo: metodoPagamentoFinal(metodoRaw, tipoN),
        metodoRaw: metodoRaw || null,
      };
    });

    const qNorm = (q ?? '').trim().toLowerCase();
    const metodoNorm = metodo ? normalizarMetodoPagamento(metodo) : null;
    const filtradas = comMetodo.filter((t) => {
      if (dia && dia_fim) {
        const dMin = dia <= dia_fim ? dia : dia_fim;
        const dMax = dia <= dia_fim ? dia_fim : dia;
        if (t.data < dMin || t.data > dMax) return false;
      } else if (dia) {
        if (t.data !== dia) return false;
      }
      if (metodoNorm && t.metodo !== metodoNorm) return false;
      if (qNorm) {
        const hay = `${t.pessoa ?? ''} ${t.descricao ?? ''}`.toLowerCase();
        if (!hay.includes(qNorm)) return false;
      }
      return true;
    });

    filtradas.sort((a, b) => {
      if (a.data < b.data) return 1;
      if (a.data > b.data) return -1;
      return String(b.id).localeCompare(String(a.id));
    });

    const paginadas = filtradas.slice(offset, offset + limit);

    const resumoGeral = filtradas.reduce(
      (acc, t) => {
        if (t.tipo === 'entrada') acc.total_entradas += Math.abs(t.valor);
        else acc.total_saidas += Math.abs(t.valor);
        acc.quantidade_total += 1;
        return acc;
      },
      { total_entradas: 0, total_saidas: 0, saldo_liquido: 0, quantidade_total: 0 }
    );
    resumoGeral.saldo_liquido = resumoGeral.total_entradas - resumoGeral.total_saidas;

    const mapDia = new Map<string, ResumoDia>();
    for (const t of filtradas) {
      const cur = mapDia.get(t.data) ?? { data: t.data, entradas: 0, saidas: 0, saldo: 0, qtd: 0 };
      if (t.tipo === 'entrada') cur.entradas += Math.abs(t.valor);
      else cur.saidas += Math.abs(t.valor);
      cur.qtd += 1;
      cur.saldo = cur.entradas - cur.saidas;
      mapDia.set(t.data, cur);
    }
    const resumoPorDia = [...mapDia.values()].sort((a, b) => (a.data < b.data ? 1 : -1));

    const mapMetodo = new Map<MetodoPagamento, ResumoMetodo>();
    for (const t of filtradas) {
      const cur =
        mapMetodo.get(t.metodo) ??
        {
          metodo: t.metodo,
          entradas_valor: 0,
          entradas_qtd: 0,
          saidas_valor: 0,
          saidas_qtd: 0,
          total_valor: 0,
          total_qtd: 0,
        };
      if (t.tipo === 'entrada') {
        cur.entradas_valor += Math.abs(t.valor);
        cur.entradas_qtd += 1;
      } else {
        cur.saidas_valor += Math.abs(t.valor);
        cur.saidas_qtd += 1;
      }
      cur.total_valor += Math.abs(t.valor);
      cur.total_qtd += 1;
      mapMetodo.set(t.metodo, cur);
    }
    const resumoPorMetodo = [...mapMetodo.values()].sort((a, b) => b.total_valor - a.total_valor);

    res.json({
      itens: paginadas,
      mes,
      ano,
      tipo,
      resumo_geral: resumoGeral,
      resumo_por_dia: resumoPorDia,
      resumo_por_metodo: resumoPorMetodo,
      total_filtrado: filtradas.length,
      filtros_aplicados: {
        mes,
        ano,
        tipo,
        metodo: metodoNorm,
        q: q ?? null,
        dia: dia ?? null,
        dia_fim: dia_fim ?? null,
        limit,
        offset,
      },
    });
  } catch (e) {
    res.status(500).json({
      error: e instanceof Error ? e.message : String(e),
      itens: [],
    });
  }
});

export default router;
