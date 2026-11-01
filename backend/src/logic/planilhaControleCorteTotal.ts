/**
 * Corte na linha TOTAL de cada bloco da aba do CONTROLE DE CAIXA e checagem de consistência.
 *
 * Cada bloco ocupa um par de colunas (rótulo, valor) com o título na 1ª linha. Tudo que estiver
 * ABAIXO da linha "TOTAL" do bloco (ex.: "13º", números de rascunho sem rótulo) é ignorado.
 * Exceção: rótulos de total geral (Entrada Total / Saída Total / Lucro Total) e o número logo abaixo
 * de um deles continuam visíveis, pois ficam na mesma coluna em algumas abas.
 */

export type TotalBlocoPlanilha = { titulo: string; total: number | null };

function norm(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

export function isRotuloTotalGeral(cell: string): boolean {
  const l = norm(cell);
  return (
    l.includes('ENTRADA TOTAL') || l.includes('TOTAL ENTRADA') || l.includes('TOTAL DE ENTRADA') ||
    l.includes('SAIDA TOTAL') || l.includes('TOTAL SAIDA') || l.includes('TOTAL DE SAIDA') ||
    l.includes('LUCRO TOTAL') || l.includes('RESULTADO TOTAL')
  );
}

function num(cell: string): number | null {
  const s = (cell ?? '').toString().trim();
  if (!s) return null;
  const limpo = s.replace(/R\$\s?/i, '').replace(/\s/g, '');
  const n = /,\d{1,2}$/.test(limpo) ? Number(limpo.replace(/\./g, '').replace(',', '.')) : Number(limpo.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Retorna uma cópia de `values` com as células abaixo do TOTAL de cada bloco apagadas, e os totais de cada bloco. */
export function cortarBlocosNaLinhaTotal(values: string[][]): { values: string[][]; totaisBlocos: TotalBlocoPlanilha[] } {
  const out = values.map((r) => [...(r ?? [])].map((c) => (c ?? '').toString()));
  const totaisBlocos: TotalBlocoPlanilha[] = [];
  const header = out[0] ?? [];
  for (let c = 0; c < header.length; c++) {
    const titulo = (header[c] ?? '').trim();
    if (!titulo || num(titulo) != null) continue;
    let totalRow = -1;
    for (let r = 1; r < out.length; r++) {
      if (norm(out[r][c] ?? '') === 'TOTAL') { totalRow = r; break; }
    }
    if (totalRow < 0) continue;
    totaisBlocos.push({ titulo, total: num(out[totalRow][c + 1] ?? '') });
    let protegeProxima = false;
    for (let r = totalRow + 1; r < out.length; r++) {
      if (isRotuloTotalGeral(out[r][c] ?? '')) { protegeProxima = true; continue; }
      for (const cc of [c, c + 1]) {
        const cell = out[r][cc] ?? '';
        if (!cell) continue;
        if (isRotuloTotalGeral(cell)) { protegeProxima = true; continue; }
        if (protegeProxima && cc === c && num(cell) != null) continue;
        out[r][cc] = '';
      }
      if (out[r][c] && !isRotuloTotalGeral(out[r][c])) protegeProxima = false;
    }
  }
  return { values: out, totaisBlocos };
}

export type DivergenciaControle = { item: string; lido: number; planilha: number; diferenca: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Compara somas lidas com os totais da planilha (tolerância R$ 0,01). */
export function checarConsistenciaControle(args: {
  blocos: { tipo: 'entrada' | 'saida'; titulo: string; linhas: { valorNum?: number }[] }[];
  totaisBlocos: TotalBlocoPlanilha[];
  entradaTotal: number | null;
  saidaTotal: number | null;
  lucroLido: number | null;
  tolerancia?: number;
}): DivergenciaControle[] {
  const tol = args.tolerancia ?? 0.01;
  const out: DivergenciaControle[] = [];
  const add = (item: string, lido: number, planilha: number | null) => {
    if (planilha == null) return;
    const d = r2(lido - planilha);
    if (Math.abs(d) > tol + 1e-9) out.push({ item, lido: r2(lido), planilha: r2(planilha), diferenca: d });
  };
  const soma = (ls: { valorNum?: number }[]) => ls.reduce((a, l) => a + Math.abs(l.valorNum ?? 0), 0);
  let somaE = 0;
  let somaS = 0;
  for (const b of args.blocos) {
    const s = soma(b.linhas);
    if (b.tipo === 'entrada') somaE += s; else somaS += s;
    const tb = args.totaisBlocos.find((t) => norm(t.titulo) === norm(b.titulo));
    if (tb) add(`bloco ${b.titulo}`, s, tb.total);
  }
  add('Entrada total', somaE, args.entradaTotal);
  add('Saída total', somaS, args.saidaTotal);
  if (args.entradaTotal != null && args.saidaTotal != null) add('Lucro total', args.entradaTotal - args.saidaTotal, args.lucroLido);
  return out;
}
