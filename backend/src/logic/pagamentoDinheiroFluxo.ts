import { normalizeText } from './conciliacaoTexto.js';

/** Pagamento registrado no Fluxo como dinheiro/espécie — não passa pela validação bancária. */
export function isFormaPagamentoDinheiro(forma: string | null | undefined): boolean {
  const t = normalizeText(forma ?? '');
  if (!t) return false;
  if (t.includes('DINHEIRO')) return true;
  if (t.includes('ESPECIE')) return true;
  if (t === 'CASH') return true;
  return false;
}

export function exigeValidacaoExtratoPorForma(forma: string | null | undefined): boolean {
  return !isFormaPagamentoDinheiro(forma);
}
