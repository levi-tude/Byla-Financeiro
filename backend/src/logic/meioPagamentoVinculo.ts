import { normalizeText } from './conciliacaoTexto.js';
import { isFormaPagamentoDinheiro } from './pagamentoDinheiroFluxo.js';
import { isCreditoGenericoExtrato } from './creditoRecorrente.js';

export type MeioPagamentoAluno =
  | 'pix'
  | 'debito'
  | 'credito_a_vista'
  | 'credito_recorrente'
  | 'dinheiro'
  | 'desconhecido';

function textoCombinado(pessoa: string, descricao?: string | null, forma?: string | null): string {
  return normalizeText(`${pessoa} ${descricao ?? ''} ${forma ?? ''}`);
}

/** Forma escrita no Fluxo (PIX, DÉBITO, CRÉDITO, …). */
export function inferirMeioPagamentoFluxo(forma: string | null | undefined): MeioPagamentoAluno {
  const t = normalizeText(forma ?? '');
  if (!t) return 'desconhecido';
  if (isFormaPagamentoDinheiro(forma)) return 'dinheiro';
  if (t.includes('PIX')) return 'pix';
  if (t.includes('DEBIT')) return 'debito';
  if (t.includes('RECORREN') || t.includes('ASSINAT')) return 'credito_recorrente';
  if (t.includes('CREDIT')) return 'credito_a_vista';
  return 'desconhecido';
}

export function inferirMeioPagamentoVinculo(opts: {
  pessoa: string;
  descricao?: string | null;
  forma?: string | null;
}): MeioPagamentoAluno {
  const { pessoa, descricao, forma } = opts;
  const descricaoExtrato = [descricao, forma].filter(Boolean).join(' ') || null;

  if (isCreditoGenericoExtrato(pessoa, descricaoExtrato)) {
    return 'credito_recorrente';
  }

  const text = textoCombinado(pessoa, descricao, forma);
  if (!text) return 'desconhecido';

  if (text.includes('PIX')) return 'pix';

  if (text.includes('DEBITO') || text.includes('ELECTRON') || text.includes('MAESTRO')) {
    return 'debito';
  }

  if (text.includes('CREDITO')) return 'credito_a_vista';

  return 'desconhecido';
}

/**
 * Cruza forma do Fluxo × meio inferido do extrato.
 * Desconhecido de um dos lados não bloqueia (ainda permite revisão manual).
 */
export function formaFluxoCompativelComBanco(
  formaFluxo: string | null | undefined,
  banco: { pessoa: string; descricao?: string | null },
): boolean {
  const meioFluxo = inferirMeioPagamentoFluxo(formaFluxo);
  if (meioFluxo === 'desconhecido') return true;

  const meioBanco = inferirMeioPagamentoVinculo({
    pessoa: banco.pessoa,
    descricao: banco.descricao,
  });
  if (meioBanco === 'desconhecido') return true;

  if (meioFluxo === 'debito') return meioBanco === 'debito';
  if (meioFluxo === 'pix') return meioBanco === 'pix';
  if (meioFluxo === 'credito_a_vista' || meioFluxo === 'credito_recorrente') {
    return meioBanco === 'credito_a_vista' || meioBanco === 'credito_recorrente';
  }
  return true;
}

export function fluxoPermiteSugestaoVendasCredito(formaFluxo: string | null | undefined): boolean {
  const meio = inferirMeioPagamentoFluxo(formaFluxo);
  return meio === 'credito_a_vista' || meio === 'credito_recorrente' || meio === 'desconhecido';
}
