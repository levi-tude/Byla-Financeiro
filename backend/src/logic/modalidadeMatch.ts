import { normalizeText } from './conciliacaoTexto.js';

/** Chave compacta de modalidade: "G.R." → "gr", "BYLA DANÇA" → "byladanca". */
export function chaveModalidade(s: string): string {
  return normalizeText(s).toLowerCase().replace(/[^a-z0-9]/g, '');
}
/** A aba/modalidade `nome` (dos dados) corresponde ao pedido `alvo`? Siglas curtas só batem exato/prefixo. */
export function casaModalidade(nome: string, alvo: string): boolean {
  const k = chaveModalidade(nome);
  const a = chaveModalidade(alvo);
  if (!k || !a) return false;
  return a.length >= 4 ? k.includes(a) : k === a || k.startsWith(a);
}
