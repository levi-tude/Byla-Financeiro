/**
 * Saídas do CONTROLE DE CAIXA: seções Saídas Parceiros e Saídas Fixas (+ Aluguel quando existir).
 * Extração por ordem das linhas + pares de colunas; valores preferem célula ao lado do rótulo.
 */

import type { LinhaPlanilha, SaidaBlocoPlanilha } from '../domain/FluxoPlanilhaTotais.js';

export function parseValor(s: string): number | null {
  let t = (s ?? '').toString().trim();
  if (!t) return null;
  t = t.replace(/\s/g, '').replace(/R\$\s?/gi, '');
  let neg = false;
  if (/^\(.*\)$/.test(t)) {
    neg = true;
    t = t.slice(1, -1);
  }
  if (t.startsWith('-')) {
    neg = true;
    t = t.slice(1);
  }
  t = t.replace(/\./g, '').replace(',', '.');
  const v = parseFloat(t);
  if (!Number.isFinite(v)) return null;
  const out = neg ? -Math.abs(v) : v;
  return out;
}

function isNumericLike(cell: string): boolean {
  return parseValor(cell) != null;
}

/** Preferência: células logo à direita do rótulo (layout descrição | valor). */
function pickNumberAfterLabel(row: string[], labelIndex: number): number | null {
  const cells = row.map((c) => (c ?? '').toString().trim());
  for (let j = labelIndex + 1; j <= Math.min(labelIndex + 4, cells.length - 1); j++) {
    const n = parseValor(cells[j]);
    if (n != null) return n;
  }
  for (let j = labelIndex + 5; j < cells.length; j++) {
    const n = parseValor(cells[j]);
    if (n != null) return n;
  }
  for (let j = cells.length - 1; j >= 0; j--) {
    if (j === labelIndex) continue;
    const n = parseValor(cells[j]);
    if (n != null) return n;
  }
  return null;
}

function normalizeLabel(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\uFFFD/g, 'A')
    .toUpperCase()
    .trim();
}

function isLikelyHeader(label: string): boolean {
  const l = normalizeLabel(label);
  return (
    l.includes('ENTRADA') ||
    l.includes('SAIDA') ||
    l.includes('GASTO') ||
    l.includes('DESPESA') ||
    l.includes('ALUGUEL') ||
    l.includes('PARCEIRO') ||
    l.includes('COWORKING') ||
    l.includes('FIXO') ||
    l.includes('FIXA')
  );
}

/** Infere rótulo + valor numérico na linha (layout descrição | valor). Exportado para leitura de CONTROLE (entradas). */
export function inferRotuloEValorLinha(row: string[]): { label: string; value: number | null } | null {
  const cells = row.map((c) => (c ?? '').toString().trim());
  if (cells.every((c) => !c)) return null;

  let labelIndex = -1;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (!c || isNumericLike(c)) continue;
    if (labelIndex === -1) labelIndex = i;
    if (isLikelyHeader(c)) {
      labelIndex = i;
      break;
    }
  }
  if (labelIndex === -1) return null;
  const label = cells[labelIndex];
  const value = pickNumberAfterLabel(cells, labelIndex);
  return { label, value };
}

/** Unifica nomes antigos / variantes para chave estável (merge e totais). */
export function normalizarTituloBlocoSaida(titulo: string): string {
  const u = normalizeLabel(titulo);
  if (u.includes('ALUGUEL') && (u.includes('SAIDA') || u.includes('SAIDAS'))) return 'Saídas Aluguel';
  if (
    u.includes('GASTOS FIXOS') ||
    u.includes('GASTO FIXO') ||
    u.includes('DESPESAS FIXAS') ||
    u.includes('DESPESA FIXA') ||
    u.includes('SAIDAS FIXAS') ||
    (u.includes('FIXAS') && (u.includes('SAIDA') || u.includes('SAIDAS'))) ||
    (u.includes('FIXO') && u.includes('SAIDA')) ||
    (u.includes('FIXA') &&
      (u.includes('SAIDA') || u.includes('SAIDAS')) &&
      !u.includes('PARCEIRO')) ||
    titulo.trim() === 'Gastos Fixos'
  ) {
    return 'Saídas Fixas';
  }
  if (
    u.includes('PARCEIRO') ||
    u.includes('TOTAL SAIDAS') ||
    u.includes('TOTAL SAÍDAS') ||
    u.includes('TOTAL DE SAIDAS') ||
    titulo.trim() === 'Total Saídas (Parceiros)'
  ) {
    return 'Saídas Parceiros';
  }
  return titulo.trim();
}

/** Cabeçalho de bloco de saídas na aba (seções Parceiros e Fixas). */
export function tituloBlocoSaidaCabecalho(cabecalho: string): string | null {
  const raw = (cabecalho ?? '').trim();
  const u = normalizeLabel(raw);
  if (!u) return null;

  if (u.includes('ALUGUEL') && (u.includes('SAIDA') || u.includes('SAIDAS'))) {
    return 'Saídas Aluguel';
  }

  if (
    u.includes('GASTOS FIXOS') ||
    u.includes('GASTO FIXO') ||
    u.includes('SAIDAS FIXAS') ||
    u.includes('SAÍDAS FIXAS') ||
    u.includes('DESPESAS FIXAS') ||
    u.includes('DESPESA FIXA') ||
    u.includes('SAIDA FIXA') ||
    u.includes('SAÍDA FIXA') ||
    (u.includes('FIXAS') && u.includes('SAIDA')) ||
    (u.includes('FIXO') && u.includes('SAIDA') && !u.includes('PARCEIRO'))
  ) {
    return 'Saídas Fixas';
  }

  if (
    u.includes('SAIDAS PARCEIROS') ||
    u.includes('SAÍDAS PARCEIROS') ||
    u.includes('SAIDA PARCEIROS') ||
    (u.includes('PARCEIRO') && (u.includes('SAIDA') || u.includes('SAIDAS'))) ||
    u.includes('TOTAL SAIDAS') ||
    u.includes('TOTAL SAÍDAS') ||
    u.includes('TOTAL DE SAIDAS') ||
    u.includes('TOTAL DE SAÍDAS')
  ) {
    return 'Saídas Parceiros';
  }

  if (
    (u.includes('SAIDAS') || u.includes('SAÍDAS') || u.includes('DESPESAS')) &&
    !u.includes('ENTRADA') &&
    !u.includes('PARCEIROS') &&
    u.length < 80
  ) {
    return raw.length > 60 ? `${raw.slice(0, 57)}…` : raw;
  }

  return null;
}

export function isLinhaTotalGeralPlanilha(label: string): boolean {
  const u = normalizeLabel(label);
  return (
    u.includes('ENTRADA TOTAL') ||
    u.includes('SAIDA TOTAL') ||
    u.includes('SAIDAS TOTAL') ||
    u.includes('LUCRO') ||
    u.includes('RESULTADO') ||
    u === 'TOTAL' ||
    (u.includes('TOTAL') && u.includes('GERAL'))
  );
}

/** Evita duplicar soma: linha de subtotal/total só da seção (não é detalhe). */
export function isLinhaSubtotalOuTotalSecao(label: string): boolean {
  const u = normalizeLabel(label);
  if (!u.includes('TOTAL') && !u.includes('SUBTOTAL')) return false;
  if (u.includes('ENTRADA TOTAL') || u.includes('SAIDA TOTAL') || u.includes('SAIDAS TOTAL')) return false;
  return (
    u.includes('PARCEIRO') ||
    u.includes('FIXA') ||
    u.includes('FIXO') ||
    u.includes('SAIDA') ||
    u.includes('SAIDAS') ||
    u.includes('GASTO') ||
    u.includes('DESPESA')
  );
}

/**
 * Percorre a aba na ordem das linhas — captura Parceiros e Saídas fixas mesmo fora dos pares de colunas.
 */
export function extrairBlocosSaidasPorOrdemLinhas(values: string[][] | undefined): SaidaBlocoPlanilha[] {
  if (!values?.length) return [];
  const out: SaidaBlocoPlanilha[] = [];
  let blocoAtual: SaidaBlocoPlanilha | null = null;

  const flush = () => {
    if (blocoAtual && blocoAtual.linhas.length > 0) {
      out.push({ ...blocoAtual, titulo: normalizarTituloBlocoSaida(blocoAtual.titulo) });
    }
    blocoAtual = null;
  };

  for (const row of values) {
    const inf = inferRotuloEValorLinha(row);
    if (!inf) continue;
    const label = inf.label.trim();
    const titulo = tituloBlocoSaidaCabecalho(label);
    if (titulo) {
      flush();
      blocoAtual = { titulo: normalizarTituloBlocoSaida(titulo), linhas: [] };
      continue;
    }
    if (!blocoAtual) continue;
    if (isLinhaTotalGeralPlanilha(label) || isLinhaSubtotalOuTotalSecao(label)) continue;
    const valorNum = inf.value;
    if (valorNum == null || valorNum < 0) continue;
    const valorStr = String(valorNum);
    blocoAtual.linhas.push({ label, valor: valorStr, valorNum });
  }
  flush();
  return out;
}

/** Fallback: mesma lógica por colunas (pares A-B, C-D…). */
export function extrairBlocosSaidasPorColunas(porColuna: LinhaPlanilha[][] | undefined): SaidaBlocoPlanilha[] {
  const out: SaidaBlocoPlanilha[] = [];
  if (!porColuna) return out;

  for (const col of porColuna) {
    if (!col?.length) continue;
    let blocoAtual: SaidaBlocoPlanilha | null = null;
    const flush = () => {
      if (blocoAtual && blocoAtual.linhas.length > 0) {
        out.push({ ...blocoAtual, titulo: normalizarTituloBlocoSaida(blocoAtual.titulo) });
      }
      blocoAtual = null;
    };
    for (const linha of col) {
      const label = (linha.label ?? '').trim();
      if (!label) continue;
      const titulo = tituloBlocoSaidaCabecalho(label);
      if (titulo) {
        flush();
        blocoAtual = { titulo: normalizarTituloBlocoSaida(titulo), linhas: [] };
        continue;
      }
      if (!blocoAtual) continue;
      if (isLinhaTotalGeralPlanilha(label) || isLinhaSubtotalOuTotalSecao(label)) continue;
      if (linha.valorNum == null || linha.valorNum < 0) continue;
      blocoAtual.linhas.push(linha);
    }
    flush();
  }
  return out;
}

/** Une linha + bloco para match com o banco. */
export function achatarBlocosParaMatch(blocos: SaidaBlocoPlanilha[]): { titulo: string; label: string; valor: number }[] {
  const r: { titulo: string; label: string; valor: number }[] = [];
  for (const b of blocos) {
    for (const l of b.linhas) {
      const v = l.valorNum ?? parseValor(l.valor) ?? 0;
      r.push({ titulo: b.titulo, label: l.label, valor: Math.abs(v) });
    }
  }
  return r;
}

/** Une blocos com o mesmo título (ex.: linhas por coluna + por ordem de linha) sem duplicar label|valor. */
export function mergeBlocosSaidasPorTitulo(a: SaidaBlocoPlanilha[], b: SaidaBlocoPlanilha[]): SaidaBlocoPlanilha[] {
  const map = new Map<string, LinhaPlanilha[]>();
  const seenPerTitulo = new Map<string, Set<string>>();

  for (const bl of [...a, ...b]) {
    const titulo = normalizarTituloBlocoSaida(bl.titulo);
    const cur = map.get(titulo) ?? [];
    const seen = seenPerTitulo.get(titulo) ?? new Set<string>();
    for (const l of bl.linhas) {
      const k = `${l.label}|${l.valorNum ?? l.valor}`;
      if (seen.has(k)) continue;
      seen.add(k);
      cur.push(l);
    }
    seenPerTitulo.set(titulo, seen);
    map.set(titulo, cur);
  }
  return Array.from(map.entries()).map(([titulo, linhas]) => ({ titulo, linhas }));
}

/** Soma dos detalhes nas seções Parceiros + Fixas (referência para “saída total” do controle). */
export function somaSaidasParceirosEFixas(blocos: SaidaBlocoPlanilha[]): number {
  let s = 0;
  for (const b of blocos) {
    const t = normalizarTituloBlocoSaida(b.titulo);
    if (t !== 'Saídas Parceiros' && t !== 'Saídas Fixas') continue;
    for (const l of b.linhas) {
      s += Math.abs(l.valorNum ?? parseValor(l.valor) ?? 0);
    }
  }
  return Math.round(s * 100) / 100;
}
