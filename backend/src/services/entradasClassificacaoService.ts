import type { SupabaseClient } from '@supabase/supabase-js';
import { hintAbaFluxoParaControle } from '../domain/entradas/abaControleMap.js';
import {
  matchAluguelCoworkingParaPagador,
  resolverSegmentoEntradaGrupo,
} from '../domain/entradas/aluguelCoworkingMatch.js';
import {
  loadCatalogoEntradasParceirosMes,
  resolveHintNoCatalogo,
  type CategoriaEntradaLinha,
} from '../domain/entradas/categoriasEntrada.js';
import { linhaTemplateKey } from '../domain/despesas/categoriasSaida.js';
import { readControleCaixa } from './controleCaixaRead.js';
import { isNameCompatible } from '../logic/conciliacaoTexto.js';
import {
  buildGruposEntrada,
  buildHistoricoNormSet,
  classificarTransacaoEntrada,
  historicoRange6Meses,
  rangeMes,
  type GrupoEntrada,
  type EntradaTransacaoRow,
  type TransacaoEntradaClassificada,
} from '../logic/entradasAgrupamento.js';
import { normalizePessoa } from '../logic/normalizePessoa.js';
import type { MapeamentoRow } from '../logic/despesasMapeamento.js';
import { filtrarTransacoesOficiais, type TransacaoBase } from './transacoesFiltro.js';
import { loadMapeamentosEntradaRows } from './mapeamentoPessoaCategoriaQuery.js';
import { listVinculosMes } from './validacaoVinculos.js';
import {
  buildGruposCartaoEntrada,
  fluxoItemFromRow,
  isEntradaCartaoAgregada,
  type FluxoPagamentoMin,
} from '../logic/entradasCartaoGrupos.js';
import {
  buildGruposPixComVinculos,
  resolveTransacoesGrupoPorKey,
} from '../logic/entradasVinculosGrupo.js';
import type { PlanilhaItem } from '../logic/conciliacaoPagamentoMatch.js';
import {
  applyDuplicataAlertas,
  enrichTransacaoCompetenciaEntrada,
  loadCompetenciasMap,
  transacaoContaNaCompetencia,
} from './transacaoCompetenciaService.js';

async function loadMapeamentosEntrada(supabase: SupabaseClient): Promise<MapeamentoRow[]> {
  return loadMapeamentosEntradaRows(supabase);
}

function shiftMes(mes: number, ano: number, delta: number): { mes: number; ano: number } {
  let m = mes + delta;
  let y = ano;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return { mes: m, ano: y };
}

function dataNoMes(dataIso: string, mes: number, ano: number): boolean {
  const m = String(dataIso).match(/^(\d{4})-(\d{2})/);
  if (!m) return false;
  return Number(m[1]) === ano && Number(m[2]) === mes;
}

async function loadEntradasJanelaCompetencia(
  supabase: SupabaseClient,
  mes: number,
  ano: number,
): Promise<EntradaTransacaoRow[]> {
  const prev = shiftMes(mes, ano, -1);
  const next = shiftMes(mes, ano, 1);
  const [cur, p, n] = await Promise.all([
    loadEntradasMes(supabase, mes, ano),
    loadEntradasMes(supabase, prev.mes, prev.ano),
    loadEntradasMes(supabase, next.mes, next.ano),
  ]);
  const map = new Map<string, EntradaTransacaoRow>();
  for (const row of [...p, ...cur, ...n]) map.set(row.id, row);
  return [...map.values()];
}

async function loadEntradasMes(supabase: SupabaseClient, mes: number, ano: number): Promise<EntradaTransacaoRow[]> {
  const { inicio, fim } = rangeMes(mes, ano);
  const { data, error } = await supabase
    .from('v_transacoes_export')
    .select(
      'id, data, pessoa, valor, descricao, tipo, categoria_sugerida, origem_categoria, modalidade, nome_aluno',
    )
    .gte('data', inicio)
    .lte('data', fim)
    .limit(5000);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as (EntradaTransacaoRow & { tipo: string })[];
  const bases: TransacaoBase[] = rows.map((r) => ({
    id: r.id,
    data: r.data,
    pessoa: r.pessoa,
    valor: Number(r.valor),
    descricao: r.descricao,
    tipo: r.tipo,
  }));
  const oficiais = filtrarTransacoesOficiais(bases);
  const ids = new Set(oficiais.entradas.map((x) => x.id));
  return rows.filter((r) => ids.has(r.id));
}

async function loadHistoricoPessoasEntrada(supabase: SupabaseClient, mes: number, ano: number) {
  const { inicio, fim } = historicoRange6Meses(mes, ano);
  const { data, error } = await supabase
    .from('v_transacoes_export')
    .select('pessoa, data, tipo')
    .gte('data', inicio)
    .lte('data', fim)
    .eq('tipo', 'entrada')
    .limit(8000);
  if (error) throw new Error(error.message);
  return (data ?? []) as { pessoa: string; data: string }[];
}

type FluxoAlunoRow = {
  aluno_nome: string;
  aba: string;
  modalidade: string;
  pagador_pix: string | null;
  responsaveis: string | null;
};

async function loadFluxoAlunos(supabase: SupabaseClient): Promise<FluxoAlunoRow[]> {
  const { data, error } = await supabase
    .from('fluxo_alunos_operacionais')
    .select('aluno_nome, aba, modalidade, pagador_pix, responsaveis')
    .eq('ativo', true)
    .limit(5000);
  if (error) return [];
  return (data ?? []) as FluxoAlunoRow[];
}

export type EntradasClassificacaoContext = {
  mes: number;
  ano: number;
  catalog: CategoriaEntradaLinha[];
  transacoes: TransacaoEntradaClassificada[];
  grupos: GrupoEntrada[];
  mapeamentos: MapeamentoRow[];
};

async function loadValoresAluguelControle(mes: number, ano: number): Promise<Map<string, number>> {
  const result = await readControleCaixa(mes, ano);
  const map = new Map<string, number>();
  if ('error' in result) return map;
  for (const bloco of result.data.blocos) {
    if (bloco.tipo !== 'entrada') continue;
    const titulo = bloco.titulo.toLowerCase();
    if (bloco.templateKey !== 'entrada_aluguel_coworking' && !titulo.includes('aluguel') && !titulo.includes('coworking')) {
      continue;
    }
    for (const linha of bloco.linhas) {
      const key = linhaTemplateKey(linha.templateKey, linha.id);
      const v = linha.valor;
      if (v != null && v > 0) map.set(key, v);
    }
  }
  return map;
}

function enrichGrupoSegmentoAluguel(
  g: GrupoEntrada,
  catalog: CategoriaEntradaLinha[],
  valoresAluguel: Map<string, number>,
): void {
  const match = matchAluguelCoworkingParaPagador(g.pessoa_exibida, g.total_mes, catalog, valoresAluguel);
  g.match_aluguel = match
    ? {
        template_key: match.template_key,
        label: match.label,
        confianca: match.confianca,
        motivo: match.motivo,
      }
    : null;
  g.segmento = resolverSegmentoEntradaGrupo({
    bloco_template_key: g.bloco_template_key,
    bloco_titulo: g.bloco_titulo,
    template_key: g.template_key,
    aba_fluxo: g.aba_fluxo,
    aluno_nome: g.aluno_nome,
    sugestao_fluxo: g.sugestao_fluxo,
    match_aluguel: match,
  });
}

async function loadFluxoPagamentosMesMap(
  supabase: SupabaseClient,
  mes: number,
  ano: number,
): Promise<Map<string, PlanilhaItem>> {
  const { inicio, fim } = rangeMes(mes, ano);
  const { data, error } = await supabase
    .from('fluxo_pagamentos_operacionais')
    .select(
      'id, aba, modalidade, aluno_nome, pagador_pix, responsaveis, data_pagamento, forma, valor',
    )
    .gte('data_pagamento', inicio)
    .lte('data_pagamento', fim)
    .limit(5000);
  if (error) return new Map();
  const map = new Map<string, PlanilhaItem>();
  for (const row of (data ?? []) as FluxoPagamentoMin[]) {
    const item = fluxoItemFromRow(row);
    map.set(item.id, item);
  }
  return map;
}

export function transacoesDoGrupoEntrada(
  grupo: GrupoEntrada,
  transacoes: TransacaoEntradaClassificada[],
): TransacaoEntradaClassificada[] {
  const porKey = resolveTransacoesGrupoPorKey(grupo.grupo_key, transacoes);
  if (porKey) return porKey;
  return transacoes.filter((t) => t.pessoa_normalizada === grupo.pessoa_normalizada);
}

export async function buildEntradasContext(
  supabase: SupabaseClient,
  mes: number,
  ano: number,
): Promise<EntradasClassificacaoContext> {
  const prevMes = shiftMes(mes, ano, -1);
  const nextMes = shiftMes(mes, ano, 1);
  const [entradas, mapeamentos, histRows, catalog, fluxoAlunos, valoresAluguel, vinculos, vincPrev, vincNext, fluxoById, fluxoPrev, fluxoNext] =
    await Promise.all([
    loadEntradasJanelaCompetencia(supabase, mes, ano),
    loadMapeamentosEntrada(supabase),
    loadHistoricoPessoasEntrada(supabase, mes, ano),
    loadCatalogoEntradasParceirosMes(mes, ano),
    loadFluxoAlunos(supabase),
    loadValoresAluguelControle(mes, ano),
    listVinculosMes(mes, ano),
    listVinculosMes(prevMes.mes, prevMes.ano),
    listVinculosMes(nextMes.mes, nextMes.ano),
    loadFluxoPagamentosMesMap(supabase, mes, ano),
    loadFluxoPagamentosMesMap(supabase, prevMes.mes, prevMes.ano),
    loadFluxoPagamentosMesMap(supabase, nextMes.mes, nextMes.ano),
  ]);
  const allVinculos = [...vinculos, ...vincPrev, ...vincNext];
  const fluxoMerged = new Map([...fluxoPrev, ...fluxoById, ...fluxoNext]);
  const historicoNorms = buildHistoricoNormSet(histRows, mes, ano);
  const transacoesClassificadas = entradas.map((t) =>
    classificarTransacaoEntrada(t, mapeamentos, mes, ano, catalog),
  );
  const competenciaMap = await loadCompetenciasMap(
    supabase,
    transacoesClassificadas.map((t) => t.id),
  );
  const transacoesEnriquecidas = applyDuplicataAlertas(
    transacoesClassificadas.map((t) =>
      enrichTransacaoCompetenciaEntrada(t, competenciaMap, allVinculos, fluxoMerged),
    ),
  );
  const transacoesPix = transacoesEnriquecidas.filter(
    (t) => dataNoMes(t.data, mes, ano) && !isEntradaCartaoAgregada(t.pessoa, t.descricao),
  );
  const transacoesCartao = transacoesEnriquecidas.filter(
    (t) => dataNoMes(t.data, mes, ano) && isEntradaCartaoAgregada(t.pessoa, t.descricao),
  );

  const { grupos: gruposPixVinculo, transacoesRestantes: pixSemVinculoTxn } = buildGruposPixComVinculos(
    transacoesPix,
    allVinculos,
    fluxoMerged,
    mapeamentos,
    mes,
    ano,
    catalog,
  );
  const gruposPix = buildGruposEntrada(
    pixSemVinculoTxn,
    mapeamentos,
    mes,
    ano,
    historicoNorms,
    catalog,
  );
  const gruposCartao = buildGruposCartaoEntrada(
    transacoesCartao,
    allVinculos,
    fluxoMerged,
    mapeamentos,
    mes,
    ano,
    catalog,
  );
  const grupos = [...gruposPixVinculo, ...gruposPix, ...gruposCartao].sort((a, b) => {
    if (b.score_repeticao !== a.score_repeticao) return b.score_repeticao - a.score_repeticao;
    if (b.total_mes !== a.total_mes) return b.total_mes - a.total_mes;
    return a.titulo_card.localeCompare(b.titulo_card, 'pt-BR');
  });
  const transacoes = transacoesEnriquecidas;

  for (const g of grupos) {
    if (g.estado === 'classificado') {
      enrichGrupoSegmentoAluguel(g, catalog, valoresAluguel);
      continue;
    }
    if (g.origem_grupo === 'cartao_avulso') {
      enrichGrupoSegmentoAluguel(g, catalog, valoresAluguel);
      continue;
    }
    const itens = transacoesDoGrupoEntrada(g, transacoes);
    const alunoView = itens.find((x) => (x.nome_aluno ?? '').trim())?.nome_aluno?.trim();
    const modView = itens.find((x) => (x.modalidade ?? '').trim())?.modalidade?.trim();
    if (alunoView) g.aluno_nome = alunoView;
    if (modView) g.modalidade = modView;

    for (const row of fluxoAlunos) {
      const respRaw = row.responsaveis;
      const respList = Array.isArray(respRaw)
        ? respRaw.map(String)
        : typeof respRaw === 'string'
          ? respRaw.split(/[,;]/).map((s) => s.trim())
          : [];
      const nomes = [row.aluno_nome, row.pagador_pix, ...respList].filter(Boolean) as string[];
      const match = nomes.some((n) => isNameCompatible(n, g.pessoa_exibida));
      if (!match) continue;
      g.aba_fluxo = row.aba;
      if (!g.aluno_nome) g.aluno_nome = row.aluno_nome;
      if (!g.modalidade) g.modalidade = row.modalidade;
      break;
    }
    if (g.aluno_nome && g.modalidade) {
      g.titulo_card = `${g.aluno_nome} · ${g.modalidade}`;
    }
    enrichGrupoSegmentoAluguel(g, catalog, valoresAluguel);
  }

  return { mes, ano, catalog, transacoes, grupos, mapeamentos };
}

const ENTRADAS_CONTEXT_CACHE_TTL_MS = 30_000;
const entradasContextCache = new Map<
  string,
  { expiresAt: number; ctx: EntradasClassificacaoContext }
>();
const entradasContextInflight = new Map<string, Promise<EntradasClassificacaoContext>>();

export function invalidateEntradasContextCache(mes?: number, ano?: number): void {
  if (mes != null && ano != null) {
    const key = `${mes}-${ano}`;
    entradasContextCache.delete(key);
    entradasContextInflight.delete(key);
    return;
  }
  entradasContextCache.clear();
  entradasContextInflight.clear();
}

/** Evita reconstruir contexto duas vezes quando resumo e grupos carregam em paralelo. */
export async function getEntradasContextCached(
  supabase: SupabaseClient,
  mes: number,
  ano: number,
): Promise<EntradasClassificacaoContext> {
  const key = `${mes}-${ano}`;
  const now = Date.now();
  const cached = entradasContextCache.get(key);
  if (cached && cached.expiresAt > now) return cached.ctx;

  let inflight = entradasContextInflight.get(key);
  if (!inflight) {
    inflight = buildEntradasContext(supabase, mes, ano)
      .then((ctx) => {
        entradasContextCache.set(key, { expiresAt: Date.now() + ENTRADAS_CONTEXT_CACHE_TTL_MS, ctx });
        entradasContextInflight.delete(key);
        return ctx;
      })
      .catch((err) => {
        entradasContextInflight.delete(key);
        throw err;
      });
    entradasContextInflight.set(key, inflight);
  }
  return inflight;
}

export function sugestaoEntradaParaGrupo(
  grupo: GrupoEntrada,
  itens: TransacaoEntradaClassificada[],
  catalog: CategoriaEntradaLinha[],
): {
  aba: string | null;
  modalidade: string | null;
  aluno_nome: string | null;
  template_key: string | null;
  label: string | null;
  origem: string;
  confianca: string;
} | null {
  const t = itens[0];
  if (!t) return null;

  if (grupo.sugestao_fluxo) {
    return {
      aba: grupo.aba_fluxo,
      modalidade: grupo.modalidade,
      aluno_nome: grupo.aluno_nome,
      template_key: grupo.sugestao_fluxo.template_key,
      label: grupo.sugestao_fluxo.label,
      origem: 'validacao_fluxo',
      confianca: 'alta',
    };
  }

  if (grupo.segmento === 'aluguel_coworking' && grupo.match_aluguel) {
    return {
      aba: null,
      modalidade: null,
      aluno_nome: null,
      template_key: grupo.match_aluguel.template_key,
      label: grupo.match_aluguel.label,
      origem: 'aluguel_nome_valor',
      confianca: grupo.match_aluguel.confianca,
    };
  }

  if (grupo.aba_fluxo || grupo.modalidade) {
    const hint = hintAbaFluxoParaControle(grupo.aba_fluxo ?? '', grupo.modalidade);
    if (hint) {
      const cat = resolveHintNoCatalogo(catalog, hint);
      if (cat) {
        return {
          aba: grupo.aba_fluxo,
          modalidade: grupo.modalidade,
          aluno_nome: grupo.aluno_nome,
          template_key: cat.templateKey,
          label: cat.label,
          origem: 'fluxo_operacional',
          confianca: 'media',
        };
      }
    }
  }

  if ((t.origem_categoria ?? '') === 'cadastro_mensalidade' && (t.modalidade ?? '').trim()) {
    const hint = hintAbaFluxoParaControle(t.modalidade ?? '', t.modalidade);
    const cat = hint ? resolveHintNoCatalogo(catalog, hint) : null;
    if (cat) {
      return {
        aba: null,
        modalidade: t.modalidade,
        aluno_nome: t.nome_aluno,
        template_key: cat.templateKey,
        label: cat.label,
        origem: 'cadastro_mensalidade',
        confianca: 'alta',
      };
    }
  }

  if (grupo.aba_fluxo) {
    const hint = hintAbaFluxoParaControle(grupo.aba_fluxo, grupo.modalidade);
    if (hint) {
      return {
        aba: grupo.aba_fluxo,
        modalidade: grupo.modalidade,
        aluno_nome: grupo.aluno_nome,
        template_key: hint.templateKeyPreferido,
        label: hint.labelEsperado,
        origem: 'heuristica_aba',
        confianca: 'baixa',
      };
    }
  }

  return null;
}

export type VisaoControle = 'caixa' | 'competencia';

export function buildResumoEntradasFromContext(
  ctx: EntradasClassificacaoContext,
  visao: VisaoControle = 'caixa',
) {
  const transacoes =
    visao === 'caixa'
      ? ctx.transacoes.filter((t) => dataNoMes(t.data, ctx.mes, ctx.ano))
      : ctx.transacoes.filter((t) => transacaoContaNaCompetencia(t, ctx.mes, ctx.ano));

  const total_entradas = transacoes.reduce((s, t) => s + Math.abs(Number(t.valor || 0)), 0);
  let total_classificado = 0;
  let valor_pendente = 0;
  const catMap = new Map<
    string,
    {
      template_key: string;
      label: string;
      bloco_template_key: string;
      bloco_titulo: string;
      bloco_ordem: number;
      ordem: number;
      total: number;
      qtd_transacoes: number;
      pagadores: Set<string>;
    }
  >();

  for (const c of ctx.catalog) {
    catMap.set(c.templateKey, {
      template_key: c.templateKey,
      label: c.label,
      bloco_template_key: c.blocoTemplateKey,
      bloco_titulo: c.blocoTitulo,
      bloco_ordem: c.blocoOrdem,
      ordem: c.ordem,
      total: 0,
      qtd_transacoes: 0,
      pagadores: new Set(),
    });
  }

  for (const t of transacoes) {
    const v = Math.abs(Number(t.valor || 0));
    if (t.origem_efetiva === 'mapeamento_manual' && t.template_key_efetivo) {
      total_classificado += v;
      let bucket = catMap.get(t.template_key_efetivo);
      if (!bucket) {
        bucket = {
          template_key: t.template_key_efetivo,
          label: t.categoria_efetiva ?? t.template_key_efetivo,
          bloco_template_key: 'legado',
          bloco_titulo: 'Fora do Controle atual',
          bloco_ordem: 999,
          ordem: 0,
          total: 0,
          qtd_transacoes: 0,
          pagadores: new Set(),
        };
        catMap.set(t.template_key_efetivo, bucket);
      }
      bucket.total += v;
      bucket.qtd_transacoes += 1;
      bucket.pagadores.add(t.pessoa_normalizada);
    } else {
      valor_pendente += v;
    }
  }

  const qtd_grupos_pendentes = ctx.grupos.filter((g) => g.estado === 'pendente').length;
  const pct_classificado = total_entradas > 0 ? (total_classificado / total_entradas) * 100 : 0;

  const por_categoria = [...catMap.values()]
    .map((b) => ({
      template_key: b.template_key,
      label: b.label,
      bloco_template_key: b.bloco_template_key,
      bloco_titulo: b.bloco_titulo,
      total: b.total,
      qtd_transacoes: b.qtd_transacoes,
      qtd_pagadores: b.pagadores.size,
      bloco_ordem: b.bloco_ordem,
      ordem: b.ordem,
    }))
    .sort((a, b) => a.bloco_ordem - b.bloco_ordem || a.ordem - b.ordem);

  const por_bloco = new Map<string, { bloco_titulo: string; bloco_ordem: number; linhas: typeof por_categoria }>();
  for (const row of por_categoria) {
    const key = row.bloco_template_key;
    const bloco = por_bloco.get(key) ?? {
      bloco_titulo: row.bloco_titulo,
      bloco_ordem: row.bloco_ordem,
      linhas: [],
    };
    bloco.linhas.push(row);
    por_bloco.set(key, bloco);
  }

  return {
    kpis: {
      total_entradas,
      total_classificado,
      pct_classificado: Math.round(pct_classificado * 10) / 10,
      valor_pendente,
      qtd_grupos_pendentes,
      qtd_transacoes: transacoes.length,
    },
    por_categoria,
    por_bloco: [...por_bloco.values()].sort((a, b) => a.bloco_ordem - b.bloco_ordem),
    pendente: {
      total: valor_pendente,
      qtd_transacoes: transacoes.filter((t) => t.origem_efetiva !== 'mapeamento_manual').length,
    },
    visao,
  };
}

export function decodeGrupoKeyParam(raw: string): string {
  return normalizePessoa(decodeURIComponent(raw));
}

export const ENTRADAS_CATEGORIA_PENDENTE_KEY = '_pendente';

export function transacoesEntradaPorTemplateKey(
  ctx: EntradasClassificacaoContext,
  templateKey: string,
): TransacaoEntradaClassificada[] {
  if (templateKey === ENTRADAS_CATEGORIA_PENDENTE_KEY) {
    return ctx.transacoes.filter((t) => t.origem_efetiva !== 'mapeamento_manual');
  }
  return ctx.transacoes.filter(
    (t) => t.origem_efetiva === 'mapeamento_manual' && t.template_key_efetivo === templateKey,
  );
}
