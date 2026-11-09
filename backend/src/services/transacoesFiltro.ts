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

/** Rótulo para saídas: o extrato não traz o meio de pagamento das saídas (só o favorecido). */
export const MEIO_SAIDA_NAO_INFORMADO = 'Não informado no extrato';

/** Meio para resumos (Criações/chat): saída sem meio identificável → "Não informado no extrato" (não "Outros"). */
export function meioParaResumo(metodoRaw: string | null | undefined, tipo: 'entrada' | 'saida'): string {
  const m = metodoPagamentoFinal(metodoRaw, tipo);
  return tipo === 'saida' && m === 'Outros' ? MEIO_SAIDA_NAO_INFORMADO : m;
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

/** Converte padrão SQL LIKE ('%' e '_') em RegExp ancorada (mesma semântica da view). */
export function likeParaRegExp(padrao: string): RegExp {
  const esc = padrao
    .toLowerCase()
    .split('')
    .map((c) => (c === '%' ? '.*' : c === '_' ? '.' : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('');
  return new RegExp(`^${esc}$`, 's');
}

let padroesExternosAtivos: RegExp[] = businessRules.transacoes.padroesExternosFallback.map(likeParaRegExp);

/** Troca os padrões de pagador externo (vindos de `regras_externos`). Lista vazia → fallback do código. */
export function definirPadroesExternos(padroes: readonly string[] | null | undefined): void {
  const lista = (padroes ?? []).map((p) => String(p ?? '').trim().toLowerCase()).filter(Boolean);
  const fonte = lista.length > 0 ? lista : businessRules.transacoes.padroesExternosFallback;
  padroesExternosAtivos = fonte.map(likeParaRegExp);
}

/** Entrada de pagador externo (salário do outro trabalho do Samuel)? Mesma regra da view. */
export function isEntradaExterna(r: Pick<TransacaoBase, 'pessoa' | 'descricao'>): boolean {
  const pessoa = (r.pessoa ?? '').toLowerCase().trim();
  const descricao = (r.descricao ?? '').toLowerCase().trim();
  return padroesExternosAtivos.some((re) => re.test(pessoa) || re.test(descricao));
}

function diaNum(data: string): number {
  return Math.round(Date.parse(`${String(data).slice(0, 10)}T00:00:00Z`) / 86400000);
}

/**
 * Filtra transacoes oficiais: tira entradas de pagadores externos (EA, Blead, Rbc…) e as
 * saídas de repasse ao Samuel que formam par com elas. Espelha EXATAMENTE a view
 * `v_resumo_mensal_oficial` (migração 2026-11-01):
 * 1. par 1:1 — entrada externa e saída Samuel a até ±1 dia e |Δvalor| ≤ tolerância; cada lado
 *    fica com o candidato mais próximo (dias, depois valor, depois id) e o par só vale se for
 *    a melhor escolha dos dois lados;
 * 2. par por soma — saída Samuel sem par 1:1 que bate com a soma de 2+ entradas externas
 *    (ainda sem par) a até ±1 dia (ex.: 08/09/2026, 8.000 = EA 5.533 + Blead 2.500).
 */
export function filtrarTransacoesOficiais(todas: TransacaoBase[]): { entradas: TransacaoBase[]; saidas: TransacaoBase[] } {
  const TOL = businessRules.transacoes.externalPairTolerance;
  const JAN = businessRules.transacoes.externalPairJanelaDias;
  const sam = businessRules.transacoes.samuelNamePrefix;
  type Mov = { id: string; dia: number; valor: number };
  const ext: Mov[] = [];
  const sams: Mov[] = [];
  for (const r of todas) {
    const tipoN = normalizarTipoTransacao(r.tipo);
    const m = { id: String(r.id), dia: diaNum(r.data), valor: Number(r.valor || 0) };
    if (tipoN === 'entrada' && isEntradaExterna(r)) ext.push(m);
    else if (tipoN === 'saida' && (r.pessoa ?? '').toLowerCase().trim().startsWith(sam)) sams.push(m);
  }
  const idsParaIgnorar = new Set<string>(ext.map((e) => e.id));

  type Cand = { s: Mov; e: Mov; dd: number; dv: number };
  const cands: Cand[] = [];
  for (const s of sams) {
    for (const e of ext) {
      const dd = Math.abs(s.dia - e.dia);
      const dv = Math.abs(s.valor - e.valor);
      if (dd <= JAN && dv <= TOL) cands.push({ s, e, dd, dv });
    }
  }
  const cmpId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const melhorPorE = new Map<string, Cand>();
  const melhorPorS = new Map<string, Cand>();
  for (const c of cands) {
    const be = melhorPorE.get(c.e.id);
    if (!be || c.dd < be.dd || (c.dd === be.dd && (c.dv < be.dv || (c.dv === be.dv && cmpId(c.s.id, be.s.id) < 0)))) melhorPorE.set(c.e.id, c);
    const bs = melhorPorS.get(c.s.id);
    if (!bs || c.dd < bs.dd || (c.dd === bs.dd && (c.dv < bs.dv || (c.dv === bs.dv && cmpId(c.e.id, bs.e.id) < 0)))) melhorPorS.set(c.s.id, c);
  }
  const sUm = new Set<string>();
  const eUm = new Set<string>();
  for (const c of cands) {
    if (melhorPorE.get(c.e.id) === c && melhorPorS.get(c.s.id) === c) {
      sUm.add(c.s.id);
      eUm.add(c.e.id);
    }
  }
  for (const id of sUm) idsParaIgnorar.add(id);

  for (const s of sams) {
    if (sUm.has(s.id)) continue;
    const resto = ext.filter((e) => !eUm.has(e.id) && Math.abs(e.dia - s.dia) <= JAN);
    if (resto.length < 2) continue;
    const soma = resto.reduce((a, e) => a + e.valor, 0);
    if (Math.abs(s.valor - soma) <= TOL) idsParaIgnorar.add(s.id);
  }

  const entradas = todas.filter((r) => normalizarTipoTransacao(r.tipo) === 'entrada' && !idsParaIgnorar.has(String(r.id)));
  const saidas = todas.filter((r) => normalizarTipoTransacao(r.tipo) === 'saida' && !idsParaIgnorar.has(String(r.id)));
  return { entradas, saidas };
}
