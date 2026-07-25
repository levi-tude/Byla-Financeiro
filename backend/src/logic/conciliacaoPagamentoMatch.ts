import { businessRules } from '../businessRules.js';
import { alunoNormKey } from './alunoPagadorMatch.js';
import {
  familiaPagamentoChave,
  familiaPagamentoRotulo,
  grupoFamiliaCompativel,
} from './gruposFamiliaPagamento.js';
import {
  isNameCompatible,
  normalizeText,
  scoreNomeCompativel,
  shiftISODate,
} from './conciliacaoTexto.js';
import {
  isCreditoGenericoExtrato,
  janelaEsperadaCreditoRecorrente,
  OFFSET_DIAS_EXTRATO_PADRAO,
  valorPlanilhaBancoCompativel,
} from './creditoRecorrente.js';
import {
  formaFluxoCompativelComBanco,
  fluxoPermiteSugestaoVendasCredito,
} from './meioPagamentoVinculo.js';
import { fluxoUuidFromPlanilhaId, planilhaIdFromFluxoUuid } from './fluxoPagamentoFingerprint.js';

export type PlanilhaItem = {
  id: string;
  aba: string;
  modalidade: string;
  aluno: string;
  linha: number;
  data: string;
  forma: string;
  valor: number;
  mesCompetencia: number;
  anoCompetencia: number;
  responsaveis: string[];
  pagadorPix?: string;
};

export type BancoItem = {
  id: string;
  data: string;
  pessoa: string;
  descricao: string | null;
  valor: number;
};

export type PilatesNomePagadorRow = {
  aluno_nome: string | null;
  nome_pagador: string | null;
  valor: number | null;
  forma_pagamento: string | null;
  atividade_nome: string | null;
};

export type MatchUmResult =
  | { status: 'confirmado'; banco: BancoItem }
  | { status: 'possivel'; candidatos: BancoItem[] }
  | { status: 'nao' };

export type MatchAgrupadoResult =
  | { status: 'possivel'; candidatos: BancoItem[] }
  | { status: 'nao' };

export type PossivelMatchRow = { planilha: PlanilhaItem; candidatos: BancoItem[] };

/** Offsets usados ao buscar liquidação Vendas (padrão D+5 e legado ~D+30). */
export const OFFSETS_JANELA_VENDAS_VALIDACAO = [OFFSET_DIAS_EXTRATO_PADRAO, 30] as const;

export function datasJanelaCreditoRecorrenteParaPlanilha(
  planilha: PlanilhaItem,
  offsets: readonly number[] = OFFSETS_JANELA_VENDAS_VALIDACAO,
): Set<string> {
  const dataStr = planilha.data.slice(0, 10);
  const m = dataStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return new Set();
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  const out = new Set<string>();
  for (const offset of offsets) {
    const { janela } = janelaEsperadaCreditoRecorrente({
      ano,
      mes,
      diaPagamentoFluxo: dia,
      offsetDiasExtrato: offset,
    });
    for (const d of janela) out.add(d);
  }
  return out;
}

export function datasCarregamentoBancoValidacaoDiaria(
  dataFluxoIso: string,
  flexDays: number,
  offsets: readonly number[] = OFFSETS_JANELA_VENDAS_VALIDACAO,
): Set<string> {
  const out = new Set<string>();
  for (let d = -flexDays; d <= flexDays; d++) out.add(shiftISODate(dataFluxoIso, d));
  const m = dataFluxoIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return out;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  for (const offset of offsets) {
    const { janela } = janelaEsperadaCreditoRecorrente({
      ano,
      mes,
      diaPagamentoFluxo: dia,
      offsetDiasExtrato: offset,
    });
    for (const dt of janela) out.add(dt);
  }
  return out;
}

export function bancoCompativelPlanilhaPorValor(planilha: PlanilhaItem, banco: BancoItem): boolean {
  return valorPlanilhaBancoCompativel({
    valorPlanilha: Number(planilha.valor || 0),
    valorBanco: Number(banco.valor || 0),
    pessoa: banco.pessoa,
    descricao: banco.descricao,
  });
}

function bancoElegivelDataParaPlanilha(planilha: PlanilhaItem, banco: BancoItem, flexDays: number): boolean {
  const bancoData = String(banco.data).slice(0, 10);
  if (isCreditoGenericoExtrato(banco.pessoa, banco.descricao)) {
    return datasJanelaCreditoRecorrenteParaPlanilha(planilha).has(bancoData);
  }
  const fluxoData = planilha.data.slice(0, 10);
  for (let d = -flexDays; d <= flexDays; d++) {
    if (shiftISODate(fluxoData, d) === bancoData) return true;
  }
  return false;
}

/** Candidatos Vendas/crédito genérico na janela esperada (sem exigir nome). */
export function candidatosVendasCreditoRecorrente(
  planilha: PlanilhaItem,
  bancoItens: BancoItem[],
  usadosBanco: Set<string>,
): BancoItem[] {
  if (!fluxoPermiteSugestaoVendasCredito(planilha.forma)) return [];
  const janela = datasJanelaCreditoRecorrenteParaPlanilha(planilha);
  return bancoItens.filter(
    (b) =>
      !usadosBanco.has(b.id) &&
      janela.has(String(b.data).slice(0, 10)) &&
      isCreditoGenericoExtrato(b.pessoa, b.descricao) &&
      bancoCompativelPlanilhaPorValor(planilha, b) &&
      formaFluxoCompativelComBanco(planilha.forma, b),
  );
}

function nomesPlanilhaCompativelComBanco(planilha: PlanilhaItem, banco: BancoItem): boolean {
  const nomes = [planilha.aluno, ...(planilha.responsaveis ?? []), planilha.pagadorPix].filter(Boolean) as string[];
  const bancoNames = [banco.pessoa, banco.descricao ?? ''].filter(Boolean) as string[];
  return bancoNames.some((bn) => nomes.some((n) => isNameCompatible(n, bn)));
}

export function scoreNomePlanilhaBanco(planilha: PlanilhaItem, banco: BancoItem): number {
  const nomes = [planilha.aluno, ...(planilha.responsaveis ?? []), planilha.pagadorPix].filter(Boolean) as string[];
  const bancoNames = [banco.pessoa, banco.descricao ?? ''].filter(Boolean) as string[];
  let best = 0;
  for (const bn of bancoNames) {
    for (const n of nomes) {
      best = Math.max(best, scoreNomeCompativel(n, bn));
    }
  }
  return best;
}

function ordenarCandidatosPorNome(planilha: PlanilhaItem, candidatos: BancoItem[]): BancoItem[] {
  return candidatos
    .slice()
    .sort((a, b) => scoreNomePlanilhaBanco(planilha, b) - scoreNomePlanilhaBanco(planilha, a));
}

/**
 * Mesma regra da rota validacao-pagamentos-diaria: valor ± tolerância + nome (e Pilates/pagador quando aplicável).
 */
export function matchUmPagamentoPlanilhaBanco(
  planilha: PlanilhaItem,
  bancoItens: BancoItem[],
  usadosBanco: Set<string>,
  pilatesNomePagadorRows: PilatesNomePagadorRow[],
): MatchUmResult {
  const TOL = businessRules.conciliacao.valorTolerancia;
  const isAnyPlanilhaNomeCompatible = (pl: PlanilhaItem, bancoNome: string): boolean => {
    const nomes = [pl.aluno, ...(pl.responsaveis ?? []), pl.pagadorPix].filter((x) => !!x) as string[];
    return nomes.some((n) => isNameCompatible(n, bancoNome));
  };
  const isBancoNamesCompatible = (pl: PlanilhaItem, banco: BancoItem): boolean => {
    const bancoNames = [banco.pessoa, banco.descricao ?? ''].filter((x) => !!x) as string[];
    return bancoNames.some((bn) => isAnyPlanilhaNomeCompatible(pl, bn));
  };
  const isBancoNamesCompatibleWithPilatesPagador = (pl: PlanilhaItem, banco: BancoItem): boolean => {
    if (!pilatesNomePagadorRows.length) return isBancoNamesCompatible(pl, banco);
    const isPilatesItem =
      normalizeText(pl.aba).includes('PILATES') || normalizeText(pl.modalidade).includes('PILATES');
    if (!isPilatesItem) return isBancoNamesCompatible(pl, banco);
    const bancoCompatBase = isBancoNamesCompatible(pl, banco);
    if (bancoCompatBase) return true;
    const candidatosPagadores = pilatesNomePagadorRows
      .filter((v) => v.nome_pagador && v.valor != null && Math.abs(Number(v.valor || 0) - Number(banco.valor || 0)) <= TOL)
      .filter((v) => (v.aluno_nome ? isNameCompatible(pl.aluno, v.aluno_nome) : false))
      .map((v) => v.nome_pagador!)
      .filter(Boolean);
    return candidatosPagadores.some((pag) => isAnyPlanilhaNomeCompatible(pl, pag));
  };

  const p = planilha;
  const flexDays = businessRules.conciliacao.bancoJanelaDias;
  const candidatosValor = bancoItens.filter(
    (b) =>
      !usadosBanco.has(b.id) &&
      bancoElegivelDataParaPlanilha(p, b, flexDays) &&
      bancoCompativelPlanilhaPorValor(p, b) &&
      formaFluxoCompativelComBanco(p.forma, b),
  );
  const candidatosNome = candidatosValor.filter((b) => isBancoNamesCompatibleWithPilatesPagador(p, b));

  if (candidatosNome.length === 1) {
    return { status: 'confirmado', banco: candidatosNome[0] };
  }
  if (candidatosNome.length > 1) {
    return { status: 'possivel', candidatos: ordenarCandidatosPorNome(p, candidatosNome) };
  }
  if (candidatosValor.length > 0) {
    return { status: 'possivel', candidatos: ordenarCandidatosPorNome(p, candidatosValor) };
  }

  const vendas = candidatosVendasCreditoRecorrente(p, bancoItens, usadosBanco);
  if (vendas.length > 0) {
    return { status: 'possivel', candidatos: vendas };
  }
  return { status: 'nao' };
}

/**
 * Excecao: **varias linhas na planilha** (mesmo aluno em mais de uma atividade, ou mesmo PIX pagando
 * mais de um aluno) contra **uma** entrada no banco com valor = soma. Nao usar para o inverso
 * (varios banco -> uma planilha). Retorno sempre "possivel" para revisao manual.
 */
export function matchPagamentosAgrupadosPlanilhaBanco(
  planilhas: PlanilhaItem[],
  bancoItens: BancoItem[],
  usadosBanco: Set<string>,
  pilatesNomePagadorRows: PilatesNomePagadorRow[],
): MatchAgrupadoResult {
  if (planilhas.length < 2) return { status: 'nao' };
  const base = planilhas[0];
  const valorTotal = planilhas.reduce((s, p) => s + Number(p.valor || 0), 0);
  const nomesGrupo = new Set<string>();
  for (const p of planilhas) {
    if (p.aluno) nomesGrupo.add(p.aluno);
    for (const r of p.responsaveis ?? []) if (r) nomesGrupo.add(r);
    if (p.pagadorPix) nomesGrupo.add(p.pagadorPix);
  }
  const sintetico: PlanilhaItem = {
    ...base,
    id: `agrupado::${planilhas.map((p) => p.id).join('|')}`,
    valor: valorTotal,
    responsaveis: Array.from(nomesGrupo),
  };
  const match = matchUmPagamentoPlanilhaBanco(sintetico, bancoItens, usadosBanco, pilatesNomePagadorRows);
  if (match.status === 'nao') return { status: 'nao' };
  if (match.status === 'confirmado') return { status: 'possivel', candidatos: [match.banco] };
  return { status: 'possivel', candidatos: match.candidatos };
}

export type MatchValidacaoPreliminar =
  | { status: 'confirmado'; planilha: PlanilhaItem; banco: BancoItem }
  | { status: 'possivel'; planilha: PlanilhaItem; candidatos: BancoItem[] }
  | { status: 'nao'; planilha: PlanilhaItem };

function valorIndividualCompativelPlanilhaBanco(planilha: PlanilhaItem, banco: BancoItem, tol: number): boolean {
  return Math.abs(Number(planilha.valor || 0) - Number(banco.valor || 0)) <= tol;
}

function mergeCandidatosBanco(existing: BancoItem[], extra: BancoItem[]): BancoItem[] {
  const byId = new Map<string, BancoItem>();
  for (const c of existing) byId.set(c.id, c);
  for (const c of extra) byId.set(c.id, c);
  return Array.from(byId.values());
}

/**
 * Vários fluxo com o mesmo valor individual apontando para o mesmo banco → revisão manual
 * (nenhum auto-confirmado; todos mantêm o candidato no dropdown).
 */
export function reconciliarAmbiguidadeValorValidacao(
  preliminares: MatchValidacaoPreliminar[],
  tol: number,
): {
  confirmados: Array<{ planilha: PlanilhaItem; banco: BancoItem }>;
  possiveis: PossivelMatchRow[];
  nao: PlanilhaItem[];
} {
  const porBanco = new Map<string, { banco: BancoItem; planilhas: Set<string> }>();

  const registrar = (planilha: PlanilhaItem, banco: BancoItem) => {
    if (!valorIndividualCompativelPlanilhaBanco(planilha, banco, tol)) return;
    let entry = porBanco.get(banco.id);
    if (!entry) {
      entry = { banco, planilhas: new Set() };
      porBanco.set(banco.id, entry);
    }
    entry.planilhas.add(planilha.id);
  };

  for (const item of preliminares) {
    if (item.status === 'confirmado') registrar(item.planilha, item.banco);
    else if (item.status === 'possivel') {
      for (const c of item.candidatos) registrar(item.planilha, c);
    }
  }

  const bancosAmbiguos = new Set<string>();
  for (const [bancoId, { planilhas }] of porBanco) {
    if (planilhas.size > 1) bancosAmbiguos.add(bancoId);
  }

  const confirmados: Array<{ planilha: PlanilhaItem; banco: BancoItem }> = [];
  const possiveisMap = new Map<string, PossivelMatchRow>();
  const nao: PlanilhaItem[] = [];

  for (const item of preliminares) {
    if (item.status === 'confirmado') {
      if (bancosAmbiguos.has(item.banco.id)) {
        const existente = possiveisMap.get(item.planilha.id);
        const candidatos = mergeCandidatosBanco(existente?.candidatos ?? [], [item.banco]);
        possiveisMap.set(item.planilha.id, {
          planilha: item.planilha,
          candidatos: ordenarCandidatosPorNome(item.planilha, candidatos),
        });
      } else {
        confirmados.push({ planilha: item.planilha, banco: item.banco });
      }
      continue;
    }
    if (item.status === 'possivel') {
      const existente = possiveisMap.get(item.planilha.id);
      const candidatos = ordenarCandidatosPorNome(
        item.planilha,
        mergeCandidatosBanco(existente?.candidatos ?? [], item.candidatos),
      );
      possiveisMap.set(item.planilha.id, { planilha: item.planilha, candidatos });
      continue;
    }
    nao.push(item.planilha);
  }

  return {
    confirmados,
    possiveis: Array.from(possiveisMap.values()),
    nao,
  };
}

/**
 * Vários itens "possível" não podem compartilhar o mesmo lançamento no banco a menos que
 * a **soma** dos valores no fluxo bata com o valor do banco (N fluxo → 1 banco).
 * Colisão 1:1 (mesmo valor individual) permanece visível em todos os dropdowns até vínculo manual.
 */
export function resolverColisoesPossivelMatch(rows: PossivelMatchRow[], tol: number): {
  rows: PossivelMatchRow[];
  demovidos: PlanilhaItem[];
} {
  const porBanco = new Map<string, { banco: BancoItem; planilhaIds: Set<string> }>();
  for (const row of rows) {
    for (const c of row.candidatos) {
      let entry = porBanco.get(c.id);
      if (!entry) {
        entry = { banco: c, planilhaIds: new Set() };
        porBanco.set(c.id, entry);
      }
      entry.planilhaIds.add(row.planilha.id);
    }
  }

  const remover = new Map<string, Set<string>>();

  const marcarRemover = (planilhaId: string, bancoId: string) => {
    const set = remover.get(planilhaId) ?? new Set<string>();
    set.add(bancoId);
    remover.set(planilhaId, set);
  };

  for (const [, { banco, planilhaIds }] of porBanco) {
    if (planilhaIds.size <= 1) continue;

    const items = rows.filter((r) => planilhaIds.has(r.planilha.id));
    const sum = items.reduce((s, r) => s + Number(r.planilha.valor || 0), 0);
    const bVal = Number(banco.valor || 0);
    if (Math.abs(sum - bVal) <= tol) continue;

    const individualMatches = items.filter((r) => valorIndividualCompativelPlanilhaBanco(r.planilha, banco, tol));
    if (individualMatches.length === 0) {
      for (const id of planilhaIds) marcarRemover(id, banco.id);
    }
  }

  const demovidos: PlanilhaItem[] = [];
  const out: PossivelMatchRow[] = [];
  for (const row of rows) {
    const removeSet = remover.get(row.planilha.id);
    const candidatos = removeSet
      ? ordenarCandidatosPorNome(row.planilha, row.candidatos.filter((c) => !removeSet.has(c.id)))
      : ordenarCandidatosPorNome(row.planilha, [...row.candidatos]);
    if (candidatos.length === 0) demovidos.push(row.planilha);
    else out.push({ planilha: row.planilha, candidatos });
  }
  return { rows: out, demovidos };
}

export type VinculoDiaResumo = {
  planilha_id: string;
  banco_id: string;
};

export type PossivelMatchRowEnriquecido = PossivelMatchRow & {
  possivel_rateio_mesmo_aluno?: boolean;
  grupo_rateio_ids?: string[];
  rateio_soma?: number;
  mesmo_pagador_multi_aluno?: boolean;
  /** Sticky por catálogo Supabase (ex.: mãe e filha / casal). */
  grupo_familia_pagamento?: boolean;
  grupo_familia_rotulo?: string;
};

export function indexVinculosPorBanco(vinculos: VinculoDiaResumo[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const v of vinculos) {
    const set = map.get(v.banco_id) ?? new Set<string>();
    set.add(v.planilha_id);
    const uuid = fluxoUuidFromPlanilhaId(v.planilha_id);
    if (uuid) set.add(uuid);
    else if (/^[0-9a-f-]{36}$/i.test(v.planilha_id)) set.add(planilhaIdFromFluxoUuid(v.planilha_id));
    map.set(v.banco_id, set);
  }
  return map;
}

function resolverPlanilhaPorVinculoId(
  planilhaId: string,
  planilhasById: Map<string, PlanilhaItem>,
): PlanilhaItem | undefined {
  const direct = planilhasById.get(planilhaId);
  if (direct) return direct;
  const uuid = fluxoUuidFromPlanilhaId(planilhaId);
  if (uuid) {
    const byUuid = planilhasById.get(uuid);
    if (byUuid) return byUuid;
    return planilhasById.get(planilhaIdFromFluxoUuid(uuid));
  }
  if (/^[0-9a-f-]{36}$/i.test(planilhaId)) {
    return planilhasById.get(planilhaIdFromFluxoUuid(planilhaId));
  }
  return undefined;
}

/** Mesmo dia + (mesmo aluno OU família sticky OU mesmo pagador PIX/sticky/responsável). */
export function grupoNpara1Compativel(a: PlanilhaItem, b: PlanilhaItem): boolean {
  if (a.data.slice(0, 10) !== b.data.slice(0, 10)) return false;
  if (alunoNormKey(a.aluno) === alunoNormKey(b.aluno)) return true;
  if (grupoFamiliaCompativel(a.aluno, b.aluno)) return true;

  const pagadores = (p: PlanilhaItem): Set<string> => {
    const out = new Set<string>();
    if (p.pagadorPix?.trim()) out.add(normalizeText(p.pagadorPix));
    for (const r of p.responsaveis ?? []) {
      if (r?.trim()) out.add(normalizeText(r));
    }
    return out;
  };
  const pgA = pagadores(a);
  const pgB = pagadores(b);
  for (const x of pgA) {
    if (x && pgB.has(x)) return true;
  }
  return false;
}

export function bancoPermitidoParaPlanilha(
  planilha: PlanilhaItem,
  bancoId: string,
  vinculosPorBanco: Map<string, Set<string>>,
  planilhasById: Map<string, PlanilhaItem>,
): boolean {
  const linkedPlanilhas = vinculosPorBanco.get(bancoId);
  if (!linkedPlanilhas || linkedPlanilhas.size === 0) return true;
  if (linkedPlanilhas.has(planilha.id)) return true;

  for (const pid of linkedPlanilhas) {
    const sibling =
      planilhasById.get(pid) ?? resolverPlanilhaPorVinculoId(pid, planilhasById);
    if (!sibling || !grupoNpara1Compativel(planilha, sibling)) return false;
  }
  return true;
}

export function filtrarCandidatosPorVinculosExclusivos(
  planilha: PlanilhaItem,
  candidatos: BancoItem[],
  vinculosPorBanco: Map<string, Set<string>>,
  planilhasById: Map<string, PlanilhaItem>,
): BancoItem[] {
  return candidatos.filter((c) =>
    bancoPermitidoParaPlanilha(planilha, c.id, vinculosPorBanco, planilhasById),
  );
}

export type GrupoRateioMesmoAluno = {
  planilha_ids: string[];
  soma: number;
  banco_ids: string[];
};

/**
 * Agrupa linhas não vinculadas (N→1):
 * - mesmo aluno no dia (várias modalidades);
 * - grupo familiar sticky;
 * - mesmo pagador PIX / responsável compartilhado no dia.
 * Sempre emite o grupo visual; banco_ids preenche quando há soma (ou desconto ~15%).
 */
export function detectarGruposRateioMesmoAluno(
  planilhas: PlanilhaItem[],
  vinculadosPlanilhaIds: Set<string>,
  bancoItens: BancoItem[],
  tol: number,
): GrupoRateioMesmoAluno[] {
  const porChaveDia = new Map<string, PlanilhaItem[]>();

  const add = (key: string, p: PlanilhaItem) => {
    const arr = porChaveDia.get(key) ?? [];
    arr.push(p);
    porChaveDia.set(key, arr);
  };

  for (const p of planilhas) {
    if (vinculadosPlanilhaIds.has(p.id)) continue;
    const dia = p.data.slice(0, 10);
    const fam = familiaPagamentoChave(p.aluno);
    if (fam) add(`${dia}::familia::${fam}`, p);
    else add(`${dia}::aluno::${alunoNormKey(p.aluno)}`, p);

    const pagadores = new Set<string>();
    if (p.pagadorPix?.trim()) pagadores.add(normalizeText(p.pagadorPix));
    for (const r of p.responsaveis ?? []) {
      const n = normalizeText(r);
      // Evita chaves genéricas curtas demais.
      if (n.length >= 5) pagadores.add(n);
    }
    for (const pg of pagadores) {
      add(`${dia}::pagador::${pg}`, p);
    }
  }

  const grupos: GrupoRateioMesmoAluno[] = [];
  const assinaturas = new Set<string>();
  for (const items of porChaveDia.values()) {
    if (items.length < 2) continue;
    const byId = new Map<string, PlanilhaItem>();
    for (const p of items) byId.set(p.id, p);
    const uniq = Array.from(byId.values());
    if (uniq.length < 2) continue;
    const assinatura = uniq
      .map((p) => p.id)
      .sort()
      .join('|');
    if (assinaturas.has(assinatura)) continue;
    assinaturas.add(assinatura);

    const soma = uniq.reduce((s, p) => s + Number(p.valor || 0), 0);
    const bancoIds = bancoItens
      .filter((b) => {
        const v = Number(b.valor || 0);
        if (Math.abs(v - soma) <= tol) return true;
        if (v > 0 && v < soma && (soma - v) / soma <= 0.15 + 1e-9) return true;
        return false;
      })
      .map((b) => b.id);

    grupos.push({
      planilha_ids: uniq.map((p) => p.id),
      soma,
      banco_ids: bancoIds,
    });
  }
  return grupos;
}

export function aplicarVinculosEExclusividadeBanco(args: {
  vinculos: VinculoDiaResumo[];
  planilhas: PlanilhaItem[];
  bancoItens: BancoItem[];
  confirmados: Array<{ planilha: PlanilhaItem; banco: BancoItem }>;
  possiveis: PossivelMatchRow[];
  nao: PlanilhaItem[];
  tol: number;
}): {
  confirmados: Array<{ planilha: PlanilhaItem; banco: BancoItem }>;
  possiveis: PossivelMatchRowEnriquecido[];
  nao: PlanilhaItem[];
} {
  const { vinculos, planilhas, bancoItens, tol } = args;
  const planilhasById = new Map(planilhas.map((p) => [p.id, p]));
  const bancoById = new Map(bancoItens.map((b) => [b.id, b]));
  const vinculosPorBanco = indexVinculosPorBanco(vinculos);
  const confirmadosMap = new Map<string, { planilha: PlanilhaItem; banco: BancoItem }>();
  for (const c of args.confirmados) confirmadosMap.set(c.planilha.id, c);

  for (const v of vinculos) {
    const planilha = resolverPlanilhaPorVinculoId(v.planilha_id, planilhasById);
    const banco = bancoById.get(v.banco_id);
    if (!planilha || !banco) continue;
    confirmadosMap.set(planilha.id, { planilha, banco });
  }

  const confirmados = Array.from(confirmadosMap.values());
  const vinculadosPlanilhaIds = new Set(confirmadosMap.keys());

  const possiveisRaw = args.possiveis.filter((r) => !vinculadosPlanilhaIds.has(r.planilha.id));
  const naoRaw = args.nao.filter((p) => !vinculadosPlanilhaIds.has(p.id));

  const rateioGrupos = detectarGruposRateioMesmoAluno(planilhas, vinculadosPlanilhaIds, bancoItens, tol);
  const rateioPorPlanilha = new Map<
    string,
    { ids: string[]; soma: number; banco_ids: string[] }
  >();
  for (const g of rateioGrupos) {
    for (const pid of g.planilha_ids) {
      rateioPorPlanilha.set(pid, { ids: g.planilha_ids, soma: g.soma, banco_ids: g.banco_ids });
    }
  }

  const possiveis: PossivelMatchRowEnriquecido[] = [];
  const pushPossivel = (planilha: PlanilhaItem, candidatosIn: BancoItem[]) => {
    let candidatos = filtrarCandidatosPorVinculosExclusivos(
      planilha,
      candidatosIn,
      vinculosPorBanco,
      planilhasById,
    );
    const rateio = rateioPorPlanilha.get(planilha.id);
    if (rateio) {
      const extras = rateio.banco_ids
        .map((id) => bancoById.get(id))
        .filter((b): b is BancoItem => !!b);
      // Reforço: qualquer banco do dia com valor ≈ soma do grupo (não só os ids já listados).
      const porSoma = bancoItens.filter((b) => {
        const v = Number(b.valor || 0);
        if (Math.abs(v - rateio.soma) <= tol) return true;
        if (v > 0 && v < rateio.soma && (rateio.soma - v) / rateio.soma <= 0.15 + 1e-9) return true;
        return false;
      });
      candidatos = mergeCandidatosBanco(candidatos, [...extras, ...porSoma]);
      candidatos = filtrarCandidatosPorVinculosExclusivos(
        planilha,
        candidatos,
        vinculosPorBanco,
        planilhasById,
      );
    }

    const alunosGrupo = rateio
      ? (rateio.ids.map((id) => planilhasById.get(id)).filter(Boolean) as PlanilhaItem[])
      : [planilha];
    const alunosUnicos = new Set(alunosGrupo.map((p) => alunoNormKey(p.aluno)));
    const mesmoAluno = alunosUnicos.size === 1 && alunosGrupo.length > 1;
    const familiaGrupo =
      !mesmoAluno &&
      alunosGrupo.length > 1 &&
      alunosGrupo.every((p) => grupoFamiliaCompativel(alunosGrupo[0].aluno, p.aluno));
    const mesmoPagadorMulti =
      !mesmoAluno &&
      !familiaGrupo &&
      alunosGrupo.length > 1 &&
      alunosGrupo.every((p) => grupoNpara1Compativel(alunosGrupo[0], p));

    // Rateio N→1 (mesmo aluno ou família): sobe mesmo sem candidato no banco.
    if (candidatos.length === 0 && !(rateio && (mesmoAluno || familiaGrupo))) return;

    possiveis.push({
      planilha,
      candidatos: ordenarCandidatosPorNome(planilha, candidatos),
      ...(rateio && mesmoAluno
        ? {
            possivel_rateio_mesmo_aluno: true,
            grupo_rateio_ids: rateio.ids,
            rateio_soma: rateio.soma,
          }
        : {}),
      ...(rateio && familiaGrupo
        ? {
            grupo_familia_pagamento: true,
            grupo_familia_rotulo: familiaPagamentoRotulo(alunosGrupo[0].aluno) ?? undefined,
            grupo_rateio_ids: rateio.ids,
            rateio_soma: rateio.soma,
          }
        : {}),
      ...(mesmoPagadorMulti
        ? { mesmo_pagador_multi_aluno: true, grupo_rateio_ids: rateio?.ids, rateio_soma: rateio?.soma }
        : {}),
    });
  };

  for (const row of possiveisRaw) {
    pushPossivel(row.planilha, row.candidatos);
  }

  // Promove pares de rateio (mesmo aluno / família) que estavam só em "não confirmados".
  const jaPossivel = new Set(possiveis.map((r) => r.planilha.id));
  for (const p of naoRaw) {
    if (jaPossivel.has(p.id)) continue;
    if (!rateioPorPlanilha.has(p.id)) continue;
    pushPossivel(p, []);
    jaPossivel.add(p.id);
  }

  const nao = naoRaw.filter((p) => !possiveis.some((r) => r.planilha.id === p.id));

  return { confirmados, possiveis, nao };
}
