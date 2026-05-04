import { businessRules } from '../businessRules.js';

export type TransacaoBase = {
  id: string;
  data: string;
  pessoa: string;
  valor: number;
  descricao: string | null;
  tipo: string;
};

/** Normaliza tipo do extrato (ex.: "Saída", "SAIDA") para comparação com regras. */
export function normalizarTipoTransacao(raw: string | null | undefined): 'entrada' | 'saida' {
  const s = String(raw ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
  if (s === 'saida') return 'saida';
  return 'entrada';
}

export type MetodoPagamento =
  | 'PIX'
  | 'Crédito'
  | 'Débito'
  | 'Transferência'
  | 'Boleto'
  | 'Dinheiro'
  | 'Outros';

function normalizarTextoMetodo(input: string | null | undefined): string {
  return String(input ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Infere método de pagamento a partir do texto do extrato (pessoa + descrição / forma no banco).
 * Cobre: PIX explícito, QR Code, SPI, transferência instantânea (PIX no Brasil), bandeiras EDI PagBank,
 * e cartão a partir de arranjo_ur quando não há a palavra "crédito"/"débito".
 */
export function normalizarMetodoPagamento(input: string | null | undefined): MetodoPagamento {
  const t = normalizarTextoMetodo(input);
  if (!t) return 'Outros';

  const isPix =
    t.includes('PIX') ||
    /\bQR\s*-?\s*CODE\b/.test(t) ||
    t.includes('QRCODE') ||
    t.includes('CHAVE PIX') ||
    t.includes('CHAVEPIX') ||
    /\bSPI\b/.test(t) ||
    t.includes('TXID') ||
    t.includes('TX_ID') ||
    /\bINSTANT\s+PAY/.test(t) ||
    t.includes('INSTANT PAYMENT') ||
    (t.includes('INSTANTAN') && (t.includes('TRANSF') || t.includes('RECEB') || t.includes('PAGAM') || t.includes('ENVIO'))) ||
    (t.includes('TRANSFERENCIA') && t.includes('INSTANT'));

  if (isPix) return 'PIX';

  const isDebito =
    t.includes('DEBITO') ||
    t.includes('DEBIT') ||
    t.includes('CARTAO DE DEBITO') ||
    t.includes('CARTAO DEBITO') ||
    t.includes('VISA ELECTRON') ||
    t.includes('ELECTRON') ||
    t.includes('MAESTRO');

  if (isDebito) return 'Débito';

  const isCredito =
    t.includes('CREDITO') ||
    t.includes('CREDIT') ||
    t.includes('CARTAO DE CREDITO') ||
    t.includes('CARTAO CREDITO') ||
    t.includes('PARCELADO') ||
    /\bPARCELA\b/.test(t) ||
    /\bVISA\b/.test(t) ||
    t.includes('MASTER') ||
    /\bELO\b/.test(t) ||
    /\bAMEX\b/.test(t) ||
    t.includes('HIPERCARD') ||
    t.includes('HIPER') ||
    t.includes('MAQUININHA') ||
    t.includes('MAQUIN');

  if (isCredito) return 'Crédito';

  if (t.includes('TED') || t.includes('DOC') || t.includes('TRANSFER')) return 'Transferência';
  if (t.includes('BOLETO')) return 'Boleto';
  if (t.includes('DINHEIRO') || t.includes('ESPECIE')) return 'Dinheiro';
  return 'Outros';
}

/**
 * Método usado na listagem / resumos.
 * Regra catch‑all **somente para entradas**: se `normalizarMetodoPagamento` der `Outros`, assume **PIX**.
 * **Saídas** não usam essa regra — permanecem `Outros` (ou o que a heurística retornar).
 */
export function metodoPagamentoFinal(
  metodoRaw: string | null | undefined,
  tipo: 'entrada' | 'saida'
): MetodoPagamento {
  const base = normalizarMetodoPagamento(metodoRaw);
  if (tipo === 'entrada' && base === 'Outros') return 'PIX';
  return base;
}

/**
 * Filtra transacoes aplicando regras de entradas externas (EA/Blead etc.)
 * e sua correspondente saida de repasse (Samuel) com tolerancia.
 */
export function filtrarTransacoesOficiais(todas: TransacaoBase[]): { entradas: TransacaoBase[]; saidas: TransacaoBase[] } {
  const idsParaIgnorar = new Set<string>();
  const externosPorData = new Map<string, { id: string; valor: number; usado: boolean }[]>();

  for (const r of todas) {
    const tipoN = normalizarTipoTransacao(r.tipo);
    const pessoa = (r.pessoa ?? '').toLowerCase().trim();
    const descricao = (r.descricao ?? '').toLowerCase().trim();
    const isExternal = businessRules.transacoes.externalEntryNames.some((entry) => {
      const entryLc = entry.toLowerCase();
      return pessoa.startsWith(entryLc) || descricao.includes(entryLc);
    });
    if (tipoN === 'entrada' && isExternal) {
      const arr = externosPorData.get(r.data) ?? [];
      arr.push({ id: r.id, valor: Number(r.valor || 0), usado: false });
      externosPorData.set(r.data, arr);
      idsParaIgnorar.add(r.id);
    }
  }

  const TOLERANCIA = businessRules.transacoes.externalPairTolerance;
  for (const r of todas) {
    const pessoa = (r.pessoa ?? '').toLowerCase().trim();
    if (normalizarTipoTransacao(r.tipo) !== 'saida') continue;
    if (!pessoa.startsWith(businessRules.transacoes.samuelNamePrefix)) continue;
    const arr = externosPorData.get(r.data);
    if (!arr || arr.length === 0) continue;
    const valorSaida = Number(r.valor || 0);
    for (const ext of arr) {
      if (ext.usado) continue;
      if (Math.abs(ext.valor - valorSaida) <= TOLERANCIA) {
        ext.usado = true;
        idsParaIgnorar.add(r.id);
        break;
      }
    }
  }

  /** Repasse Samuel ~5k: exclui saídas com esse nome na faixa, mesmo sem par com EA (fluxo Blead/externo). */
  const sam = businessRules.transacoes.samuelNamePrefix;
  const vmin = businessRules.transacoes.samuelRepasseValorMin;
  const vmax = businessRules.transacoes.samuelRepasseValorMax;
  for (const r of todas) {
    if (normalizarTipoTransacao(r.tipo) !== 'saida') continue;
    const pessoa = (r.pessoa ?? '').toLowerCase().trim();
    if (!pessoa.startsWith(sam)) continue;
    const v = Math.abs(Number(r.valor || 0));
    if (v >= vmin && v <= vmax) idsParaIgnorar.add(r.id);
  }

  const entradas = todas.filter((r) => normalizarTipoTransacao(r.tipo) === 'entrada' && !idsParaIgnorar.has(r.id));
  const saidas = todas.filter((r) => normalizarTipoTransacao(r.tipo) === 'saida' && !idsParaIgnorar.has(r.id));
  return { entradas, saidas };
}

