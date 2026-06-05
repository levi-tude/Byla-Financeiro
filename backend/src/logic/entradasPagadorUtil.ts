import { normalizeText } from './conciliacaoTexto.js';

export function isNomeGenericoMaquininha(pessoa: string): boolean {
  const t = normalizeText(pessoa);
  if (!t) return true;
  if (t.includes('CARTAO') || t.includes('MAQUININHA') || t.includes('MAQUIN')) return true;
  if (t.includes('PAGBANK') || t.includes('PAGSEGURO') || t.includes('STONE') || t.includes('CIELO')) return true;
  if (/\bVISA\b/.test(t) || /\bELO\b/.test(t) || t.includes('MASTER') || t.includes('AMEX')) return true;
  if (t.includes('DEBITO') || t.includes('CREDITO') || t.includes('ELECTRON') || t.includes('MAESTRO')) return true;
  const palavras = t.split(/\s+/).filter(Boolean);
  if (palavras.length <= 2 && /\b(VISA|ELO|MASTER|AMEX|HIPER)\b/.test(t)) return true;
  return false;
}
