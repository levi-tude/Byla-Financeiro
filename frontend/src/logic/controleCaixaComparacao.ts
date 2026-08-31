/** Comparação Planilha × Sistema (totais + blocos/linhas). */

export const DELTA_TOLERANCIA_BRL = 0.01;

export type TotaisSnap = {
  entradaTotal: number | null;
  saidaTotal: number | null;
  lucroTotal: number | null;
};

export type LinhaSnap = {
  chave: string;
  label: string;
  valor: number | null;
};

export type BlocoSnap = {
  chave: string;
  titulo: string;
  tipo: 'entrada' | 'saida';
  linhas: LinhaSnap[];
};

export type PresencaModo = 'ambos' | 'oficial' | 'sistema' | 'nenhum';

export type DeltaCell = {
  oficial: number | null;
  sistema: number | null;
  /** sistema − planilha quando ambos (ou valor do lado único). */
  delta: number | null;
  presenca: PresencaModo;
};

export type LinhaComparada = {
  chave: string;
  label: string;
  cell: DeltaCell;
};

export type BlocoComparado = {
  chave: string;
  titulo: string;
  tipo: 'entrada' | 'saida';
  agregado: DeltaCell;
  linhas: LinhaComparada[];
  temDiff: boolean;
};

export type ComparacaoModos = {
  totais: {
    entradas: DeltaCell;
    saidas: DeltaCell;
    lucro: DeltaCell;
  };
  blocos: BlocoComparado[];
  qtdLinhasComDiff: number;
};

function numOrNull(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return v;
}

/** Normaliza rótulo para alinhar planilha (sem templateKey) × sistema (com chave). */
export function normLabelKey(label: string): string {
  return label
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function valoresDiferem(
  a: number | null | undefined,
  b: number | null | undefined,
  tolerancia = DELTA_TOLERANCIA_BRL,
): boolean {
  const aa = numOrNull(a);
  const bb = numOrNull(b);
  if (aa == null && bb == null) return false;
  if (aa == null || bb == null) return true;
  return Math.abs(aa - bb) > tolerancia;
}

export function montarDeltaCell(
  oficial: number | null | undefined,
  sistema: number | null | undefined,
): DeltaCell {
  const o = numOrNull(oficial);
  const s = numOrNull(sistema);
  if (o == null && s == null) {
    return { oficial: null, sistema: null, delta: null, presenca: 'nenhum' };
  }
  if (o == null) {
    return { oficial: null, sistema: s, delta: s, presenca: 'sistema' };
  }
  if (s == null) {
    return { oficial: o, sistema: null, delta: -o, presenca: 'oficial' };
  }
  return { oficial: o, sistema: s, delta: s - o, presenca: 'ambos' };
}

export function cellTemDiff(cell: DeltaCell, tolerancia = DELTA_TOLERANCIA_BRL): boolean {
  if (cell.presenca === 'nenhum') return false;
  if (cell.presenca !== 'ambos') return true;
  return valoresDiferem(cell.oficial, cell.sistema, tolerancia);
}

/**
 * Chave de bloco: templateKey se houver; senão inferência pelo título
 * (migração da planilha não grava templateKey).
 */
export function chaveBlocoSnap(bloco: {
  templateKey?: string | null;
  titulo: string;
  tipo?: 'entrada' | 'saida';
}): string {
  const tk = (bloco.templateKey ?? '').trim().toLowerCase();
  if (tk) return tk;
  const t = normLabelKey(bloco.titulo);
  const tipo = bloco.tipo;
  if (tipo === 'entrada' || (!tipo && (t.includes('entrada') || !t.includes('saida')))) {
    if (t.includes('parceir')) return 'entrada_parceiros';
    if (t.includes('alug') || t.includes('cowork')) return 'entrada_aluguel_coworking';
  }
  if (tipo === 'saida' || t.includes('saida') || t.includes('gasto')) {
    if (t.includes('parceir')) return 'saida_parceiros';
    if (t.includes('fix') || t.includes('gastos')) return 'saida_gastos_fixos';
  }
  if (t.includes('parceir') && t.includes('entrada')) return 'entrada_parceiros';
  if (t.includes('parceir') && t.includes('saida')) return 'saida_parceiros';
  if (t.includes('alug') || t.includes('cowork')) return 'entrada_aluguel_coworking';
  if (t.includes('fix') || t.includes('gastos')) return 'saida_gastos_fixos';
  return `titulo:${t}`;
}

/**
 * Linhas: sempre pelo rótulo normalizado.
 * Planilha migrada não tem templateKey; Sistema tem — UUID nunca alinha entre modos.
 */
export function chaveLinhaSnap(linha: {
  templateKey?: string | null;
  id?: string;
  label: string;
}): string {
  return `l:${normLabelKey(linha.label)}`;
}

export function blocoParaSnap(bloco: {
  templateKey?: string | null;
  titulo: string;
  tipo: 'entrada' | 'saida';
  linhas: Array<{
    templateKey?: string | null;
    id?: string;
    label: string;
    valor: number | null;
  }>;
}): BlocoSnap {
  return {
    chave: chaveBlocoSnap(bloco),
    titulo: bloco.titulo,
    tipo: bloco.tipo,
    linhas: bloco.linhas.map((l) => ({
      chave: chaveLinhaSnap(l),
      label: l.label,
      valor: numOrNull(l.valor),
    })),
  };
}

function somaLinhas(linhas: LinhaSnap[]): number | null {
  if (linhas.length === 0) return null;
  let any = false;
  let sum = 0;
  for (const l of linhas) {
    if (l.valor == null) continue;
    any = true;
    sum += l.valor;
  }
  return any ? sum : null;
}

function mergePorChave<T extends { chave: string }>(
  oficial: T[],
  sistema: T[],
): Array<{ chave: string; oficial: T | null; sistema: T | null }> {
  const map = new Map<string, { chave: string; oficial: T | null; sistema: T | null }>();
  for (const o of oficial) {
    map.set(o.chave, { chave: o.chave, oficial: o, sistema: null });
  }
  for (const s of sistema) {
    const cur = map.get(s.chave);
    if (cur) cur.sistema = s;
    else map.set(s.chave, { chave: s.chave, oficial: null, sistema: s });
  }
  return [...map.values()];
}

export function compararTotais(oficial: TotaisSnap, sistema: TotaisSnap): ComparacaoModos['totais'] {
  return {
    entradas: montarDeltaCell(oficial.entradaTotal, sistema.entradaTotal),
    saidas: montarDeltaCell(oficial.saidaTotal, sistema.saidaTotal),
    lucro: montarDeltaCell(oficial.lucroTotal, sistema.lucroTotal),
  };
}

export type CompararBlocosOpts = {
  /** Padrão true: só blocos/linhas com diferença. */
  soDiffs?: boolean;
  tolerancia?: number;
};

/**
 * Alinha blocos e linhas. Com `soDiffs`, omite iguais.
 */
export function compararBlocos(
  oficialBlocos: BlocoSnap[],
  sistemaBlocos: BlocoSnap[],
  opts: CompararBlocosOpts = {},
): BlocoComparado[] {
  const soDiffs = opts.soDiffs !== false;
  const tol = opts.tolerancia ?? DELTA_TOLERANCIA_BRL;
  const merged = mergePorChave(oficialBlocos, sistemaBlocos);
  const out: BlocoComparado[] = [];

  for (const m of merged) {
    const titulo = m.sistema?.titulo ?? m.oficial?.titulo ?? m.chave;
    const tipo = (m.sistema?.tipo ?? m.oficial?.tipo ?? 'entrada') as 'entrada' | 'saida';
    const linhasMerged = mergePorChave(m.oficial?.linhas ?? [], m.sistema?.linhas ?? []);
    const todasLinhas: LinhaComparada[] = linhasMerged.map((lm) => ({
      chave: lm.chave,
      label: lm.sistema?.label ?? lm.oficial?.label ?? lm.chave,
      cell: montarDeltaCell(lm.oficial?.valor, lm.sistema?.valor),
    }));
    const linhas = soDiffs ? todasLinhas.filter((l) => cellTemDiff(l.cell, tol)) : todasLinhas;

    const agregado = montarDeltaCell(
      m.oficial ? somaLinhas(m.oficial.linhas) : null,
      m.sistema ? somaLinhas(m.sistema.linhas) : null,
    );
    const temDiff =
      cellTemDiff(agregado, tol) || todasLinhas.some((l) => cellTemDiff(l.cell, tol));

    if (soDiffs && !temDiff) continue;

    out.push({
      chave: m.chave,
      titulo,
      tipo,
      agregado,
      linhas,
      temDiff,
    });
  }

  return out;
}

export function compararControles(
  oficial: { totais: TotaisSnap; blocos: BlocoSnap[] },
  sistema: { totais: TotaisSnap; blocos: BlocoSnap[] },
  opts: CompararBlocosOpts = {},
): ComparacaoModos {
  const blocos = compararBlocos(oficial.blocos, sistema.blocos, opts);
  return {
    totais: compararTotais(oficial.totais, sistema.totais),
    blocos,
    qtdLinhasComDiff: blocos.reduce((acc, b) => acc + b.linhas.filter((l) => cellTemDiff(l.cell)).length, 0),
  };
}

export function formatDeltaSignedBrl(delta: number | null | undefined): string {
  if (delta == null || !Number.isFinite(delta)) return '—';
  const abs = Math.abs(delta).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (delta > 0) return `+${abs}`;
  if (delta < 0) return `-${abs}`;
  return abs;
}

export function labelPresenca(presenca: PresencaModo): string | null {
  if (presenca === 'oficial') return 'só na Planilha';
  if (presenca === 'sistema') return 'só no Sistema';
  return null;
}
