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
import {
  listarTransacoesPorCompetencia,
  mapClassificacaoPorId,
  parseCategoriasControleFiltro,
  transacaoPassaFiltroCategorias,
  type ClassificacaoTransacao,
} from '../services/transacoesClassificacaoMap.js';
import { loadCompetenciasMap } from '../services/transacaoCompetenciaService.js';
import { competenciaFromDataIso } from '../domain/competencia/competenciaTransacao.js';

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
  mes_competencia?: number;
  ano_competencia?: number;
  competencia_confirmada?: boolean;
  competencia_origem?: string;
  competencia_sugerida_mes?: number;
  competencia_sugerida_ano?: number;
  competencia_alinha_data?: boolean;
  alerta_duplicata_competencia?: boolean;
};

type ResumoDiaLinha = {
  pessoa: string;
  valor: number;
  tipo: 'entrada' | 'saida';
  descricao: string | null;
  metodo: MetodoPagamento;
};

type ResumoDia = {
  data: string;
  entradas: number;
  saidas: number;
  saldo: number;
  qtd: number;
  linhas: ResumoDiaLinha[];
};
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
    const { mes, ano, tipo, metodo, q, dia, dia_fim, limit, offset, categoria, categorias, categorias_modo, visao } = parsed.data;
    const parsedCats = parseCategoriasControleFiltro(categorias, categoria, categorias_modo);
    if (!parsedCats.ok) {
      return res.status(400).json({
        error: 'categorias inválidas. Use _pendente, entrada::<template_key> ou saida::<template_key>, separados por vírgula.',
        itens: [],
      });
    }
    const categoriasFiltro = parsedCats.filtro;
    const supabase = getSupabase();
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.', itens: [] });

    let comMetodo: TransacaoComMetodo[];
    let classificacaoMap: Map<string, ClassificacaoTransacao> | null = null;

    if (visao === 'competencia') {
      const { itens, classificacao } = await listarTransacoesPorCompetencia(supabase, mes, ano);
      classificacaoMap = classificacao;
      const baseComp = tipo === 'todos' ? itens : itens.filter((t) => t.tipo === tipo);
      comMetodo = baseComp.map((t) => {
        const metodoRaw = inferirMetodoRaw(t.pessoa, t.descricao);
        return {
          ...t,
          valor: Number(t.valor || 0),
          metodo: metodoPagamentoFinal(metodoRaw, t.tipo),
          metodoRaw: metodoRaw || null,
        };
      });
      if (dia) {
        const ini = dia_fim ? (dia <= dia_fim ? dia : dia_fim) : dia;
        const fim = dia_fim ? (dia <= dia_fim ? dia_fim : dia) : dia;
        comMetodo = comMetodo.filter((t) => t.data >= ini && t.data <= fim);
      }
    } else {
      const inicioMes = `${ano}-${String(mes).padStart(2, '0')}-01`;
      const ultimoDia = new Date(ano, mes, 0).getDate();
      const fimMes = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
      const inicioRange = dia && dia_fim ? (dia <= dia_fim ? dia : dia_fim) : dia ?? inicioMes;
      const fimRange = dia && dia_fim ? (dia <= dia_fim ? dia_fim : dia) : dia ?? fimMes;

      const { data, error } = await supabase
        .from('transacoes')
        .select('id, data, pessoa, valor, descricao, tipo')
        .gte('data', inicioRange)
        .lte('data', fimRange)
        .order('data', { ascending: false })
        .order('id', { ascending: false })
        .limit(5000);

      if (error) return res.status(502).json({ error: error.message, itens: [] });

      const todas = (data ?? []) as { id: string; data: string; pessoa: string; valor: number; descricao: string | null; tipo: string }[];

      const oficiais = filtrarTransacoesOficiais(todas);
      const base = tipo === 'entrada' ? oficiais.entradas : tipo === 'saida' ? oficiais.saidas : [...oficiais.entradas, ...oficiais.saidas];

      comMetodo = base.map((t) => {
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

      classificacaoMap = categoriasFiltro ? await mapClassificacaoPorId(supabase, mes, ano) : null;
    }

    const qNorm = (q ?? '').trim().toLowerCase();
    const metodoNorm = metodo ? normalizarMetodoPagamento(metodo) : null;

    const filtradas = comMetodo.filter((t) => {
      if (metodoNorm && t.metodo !== metodoNorm) return false;
      if (qNorm) {
        const hay = `${t.pessoa ?? ''} ${t.descricao ?? ''}`.toLowerCase();
        if (!hay.includes(qNorm)) return false;
      }
      if (classificacaoMap && categoriasFiltro) {
        if (!transacaoPassaFiltroCategorias(t, categoriasFiltro, classificacaoMap)) return false;
      }
      return true;
    });

    filtradas.sort((a, b) => {
      if (a.data < b.data) return 1;
      if (a.data > b.data) return -1;
      return String(b.id).localeCompare(String(a.id));
    });

    const qtdSemCategoria = classificacaoMap
      ? filtradas.filter((t) => !(classificacaoMap!.get(t.id)?.classificado)).length
      : null;

    let paginadas = filtradas.slice(offset, offset + limit).map((t) => {
      if (!classificacaoMap) return t;
      const info = classificacaoMap.get(t.id);
      if (!info) return { ...t, classificado: false };
      return {
        ...t,
        categoria_label: info.categoria_label,
        template_key: info.template_key,
        classificado: info.classificado,
      };
    });

    if (visao === 'caixa') {
      // Enriquecimento leve: competência armazenada ou, na ausência, o próprio mês da data.
      const compStored = await loadCompetenciasMap(supabase, paginadas.map((t) => t.id));
      paginadas = paginadas.map((t) => {
        const stored = compStored.get(t.id);
        const sug = competenciaFromDataIso(t.data);
        const mesComp = stored?.mes_competencia ?? sug.mes;
        const anoComp = stored?.ano_competencia ?? sug.ano;
        return {
          ...t,
          mes_competencia: mesComp,
          ano_competencia: anoComp,
          competencia_confirmada: stored?.confirmada ?? false,
          competencia_sugerida_mes: sug.mes,
          competencia_sugerida_ano: sug.ano,
          competencia_alinha_data: mesComp === sug.mes && anoComp === sug.ano,
        };
      });
    }

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
      const cur = mapDia.get(t.data) ?? { data: t.data, entradas: 0, saidas: 0, saldo: 0, qtd: 0, linhas: [] };
      if (t.tipo === 'entrada') cur.entradas += Math.abs(t.valor);
      else cur.saidas += Math.abs(t.valor);
      cur.qtd += 1;
      cur.saldo = cur.entradas - cur.saidas;
      cur.linhas.push({
        pessoa: t.pessoa,
        valor: Math.abs(t.valor),
        tipo: t.tipo,
        descricao: t.descricao,
        metodo: t.metodo,
      });
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
      qtd_sem_categoria: qtdSemCategoria,
      visao,
      filtros_aplicados: {
        mes,
        ano,
        tipo,
        metodo: metodoNorm,
        q: q ?? null,
        dia: dia ?? null,
        dia_fim: dia_fim ?? null,
        categorias: categoriasFiltro,
        visao,
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
