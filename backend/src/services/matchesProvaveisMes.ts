/**
 * Matches prováveis do mês (read-only): fluxo sem vínculo × banco livre.
 * Não grava vínculos — só lista para o admin confirmar na Validação.
 */
import { businessRules } from '../businessRules.js';
import {
  enriquecerPlanilhaComPagadoresAprendidos,
} from '../logic/alunoPagadorMatch.js';
import type { BancoItem, PlanilhaItem } from '../logic/conciliacaoPagamentoMatch.js';
import {
  planilhaIdFromFluxoUuid,
  normalizePlanilhaId,
} from '../logic/fluxoPagamentoFingerprint.js';
import { isFormaPagamentoDinheiro } from '../logic/pagamentoDinheiroFluxo.js';
import {
  confiancaLabel,
  rotulosRazoesAdmin,
  MATCHES_PROVAVEIS_PESOS,
  MATCHES_PROVAVEIS_BUCKETS,
} from '../logic/matchesProvaveisScore.js';
import {
  ranquearMatchesProvaveis,
  type MatchesProvaveisSugestao,
} from '../logic/matchesProvaveisRanking.js';
import { shiftISODate } from '../logic/conciliacaoTexto.js';
import { listMapeamentoAlunoPagadorAtivos } from './mapeamentoAlunoPagador.js';
import { carregarGruposFamiliaNoMatch } from './gruposFamiliaPagamento.js';
import { getSupabase } from './supabaseClient.js';
import { filtrarTransacoesOficiais } from './transacoesFiltro.js';
import { listVinculosPorPlanilhaIds } from './validacaoVinculos.js';

function parseResponsaveis(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const j = JSON.parse(raw);
      if (Array.isArray(j)) return j.map(String).filter(Boolean);
    } catch {
      return raw
        .split(/[,;/|]/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [];
}

export type MatchesProvaveisApiItem = {
  bucket: 'alto' | 'medio';
  confianca: string;
  score: number;
  ambiguo: boolean;
  n_para_1: boolean;
  pode_confirmar: boolean;
  planilha_ids: string[];
  banco_id: string;
  aluno: string;
  aba: string;
  modalidade: string;
  forma: string;
  data_fluxo: string;
  data_banco: string;
  valor_fluxo: number;
  valor_banco: number;
  pessoa_banco: string;
  motivos: string[];
  gap_2o: number | null;
};

export type MatchesProvaveisMesResult = {
  mes: number;
  ano: number;
  parametros: {
    pesos: typeof MATCHES_PROVAVEIS_PESOS;
    buckets: typeof MATCHES_PROVAVEIS_BUCKETS;
    flex_dias: number;
  };
  resumo: {
    sem_vinculo: number;
    alto: number;
    medio: number;
    baixo: number;
    sem_candidato: number;
    n1: number;
    listados: number;
  };
  /** Agrupado por data_fluxo (YYYY-MM-DD), dias ordenados. */
  por_dia: Array<{
    data_fluxo: string;
    itens: MatchesProvaveisApiItem[];
  }>;
};

function toApiItem(s: MatchesProvaveisSugestao): MatchesProvaveisApiItem | null {
  if (s.bucket !== 'alto' && s.bucket !== 'medio') return null;
  return {
    bucket: s.bucket,
    confianca: confiancaLabel(s.bucket),
    score: s.score,
    ambiguo: s.ambiguo,
    n_para_1: s.n_para_1,
    pode_confirmar: s.pode_confirmar,
    planilha_ids: s.planilha_ids,
    banco_id: s.banco_id,
    aluno: s.aluno,
    aba: s.aba,
    modalidade: s.modalidade,
    forma: s.forma,
    data_fluxo: s.data_fluxo,
    data_banco: s.data_banco,
    valor_fluxo: s.valor_fluxo,
    valor_banco: s.valor_banco,
    pessoa_banco: s.pessoa_banco,
    motivos: rotulosRazoesAdmin(s.breakdown.razoes),
    gap_2o: s.gap_2o,
  };
}

/**
 * GET payload: sugestões alto/médio da competência, agrupadas por dia do Fluxo.
 */
export async function getMatchesProvaveisMes(mes: number, ano: number): Promise<MatchesProvaveisMesResult> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase não configurado.');

  await carregarGruposFamiliaNoMatch(supabase);
  const regrasAlunoPagador = await listMapeamentoAlunoPagadorAtivos(supabase).catch(() => []);
  const stickyKeys = new Set(
    regrasAlunoPagador.map((r) => `${r.aluno_normalizado}::${r.pessoa_banco_normalizada}`),
  );

  const { data: fluxoRows, error: fluxoErr } = await supabase
    .from('fluxo_pagamentos_operacionais')
    .select(
      'id, aba, modalidade, linha_planilha, aluno_nome, data_pagamento, forma, valor, mes_competencia, ano_competencia, responsaveis, pagador_pix, ordem_lancamento',
    )
    .eq('ano_competencia', ano)
    .eq('mes_competencia', mes);
  if (fluxoErr) throw new Error(fluxoErr.message);

  const planilhasAll: PlanilhaItem[] = (fluxoRows ?? []).map((r) => {
    const base: PlanilhaItem = {
      id: String(r.id),
      aba: String(r.aba ?? ''),
      modalidade: String(r.modalidade ?? r.aba ?? ''),
      aluno: String(r.aluno_nome ?? ''),
      linha: Number(r.linha_planilha || 0),
      data: String(r.data_pagamento).slice(0, 10),
      forma: String(r.forma ?? ''),
      valor: Number(r.valor || 0),
      mesCompetencia: Number(r.mes_competencia),
      anoCompetencia: Number(r.ano_competencia),
      responsaveis: parseResponsaveis(r.responsaveis),
      pagadorPix: r.pagador_pix ? String(r.pagador_pix) : undefined,
    };
    return enriquecerPlanilhaComPagadoresAprendidos(base, regrasAlunoPagador);
  });

  const vinculos = await listVinculosPorPlanilhaIds(planilhasAll.map((p) => p.id));
  const vinculadosPlanilha = new Set(vinculos.map((v) => normalizePlanilhaId(v.planilha_id)));
  const vinculadosBanco = new Set(vinculos.map((v) => v.banco_id));

  // Bancos já usados em qualquer competência (evita sugerir entrada já vinculada)
  const { data: allVinculosBanco } = await supabase
    .from('validacao_pagamentos_vinculos')
    .select('banco_id');
  for (const v of allVinculosBanco ?? []) {
    if (v.banco_id) vinculadosBanco.add(String(v.banco_id));
  }

  const isVinculadoFluxo = (p: PlanilhaItem) =>
    vinculadosPlanilha.has(planilhaIdFromFluxoUuid(p.id)) || vinculadosPlanilha.has(p.id);

  const pendentes = planilhasAll.filter(
    (p) => !isFormaPagamentoDinheiro(p.forma) && !isVinculadoFluxo(p),
  );

  // Janela ampla: cobre ±flex, D+5 Vendas e legado ~D+30
  const inicioMes = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const fimMes = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
  const dataInicio = shiftISODate(inicioMes, -40);
  const dataFim = shiftISODate(fimMes, 10);

  const { data: bancoRows, error: bancoErr } = await supabase
    .from('transacoes')
    .select('id, data, pessoa, valor, descricao, tipo')
    .gte('data', dataInicio)
    .lte('data', dataFim)
    .order('data', { ascending: true });
  if (bancoErr) throw new Error(bancoErr.message);

  const { entradas } = filtrarTransacoesOficiais(
    (bancoRows ?? []) as {
      id: string;
      data: string;
      pessoa: string;
      valor: number;
      descricao: string | null;
      tipo: string;
    }[],
  );
  const bancoAll: BancoItem[] = entradas.map((r) => ({
    id: r.id,
    data: String(r.data).slice(0, 10),
    pessoa: r.pessoa ?? '',
    descricao: r.descricao ?? null,
    valor: Number(r.valor || 0),
  }));
  const bancoLivres = bancoAll.filter((b) => !vinculadosBanco.has(b.id));

  const flexDays = businessRules.conciliacao.bancoJanelaDias;
  const ranked = ranquearMatchesProvaveis({
    pendentes,
    bancoLivres,
    stickyKeys,
    flexDays,
  });

  const listados: MatchesProvaveisApiItem[] = [];
  for (const s of ranked.sugestoes) {
    const item = toApiItem(s);
    if (item) listados.push(item);
  }
  for (const s of ranked.n1) {
    const item = toApiItem(s);
    if (item) listados.push(item);
  }

  listados.sort((a, b) => {
    const d = a.data_fluxo.localeCompare(b.data_fluxo);
    if (d !== 0) return d;
    if (a.bucket !== b.bucket) return a.bucket === 'alto' ? -1 : 1;
    return b.score - a.score;
  });

  const porDiaMap = new Map<string, MatchesProvaveisApiItem[]>();
  for (const item of listados) {
    const arr = porDiaMap.get(item.data_fluxo) ?? [];
    arr.push(item);
    porDiaMap.set(item.data_fluxo, arr);
  }
  const por_dia = [...porDiaMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data_fluxo, itens]) => ({ data_fluxo, itens }));

  return {
    mes,
    ano,
    parametros: {
      pesos: MATCHES_PROVAVEIS_PESOS,
      buckets: MATCHES_PROVAVEIS_BUCKETS,
      flex_dias: flexDays,
    },
    resumo: {
      sem_vinculo: ranked.stats.sem_vinculo,
      alto: ranked.stats.alto,
      medio: ranked.stats.medio + ranked.n1.filter((s) => s.bucket === 'medio').length,
      baixo: ranked.stats.baixo,
      sem_candidato: ranked.stats.sem_candidato,
      n1: ranked.n1.length,
      listados: listados.length,
    },
    por_dia,
  };
}
