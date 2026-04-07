/**
 * Value object: mês e ano de referência.
 * Domínio puro – sem dependências de framework ou infra.
 */

export interface MesAno {
  mes: number;
  ano: number;
}

export function criarMesAno(mes: number, ano: number): MesAno {
  if (mes < 1 || mes > 12) throw new Error('Mês inválido');
  return { mes, ano };
}

export function mesAnoAnterior({ mes, ano }: MesAno): MesAno {
  if (mes <= 1) return { mes: 12, ano: ano - 1 };
  return { mes: mes - 1, ano };
}

const NOMES_MES_ABA: Record<number, string> = {
  1: 'JANEIRO', 2: 'FEVEREIRO', 3: 'MARÇO', 4: 'ABRIL', 5: 'MAIO', 6: 'JUNHO',
  7: 'JULHO', 8: 'AGOSTO', 9: 'SETEMBRO', 10: 'OUTUBRO', 11: 'NOVEMBRO', 12: 'DEZEMBRO',
};

/** Nome da aba (ex.: "MARÇO 26") para o **mês que aparece no título da aba** (não o mês de referência do fechamento). */
export function nomeAbaControleDeCaixa({ mes, ano }: MesAno): string {
  const nomeMes = NOMES_MES_ABA[mes] ?? 'MARÇO';
  const anoCurto = String(ano).slice(-2);
  return `${nomeMes} ${anoCurto}`;
}

/**
 * Mapeia o **mês de referência** (o período que o usuário escolhe no painel: fechamento de caixa daquele mês)
 * para o **mês do título da aba** na planilha CONTROLE DE CAIXA.
 *
 * Regra fixa do negócio: o título da aba é **um mês à frente** do período que ela fecha.
 * - Período março/26 → aba **ABRIL 26** (não MARÇO).
 * - Período fevereiro/26 → aba **MARÇO 26**.
 * - Período dezembro/26 → aba **JANEIRO 27** (vira o ano no título).
 */
export function mesAnoParaAbaControleDeCaixa(mesReferencia: number, anoReferencia: number): MesAno {
  let mesAba = mesReferencia + 1;
  let anoAba = anoReferencia;
  if (mesAba > 12) {
    mesAba = 1;
    anoAba = anoReferencia + 1;
  }
  return { mes: mesAba, ano: anoAba };
}

/** Título da aba (ex.: ABRIL 26) correspondente ao mês de referência escolhido no painel. */
export function tituloAbaControleParaMesReferencia(mesReferencia: number, anoReferencia: number): string {
  return nomeAbaControleDeCaixa(mesAnoParaAbaControleDeCaixa(mesReferencia, anoReferencia));
}

/**
 * Notação A1 do Google Sheets: nomes com espaço ou `'` devem ficar entre aspas simples (duplicando `'` no nome).
 * @see https://developers.google.com/sheets/api/guides/concepts
 */
export function rangeA1Quoted(tituloAba: string, cols: string): string {
  const esc = tituloAba.replace(/'/g, "''");
  return `'${esc}'!${cols}`;
}

export function rangeA1ZQuoted(tituloAba: string): string {
  return rangeA1Quoted(tituloAba, 'A:Z');
}

/**
 * Garante range com aba entre aspas quando o env ainda usa `MARÇO 26!A:Z` sem aspas (API pode falhar ou ler errado).
 */
export function ensureQuotedA1Range(fullRange: string): string {
  const trimmed = fullRange.trim();
  const i = trimmed.indexOf('!');
  if (i < 0) return trimmed;
  const sheetPart = trimmed.slice(0, i);
  const rest = trimmed.slice(i + 1).trim();
  if (sheetPart.startsWith("'")) return trimmed;
  return rangeA1Quoted(sheetPart.trim(), rest);
}

/** Mesma aba que `fullRange`, célula A1 (probe rápido em /api/fontes). */
export function rangeA1ProbeFromFullRange(fullRange: string): string {
  const n = ensureQuotedA1Range(fullRange.trim());
  return n.replace(/![^!]+$/, '!A1');
}
