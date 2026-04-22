/**
 * Cores de “guia” no estilo Google Sheets (tabs da barra inferior), alinhadas às abas
 * usadas no FLUXO DE CAIXA BYLA (ver `parsePlanilhaPorBlocos.ts` / docs da planilha).
 *
 * Para espelhar **exatamente** as cores da sua planilha ao vivo, copie os hex da UI do
 * Google (cor da aba) e preencha `FLUXO_ABA_TAB_COLORS` abaixo — chave = nome da aba
 * sem acentos, em maiúsculas (`normAbaChave`).
 */

export function normAbaChave(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toUpperCase();
}

/** Tab + fundo suave + texto sobre a tab (contraste). */
export type FluxoTabChrome = { tab: string; soft: string; onTab: string };

/** Paleta próxima às cores padrão de abas do Google Sheets (Material-like). */
const GOOGLE_SHEETS_TAB_FALLBACK: FluxoTabChrome[] = [
  { tab: '#0f9d58', soft: 'rgba(15,157,88,0.14)', onTab: '#ffffff' },
  { tab: '#4285f4', soft: 'rgba(66,133,244,0.14)', onTab: '#ffffff' },
  { tab: '#f4b400', soft: 'rgba(244,180,0,0.18)', onTab: '#3c4043' },
  { tab: '#db4437', soft: 'rgba(219,68,55,0.14)', onTab: '#ffffff' },
  { tab: '#673ab7', soft: 'rgba(103,58,183,0.14)', onTab: '#ffffff' },
  { tab: '#00acc1', soft: 'rgba(0,172,193,0.14)', onTab: '#ffffff' },
  { tab: '#e8710a', soft: 'rgba(232,113,10,0.16)', onTab: '#ffffff' },
  { tab: '#5f6368', soft: 'rgba(95,99,104,0.14)', onTab: '#ffffff' },
  { tab: '#ab47bc', soft: 'rgba(171,71,188,0.14)', onTab: '#ffffff' },
  { tab: '#00897b', soft: 'rgba(0,137,123,0.14)', onTab: '#ffffff' },
];

const FLUXO_ABA_TAB_COLORS: Record<string, FluxoTabChrome> = {
  ATENDIMENTOS: { tab: '#5f6368', soft: 'rgba(95,99,104,0.16)', onTab: '#ffffff' },
  'BYLA DANCA': { tab: '#e8710a', soft: 'rgba(232,113,10,0.16)', onTab: '#ffffff' },
  PILATES: { tab: '#0b8043', soft: 'rgba(11,128,67,0.16)', onTab: '#ffffff' },
  'PILATES MARINA': { tab: '#00838f', soft: 'rgba(0,131,143,0.16)', onTab: '#ffffff' },
  TEATRO: { tab: '#673ab7', soft: 'rgba(103,58,183,0.16)', onTab: '#ffffff' },
  'TEATRO INFANTIL': { tab: '#c2185b', soft: 'rgba(194,24,91,0.14)', onTab: '#ffffff' },
  YOGA: { tab: '#7b1fa2', soft: 'rgba(123,31,162,0.14)', onTab: '#ffffff' },
  'G.R.': { tab: '#795548', soft: 'rgba(121,85,72,0.16)', onTab: '#ffffff' },
  GR: { tab: '#795548', soft: 'rgba(121,85,72,0.16)', onTab: '#ffffff' },
};

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  return Math.abs(h);
}

function chromeFromPalette(key: string, salt = 0): FluxoTabChrome {
  const idx = (hashString(key) + salt) % GOOGLE_SHEETS_TAB_FALLBACK.length;
  return GOOGLE_SHEETS_TAB_FALLBACK[idx];
}

/** Cor da guia para o nome da aba (planilha / agrupamento). */
export function getFluxoAbaTabStyle(aba: string): FluxoTabChrome {
  const k = normAbaChave(aba);
  return FLUXO_ABA_TAB_COLORS[k] ?? chromeFromPalette(k, 0);
}

/**
 * Cor de destaque para modalidade: deriva de aba + modalidade para diferenciar blocos
 * dentro da mesma aba, mantendo a mesma “família” de cores de planilha.
 */
export function getFluxoModalidadeTabStyle(aba: string, modalidade: string): FluxoTabChrome {
  const k = normAbaChave(`${aba}|${modalidade}`);
  const base = getFluxoAbaTabStyle(aba);
  // Mesma aba conhecida: desloca na paleta Google para não repetir a tab da aba quando possível
  const salt = hashString(k) % 5 + 1;
  const alt = chromeFromPalette(k, salt);
  if (normAbaChave(aba) === normAbaChave(modalidade)) return base;
  return alt.tab === base.tab ? chromeFromPalette(k, salt + 2) : alt;
}
