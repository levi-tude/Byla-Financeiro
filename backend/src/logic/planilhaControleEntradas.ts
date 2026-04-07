/**
 * Entradas do CONTROLE DE CAIXA — mesma filosofia de planilhaControleSaidas.ts:
 * cabeçalhos de seção, totais ignorados, detalhe só com valor > 0.
 */

import type { LinhaPlanilha, SaidaBlocoPlanilha } from '../domain/FluxoPlanilhaTotais.js';
import {
  inferRotuloEValorLinha,
  isLinhaSubtotalOuTotalSecao,
  isLinhaTotalGeralPlanilha,
  normalizarTituloBlocoSaida,
  parseValor,
  tituloBlocoSaidaCabecalho,
} from './planilhaControleSaidas.js';

/** Bloco de gastos fixos: mesmo critério do cabeçalho da aba + normalização estável. */
export function blocoEhTituloGastosFixos(titulo: string): boolean {
  const t = (titulo ?? '').trim();
  if (!t) return false;
  if (normalizarTituloBlocoSaida(t) === 'Saídas Fixas') return true;
  return tituloBlocoSaidaCabecalho(t) === 'Saídas Fixas';
}

function normalizeLabel(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\uFFFD/g, 'A')
    .toUpperCase()
    .trim();
}

/**
 * Cabeçalho de bloco de ENTRADAS (modalidade, receita, etc.).
 * Não confundir com saídas: se tituloBlocoSaidaCabecalho reconhecer, retorna null.
 * Inclui receitas de aluguel/coworking (às vezes o bloco vem depois das saídas na aba).
 */
export function tituloBlocoEntradaCabecalho(cabecalho: string): string | null {
  const raw = (cabecalho ?? '').trim();
  if (!raw) return null;
  if (tituloBlocoSaidaCabecalho(raw)) return null;
  if (isLinhaTotalGeralPlanilha(raw)) return null;
  if (isLinhaSubtotalOuTotalSecao(raw)) return null;
  const u = normalizeLabel(raw);
  if (u.includes('SAIDA') || u.includes('SAÍDA')) return null;
  if (u.includes('DESPESA') || (u.includes('GASTO') && u.includes('FIXO'))) return null;
  if (u.includes('ENTRADA') && !u.includes('SAIDA')) return raw;
  if (u.includes('RECEITA') || u.includes('RECEB')) return raw;
  if (u.includes('MENSALIDADE') && !u.includes('SAIDA')) return raw;
  // Entrada / receita de aluguel ou coworking (sem ser saída de aluguel — já filtrado acima)
  // Não usar "SALA" sozinho — linhas como "Sala coworking" com valor são detalhe, não cabeçalho de seção.
  if (
    (u.includes('ALUGUEL') || u.includes('COWORKING')) &&
    (u.includes('ENTRADA') ||
      u.includes('RECEITA') ||
      u.includes('RECEB') ||
      u.includes('LOCACAO') ||
      u.includes('LOCAÇÃO'))
  ) {
    return raw;
  }
  // Título composto "Aluguel / Coworking" ou "Aluguel Coworking" como receita (não despesa)
  if (
    u.includes('ALUGUEL') &&
    u.includes('COWORKING') &&
    !u.includes('DESPESA') &&
    !u.includes('GASTO') &&
    !u.includes('PAGAMENTO')
  ) {
    return raw;
  }
  return null;
}

function cellEhNumerica(s: string): boolean {
  return parseValor(s) != null;
}

function mergeBlocosEntradasPorTitulo(a: SaidaBlocoPlanilha[], b: SaidaBlocoPlanilha[]): SaidaBlocoPlanilha[] {
  const map = new Map<string, LinhaPlanilha[]>();
  const seen = new Map<string, Set<string>>();
  for (const bl of [...a, ...b]) {
    const titulo = (bl.titulo ?? '').trim() || 'Entradas';
    const cur = map.get(titulo) ?? [];
    const s = seen.get(titulo) ?? new Set<string>();
    for (const l of bl.linhas) {
      const k = `${normalizeLabel(l.label ?? '')}|${Math.round((l.valorNum ?? parseValor(l.valor) ?? 0) * 100) / 100}`;
      if (s.has(k)) continue;
      s.add(k);
      cur.push(l);
    }
    seen.set(titulo, s);
    map.set(titulo, cur);
  }
  return Array.from(map.entries())
    .map(([titulo, linhas]) => ({ titulo, linhas }))
    .filter((b) => b.linhas.length > 0);
}

/**
 * Na região de entradas, o rótulo costuma estar na coluna A e o valor em B (ou C se B vazio).
 * Evita inferRotuloEValorLinha na linha inteira, que pode pegar o valor da saída à direita na mesma linha.
 */
function inferRotuloEValorLinhaRegiaoEntradaEsquerda(row: string[]): { label: string; value: number | null } | null {
  const cells = row.map((c) => (c ?? '').toString().trim());
  if (cells.every((c) => !c)) return null;
  const label0 = (cells[0] ?? '').trim();
  if (!label0 || cellEhNumerica(label0)) {
    return inferRotuloEValorLinha(row);
  }
  if (tituloBlocoSaidaCabecalho(label0)) {
    return { label: label0, value: null };
  }
  if (tituloBlocoEntradaCabecalho(label0)) {
    const ve1 = parseValor(cells[1] ?? '');
    if (ve1 != null) return { label: label0, value: ve1 };
    const ve2 = parseValor(cells[2] ?? '');
    if (ve2 != null && !(cells[1] ?? '').trim()) return { label: label0, value: ve2 };
    return { label: label0, value: null };
  }
  const v1 = parseValor(cells[1] ?? '');
  if (v1 != null) return { label: label0, value: v1 };
  const v2 = parseValor(cells[2] ?? '');
  if (v2 != null && !(cells[1] ?? '').trim()) return { label: label0, value: v2 };
  return inferRotuloEValorLinha(row);
}

/** Chave estável para cruzar detalhe de entrada vs saída (evita duplicar o mesmo lançamento). */
export function chaveLinhaControleDetalhe(l: LinhaPlanilha): string {
  const v = Math.round((l.valorNum ?? parseValor(l.valor) ?? 0) * 100) / 100;
  return `${normalizeLabel(l.label ?? '')}|${v}`;
}

/** Remove linhas de entrada que já existem como detalhe em saídas (mesmo rótulo + valor). */
export function filtrarEntradasQueColidemComSaidas(
  entradas: SaidaBlocoPlanilha[],
  saidas: SaidaBlocoPlanilha[] | undefined,
): SaidaBlocoPlanilha[] {
  const keysSaida = new Set<string>();
  for (const b of saidas ?? []) {
    for (const l of b.linhas) {
      keysSaida.add(chaveLinhaControleDetalhe(l));
    }
  }
  if (keysSaida.size === 0) return entradas;
  return entradas
    .map((b) => ({
      ...b,
      linhas: b.linhas.filter((l) => !keysSaida.has(chaveLinhaControleDetalhe(l))),
    }))
    .filter((b) => b.linhas.length > 0);
}

/**
 * Primeira coluna (A–B): mesma lógica de fases que a ordem de linhas — entradas após saídas (ex. aluguel/coworking) não são cortadas.
 */
export function extrairBlocosEntradasPorColunaPrimeira(porColuna: LinhaPlanilha[][] | undefined): SaidaBlocoPlanilha[] {
  const col = porColuna?.[0];
  if (!col?.length) return [];
  const out: SaidaBlocoPlanilha[] = [];
  let blocoAtual: SaidaBlocoPlanilha | null = null;
  let fase: 'entrada' | 'saida' = 'entrada';
  const flush = () => {
    if (blocoAtual && blocoAtual.linhas.length > 0) {
      out.push({ ...blocoAtual });
    }
    blocoAtual = null;
  };

  for (const linha of col) {
    const label = (linha.label ?? '').trim();
    if (!label) continue;
    // Após fechamento (totais finais), qualquer "rastro" abaixo da tabela é ignorado.
    if (isLinhaTotalGeralPlanilha(label)) {
      flush();
      break;
    }
    if (tituloBlocoSaidaCabecalho(label)) {
      flush();
      fase = 'saida';
      continue;
    }
    const titulo = tituloBlocoEntradaCabecalho(label);
    if (titulo) {
      const soCabecalho = linha.valorNum == null || linha.valorNum <= 0;
      if (soCabecalho) {
        flush();
        fase = 'entrada';
        blocoAtual = { titulo, linhas: [] };
        continue;
      }
      if (fase === 'entrada' && blocoAtual && linha.valorNum != null && linha.valorNum > 0) {
        if (!isLinhaTotalGeralPlanilha(label) && !isLinhaSubtotalOuTotalSecao(label)) {
          blocoAtual.linhas.push(linha);
        }
        continue;
      }
    }
    if (fase === 'saida') continue;
    if (!blocoAtual) {
      if (linha.valorNum != null && linha.valorNum > 0 && !isLinhaTotalGeralPlanilha(label)) {
        blocoAtual = { titulo: 'Entradas', linhas: [linha] };
      }
      continue;
    }
    if (isLinhaTotalGeralPlanilha(label) || isLinhaSubtotalOuTotalSecao(label)) continue;
    if (linha.valorNum == null || linha.valorNum <= 0) continue;
    blocoAtual.linhas.push(linha);
  }
  flush();
  return out;
}

/**
 * Ordem das linhas: blocos de entrada no topo; ao encontrar saídas, ignora detalhes até novo cabeçalho de entrada
 * (ex.: "Entrada Aluguel/Coworking" abaixo das saídas na mesma aba).
 */
export function extrairBlocosEntradasPorOrdemLinhas(values: string[][] | undefined): SaidaBlocoPlanilha[] {
  if (!values?.length) return [];
  const out: SaidaBlocoPlanilha[] = [];
  let blocoAtual: SaidaBlocoPlanilha | null = null;
  let fase: 'entrada' | 'saida' = 'entrada';
  const flush = () => {
    if (blocoAtual && blocoAtual.linhas.length > 0) {
      out.push({ ...blocoAtual });
    }
    blocoAtual = null;
  };

  for (const row of values) {
    const inf = inferRotuloEValorLinhaRegiaoEntradaEsquerda(row);
    if (!inf) continue;
    const label = inf.label.trim();
    // Fecha a leitura no encerramento do quadro (Entrada/Saída/Lucro total) para
    // não capturar anotações soltas abaixo da área principal da aba.
    if (isLinhaTotalGeralPlanilha(label)) {
      flush();
      break;
    }

    if (tituloBlocoSaidaCabecalho(label)) {
      flush();
      fase = 'saida';
      continue;
    }

    const titulo = tituloBlocoEntradaCabecalho(label);
    if (titulo) {
      const soCabecalho = inf.value == null || inf.value <= 0;
      if (soCabecalho) {
        flush();
        fase = 'entrada';
        blocoAtual = { titulo, linhas: [] };
        continue;
      }
      // Mesmo rótulo parecendo seção, há valor na linha: tratar como detalhe no bloco atual (se houver)
      if (fase === 'entrada' && blocoAtual && inf.value != null && inf.value > 0) {
        if (!isLinhaTotalGeralPlanilha(label) && !isLinhaSubtotalOuTotalSecao(label)) {
          blocoAtual.linhas.push({ label, valor: String(inf.value), valorNum: inf.value });
        }
        continue;
      }
    }

    if (fase === 'saida') continue;

    if (!blocoAtual) {
      if (inf.value != null && inf.value > 0 && !isLinhaTotalGeralPlanilha(label) && !isLinhaSubtotalOuTotalSecao(label)) {
        blocoAtual = { titulo: 'Entradas', linhas: [{ label, valor: String(inf.value), valorNum: inf.value }] };
      }
      continue;
    }
    if (isLinhaTotalGeralPlanilha(label) || isLinhaSubtotalOuTotalSecao(label)) continue;
    if (inf.value == null || inf.value <= 0) continue;
    blocoAtual.linhas.push({ label, valor: String(inf.value), valorNum: inf.value });
  }
  flush();
  return out;
}

/**
 * Lê blocos de entradas por colunas detectadas (ex.: A/B e D/E),
 * comum no layout "ENTRADAS PARCEIROS | ENTRADAS ALUGUEL/COWORKING | SAÍDAS ...".
 */
export function extrairBlocosEntradasPorColunasDetectadas(values: string[][] | undefined): SaidaBlocoPlanilha[] {
  if (!values?.length) return [];
  const blocos: SaidaBlocoPlanilha[] = [];
  const headers: { titulo: string; col: number; row: number }[] = [];
  const seenCol = new Set<number>();

  for (let r = 0; r < values.length; r++) {
    const row = values[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const cell = (row[c] ?? '').toString().trim();
      if (!cell) continue;
      const t = tituloBlocoEntradaCabecalho(cell);
      if (!t) continue;
      if (seenCol.has(c)) continue;
      seenCol.add(c);
      headers.push({ titulo: t, col: c, row: r });
    }
  }

  for (const h of headers) {
    const linhas: LinhaPlanilha[] = [];
    for (let r = h.row + 1; r < values.length; r++) {
      const row = values[r] ?? [];
      const label = (row[h.col] ?? '').toString().trim();
      if (!label) continue;
      if (isLinhaTotalGeralPlanilha(label) || isLinhaSubtotalOuTotalSecao(label)) break;
      if (tituloBlocoSaidaCabecalho(label)) break;
      const proxTituloEntrada = tituloBlocoEntradaCabecalho(label);
      if (proxTituloEntrada && normalizeLabel(label) !== normalizeLabel(h.titulo)) break;
      const valorNum = parseValor((row[h.col + 1] ?? '').toString());
      if (valorNum == null || valorNum <= 0) continue;
      linhas.push({ label, valor: String(valorNum), valorNum });
    }
    if (linhas.length > 0) {
      blocos.push({ titulo: h.titulo, linhas });
    }
  }

  return blocos;
}

/**
 * Ordem de linhas na aba tem prioridade: captura entradas abaixo das saídas (ex. aluguel/coworking).
 * Coluna 0 só se a leitura por linha não trouxer nenhum detalhe (fallback).
 */
export function mergeEntradasColunaEOrdem(
  porColuna: LinhaPlanilha[][] | undefined,
  values: string[][] | undefined,
): SaidaBlocoPlanilha[] {
  const porOrdem = extrairBlocosEntradasPorOrdemLinhas(values);
  const porColunasDetectadas = extrairBlocosEntradasPorColunasDetectadas(values);
  const merged = mergeBlocosEntradasPorTitulo(porOrdem, porColunasDetectadas);
  if (merged.some((b) => b.linhas.length > 0)) return merged;
  return extrairBlocosEntradasPorColunaPrimeira(porColuna);
}

/** Linhas do bloco "Saídas Fixas" (gastos fixos) após normalização de título. */
export function linhasGastosFixosDeSaidasBlocos(saidasBlocos: SaidaBlocoPlanilha[] | undefined): LinhaPlanilha[] {
  const out: LinhaPlanilha[] = [];
  for (const b of saidasBlocos ?? []) {
    if (!blocoEhTituloGastosFixos(b.titulo)) continue;
    for (const l of b.linhas) {
      const v = l.valorNum ?? parseValor(l.valor) ?? 0;
      if (v > 0) out.push(l);
    }
  }
  return out;
}
