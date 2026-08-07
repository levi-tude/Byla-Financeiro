/**
 * Previstos virtuais multi-mês a partir de matricula + plano.
 * Não persiste linhas em fluxo_pagamentos_operacionais (só UI / helpers).
 *
 * Ciclo: âncora = competência da matrícula.
 * Trimestral N=3 / Semestral N=6.
 * monthsElapsed 0-based; cycleIndex = floor(monthsElapsed/N);
 * pré-preenche só offsets do ciclo atual [cycleIndex*N .. cycleIndex*N+N-1].
 * Mensal: sem pré-preenchimento futuro.
 */

export type CompetenciaMes = { ano: number; mes: number };

export type PlanoCicloTipo = 'mensal' | 'trimestral' | 'semestral';

export type PlanoCicloInfo = {
  tipo: PlanoCicloTipo;
  /** Tamanho do ciclo em meses; mensal = 1 (sem prefill). */
  N: number;
};

export function monthsBetweenCompetencia(from: CompetenciaMes, to: CompetenciaMes): number {
  return (to.ano - from.ano) * 12 + (to.mes - from.mes);
}

export function addMonthsCompetencia(base: CompetenciaMes, delta: number): CompetenciaMes {
  const idx = base.ano * 12 + (base.mes - 1) + delta;
  const ano = Math.floor(idx / 12);
  const mes = (idx % 12) + 1;
  return { ano, mes };
}

export function competenciaKey(c: CompetenciaMes): string {
  return `${c.ano}-${String(c.mes).padStart(2, '0')}`;
}

/**
 * Parse do campo texto `matricula` → competência (ano/mês).
 * Aceita ISO, dd/mm/aaaa, dd/mm/aa, mm/aaaa, aaaa-mm.
 */
export function parseMatriculaCompetencia(raw: string | null | undefined): CompetenciaMes | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (iso) {
    const ano = Number(iso[1]);
    const mes = Number(iso[2]);
    if (ano >= 2000 && ano <= 2100 && mes >= 1 && mes <= 12) return { ano, mes };
    return null;
  }

  const brFull = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (brFull) {
    const dia = Number(brFull[1]);
    const mes = Number(brFull[2]);
    let ano = Number(brFull[3]);
    if (ano < 100) ano += 2000;
    if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12 && ano >= 2000 && ano <= 2100) {
      return { ano, mes };
    }
    return null;
  }

  const brMesAno = s.match(/^(\d{1,2})[/.-](\d{4})$/);
  if (brMesAno) {
    const mes = Number(brMesAno[1]);
    const ano = Number(brMesAno[2]);
    if (mes >= 1 && mes <= 12 && ano >= 2000 && ano <= 2100) return { ano, mes };
    return null;
  }

  return null;
}

export function resolverPlanoCiclo(plano: string | null | undefined): PlanoCicloInfo {
  const n = String(plano ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
  if (n.includes('semes')) return { tipo: 'semestral', N: 6 };
  if (n.includes('trimes')) return { tipo: 'trimestral', N: 3 };
  return { tipo: 'mensal', N: 1 };
}

export type CicloAtualResult = {
  ingresso: CompetenciaMes;
  info: PlanoCicloInfo;
  monthsElapsed: number;
  cycleIndex: number;
  /** Offsets 0-based do ciclo atual (inclusive). */
  offsets: number[];
  /** Competências do ciclo atual. */
  competencias: CompetenciaMes[];
};

/**
 * Calcula o ciclo atual com âncora na matrícula e referência no mês civil aberto.
 * Mensal: retorna null (sem prefill).
 * Matrícula inválida: null.
 */
export function cicloAtualDoPlano(input: {
  matricula: string | null | undefined;
  plano: string | null | undefined;
  /** Mês civil aberto (hoje). */
  referencia: CompetenciaMes;
}): CicloAtualResult | null {
  const ingresso = parseMatriculaCompetencia(input.matricula);
  if (!ingresso) return null;
  const info = resolverPlanoCiclo(input.plano);
  if (info.tipo === 'mensal') return null;

  const monthsElapsed = monthsBetweenCompetencia(ingresso, input.referencia);
  if (!Number.isFinite(monthsElapsed) || monthsElapsed < 0) return null;

  const cycleIndex = Math.floor(monthsElapsed / info.N);
  const start = cycleIndex * info.N;
  const offsets = Array.from({ length: info.N }, (_, i) => start + i);
  const competencias = offsets.map((off) => addMonthsCompetencia(ingresso, off));
  return { ingresso, info, monthsElapsed, cycleIndex, offsets, competencias };
}

/** True se a competência alvo está no ciclo atual (prefill virtual). */
export function competenciaNoCicloAtual(input: {
  matricula: string | null | undefined;
  plano: string | null | undefined;
  referencia: CompetenciaMes;
  alvo: CompetenciaMes;
}): boolean {
  const ciclo = cicloAtualDoPlano(input);
  if (!ciclo) return false;
  const key = competenciaKey(input.alvo);
  return ciclo.competencias.some((c) => competenciaKey(c) === key);
}

/**
 * Lista competências do ciclo atual que ainda não têm lançamento real.
 * `lancadasKeys` = set de "YYYY-MM" com pagamento lançado.
 */
export function previstosVirtuaisDoCiclo(input: {
  matricula: string | null | undefined;
  plano: string | null | undefined;
  referencia: CompetenciaMes;
  lancadasKeys?: Set<string>;
}): CompetenciaMes[] {
  const ciclo = cicloAtualDoPlano(input);
  if (!ciclo) return [];
  const lancadas = input.lancadasKeys ?? new Set<string>();
  return ciclo.competencias.filter((c) => !lancadas.has(competenciaKey(c)));
}
