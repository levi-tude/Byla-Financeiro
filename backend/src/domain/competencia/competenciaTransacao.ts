export type CompetenciaMesAno = { mes: number; ano: number };

export type OrigemSugestaoCompetencia =
  | 'data_extrato'
  | 'validacao_fluxo'
  | 'heuristica_repasso'
  | 'manual';

export type CompetenciaTransacaoRow = {
  transacao_id: string;
  mes_competencia: number;
  ano_competencia: number;
  confirmada: boolean;
  origem_sugestao: OrigemSugestaoCompetencia;
  updated_at: string;
};

export type CompetenciaEfetiva = CompetenciaMesAno & {
  confirmada: boolean;
  origem_sugestao: OrigemSugestaoCompetencia;
  sugerida: CompetenciaMesAno;
  alinha_data: boolean;
};

export function competenciaFromDataIso(dataIso: string): CompetenciaMesAno {
  const y = Number(dataIso.slice(0, 4));
  const m = Number(dataIso.slice(5, 7));
  return { mes: m >= 1 && m <= 12 ? m : 1, ano: y >= 2000 ? y : 2000 };
}

export function competenciaAlinhaData(dataIso: string, mes: number, ano: number): boolean {
  const c = competenciaFromDataIso(dataIso);
  return c.mes === mes && c.ano === ano;
}

export function addMonthsComp(mes: number, ano: number, delta: number): CompetenciaMesAno {
  const d = new Date(ano, mes - 1 + delta, 1);
  return { mes: d.getMonth() + 1, ano: d.getFullYear() };
}

export function labelCompetencia(mes: number, ano: number): string {
  const t = new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Entrada: fluxo da validação prevalece; senão mês da data do PIX. */
export function suggestCompetenciaEntrada(
  dataIso: string,
  fluxoMes?: number | null,
  fluxoAno?: number | null,
): { efetiva: CompetenciaMesAno; origem: OrigemSugestaoCompetencia } {
  if (
    fluxoMes != null &&
    fluxoMes >= 1 &&
    fluxoMes <= 12 &&
    fluxoAno != null &&
    fluxoAno >= 2000
  ) {
    return { efetiva: { mes: fluxoMes, ano: fluxoAno }, origem: 'validacao_fluxo' };
  }
  return { efetiva: competenciaFromDataIso(dataIso), origem: 'data_extrato' };
}

/** Saída: repasse dias 1–10 → sugere mês anterior (não grava sem confirmar). */
export function suggestCompetenciaDespesa(
  dataIso: string,
  isRepasseParceiro: boolean,
): { efetiva: CompetenciaMesAno; origem: OrigemSugestaoCompetencia } {
  const dia = Number(dataIso.slice(8, 10));
  if (isRepasseParceiro && dia >= 1 && dia <= 10) {
    const base = competenciaFromDataIso(dataIso);
    return { efetiva: addMonthsComp(base.mes, base.ano, -1), origem: 'heuristica_repasso' };
  }
  return { efetiva: competenciaFromDataIso(dataIso), origem: 'data_extrato' };
}

export function isBlocoRepasseParceiros(blocoTemplateKey: string | null, blocoTitulo: string | null): boolean {
  const key = (blocoTemplateKey ?? '').toLowerCase();
  const titulo = (blocoTitulo ?? '').toLowerCase();
  return key === 'saida_parceiros' || titulo.includes('parceir');
}

/** IDs de transações com mesma pessoa + mesma competência confirmada (alerta, não bloqueio). */
export function detectDuplicatasCompetencia(
  items: { id: string; pessoaNorm: string; mes: number; ano: number }[],
): Set<string> {
  const dupes = new Set<string>();
  const byKey = new Map<string, string[]>();
  for (const it of items) {
    const k = `${it.pessoaNorm}|${it.ano}-${String(it.mes).padStart(2, '0')}`;
    const list = byKey.get(k) ?? [];
    list.push(it.id);
    byKey.set(k, list);
  }
  for (const ids of byKey.values()) {
    if (ids.length > 1) for (const id of ids) dupes.add(id);
  }
  return dupes;
}

export function resolveCompetenciaEfetiva(
  dataIso: string,
  stored: CompetenciaTransacaoRow | null,
  sugerida: CompetenciaMesAno,
  origemSugestao: OrigemSugestaoCompetencia,
): CompetenciaEfetiva {
  if (stored) {
    return {
      mes: stored.mes_competencia,
      ano: stored.ano_competencia,
      confirmada: stored.confirmada,
      origem_sugestao: stored.origem_sugestao,
      sugerida,
      alinha_data: competenciaAlinhaData(dataIso, stored.mes_competencia, stored.ano_competencia),
    };
  }
  return {
    ...sugerida,
    confirmada: false,
    origem_sugestao: origemSugestao,
    sugerida,
    alinha_data: competenciaAlinhaData(dataIso, sugerida.mes, sugerida.ano),
  };
}
