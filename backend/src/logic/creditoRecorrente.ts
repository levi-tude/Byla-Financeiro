import { normalizeText, shiftISODate } from './conciliacaoTexto.js';
import { isNomeGenericoMaquininha } from './entradasPagadorUtil.js';

/** Offset padrão PagBank: cobrança no Fluxo → liquidação Vendas ~D+5. */
export const OFFSET_DIAS_EXTRATO_PADRAO = 5;
/** Folga em torno da data esperada no extrato (não confundir com ±7 de PIX/nome). */
export const FOLGA_DIAS_JANELA_VENDAS = 2;
export const TOLERANCIA_VALOR_VENDAS_PCT = 0.05;
export const TOLERANCIA_VALOR_PIX = 0.01;

export type CreditoBancoCand = {
  id: string;
  data: string;
  valor: number;
  pessoa: string;
  descricao: string | null;
};

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function textoIndicaCredito(t: string): boolean {
  return t.includes('CREDITO');
}

function textoCombinado(pessoa: string, descricao?: string | null): string {
  return normalizeText(`${pessoa} ${descricao ?? ''}`);
}

export function isCreditoGenericoExtrato(pessoa: string, descricao?: string | null): boolean {
  const text = textoCombinado(pessoa, descricao);
  if (!text) return false;

  if (text.includes('VENDAS')) return true;

  const hasCredito = text.includes('CREDITO');
  const hasBandeira =
    text.includes('VISA') ||
    text.includes('MASTER') ||
    text.includes('MASTERCARD') ||
    text.includes('ELO') ||
    text.includes('DISPONIVEL');

  if (hasCredito && hasBandeira) return true;
  if (isNomeGenericoMaquininha(pessoa) && textoIndicaCredito(text)) return true;
  return false;
}

/** Débito de maquininha genérico (ex.: Disponivel DEBITO VISA) — valor líquido com taxa. */
export function isDebitoGenericoExtrato(pessoa: string, descricao?: string | null): boolean {
  const text = textoCombinado(pessoa, descricao);
  if (!text) return false;
  const hasDebito =
    text.includes('DEBITO') || text.includes('ELECTRON') || text.includes('MAESTRO');
  if (!hasDebito) return false;
  return (
    text.includes('DISPONIVEL') ||
    text.includes('VISA') ||
    text.includes('MASTER') ||
    text.includes('MASTERCARD') ||
    text.includes('ELO') ||
    isNomeGenericoMaquininha(pessoa)
  );
}

export function offsetObservadoDias(dataPagamentoFluxoIso: string, dataBancoIso: string): number {
  const a = String(dataPagamentoFluxoIso).slice(0, 10);
  const b = String(dataBancoIso).slice(0, 10);
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 5;
  const dias = Math.round((tb - ta) / 86_400_000);
  return Math.min(45, Math.max(0, dias));
}

export function dataFluxoCreditoRecorrente(ano: number, mes: number, diaPagamentoFluxo: number): string {
  const dia = Math.min(diaPagamentoFluxo, lastDayOfMonth(ano, mes));
  const mm = String(mes).padStart(2, '0');
  const dd = String(dia).padStart(2, '0');
  return `${ano}-${mm}-${dd}`;
}

export function dataEsperadaCreditoRecorrente(
  ano: number,
  mes: number,
  diaPagamentoFluxo: number,
  offsetDias = OFFSET_DIAS_EXTRATO_PADRAO,
): string {
  return shiftISODate(dataFluxoCreditoRecorrente(ano, mes, diaPagamentoFluxo), offsetDias);
}

/** Janela inteligente Vendas/crédito recorrente: centro em D+offset, folga ±N (default 2). */
export function janelaEsperadaCreditoRecorrente(opts: {
  ano: number;
  mes: number;
  diaPagamentoFluxo: number;
  offsetDiasExtrato?: number;
  folgaDias?: number;
}): { dataFluxo: string; dataEsperada: string; janela: string[] } {
  const offset = opts.offsetDiasExtrato ?? OFFSET_DIAS_EXTRATO_PADRAO;
  const folga = opts.folgaDias ?? FOLGA_DIAS_JANELA_VENDAS;
  const dataFluxo = dataFluxoCreditoRecorrente(opts.ano, opts.mes, opts.diaPagamentoFluxo);
  const dataEsperada = shiftISODate(dataFluxo, offset);
  return { dataFluxo, dataEsperada, janela: janelaDatasCredito(dataEsperada, folga) };
}

export function janelaDatasCredito(dataEsperadaIso: string, folgaDias = 1): string[] {
  const datas: string[] = [];
  for (let delta = -folgaDias; delta <= folgaDias; delta++) {
    datas.push(shiftISODate(dataEsperadaIso, delta));
  }
  return datas;
}

/** Match valor Fluxo × banco: Vendas/crédito/débito maquininha usam taxa ~5%; PIX ±R$ 0,01. */
export function valorPlanilhaBancoCompativel(opts: {
  valorPlanilha: number;
  valorBanco: number;
  pessoa?: string;
  descricao?: string | null;
  valorBancoUltimo?: number | null;
  toleranciaAbs?: number;
  toleranciaPct?: number;
}): boolean {
  const tolAbs = opts.toleranciaAbs ?? TOLERANCIA_VALOR_PIX;
  const genericoCartao =
    (opts.pessoa != null && isCreditoGenericoExtrato(opts.pessoa, opts.descricao)) ||
    (opts.pessoa != null && isDebitoGenericoExtrato(opts.pessoa, opts.descricao));
  if (genericoCartao) {
    return valorBancoCompativel({
      valorBanco: opts.valorBanco,
      somaMensalidades: opts.valorPlanilha,
      valorBancoUltimo: opts.valorBancoUltimo ?? null,
      toleranciaPct: opts.toleranciaPct ?? TOLERANCIA_VALOR_VENDAS_PCT,
    });
  }
  return Math.abs(Number(opts.valorPlanilha || 0) - Number(opts.valorBanco || 0)) <= tolAbs;
}

export function valorBancoCompativel(opts: {
  valorBanco: number;
  somaMensalidades: number;
  valorBancoUltimo: number | null;
  toleranciaPct?: number;
}): boolean {
  const { valorBanco, somaMensalidades, valorBancoUltimo, toleranciaPct = TOLERANCIA_VALOR_VENDAS_PCT } = opts;

  if (valorBancoUltimo != null && Math.abs(valorBanco - valorBancoUltimo) <= 0.05) {
    return true;
  }

  if (somaMensalidades === 0) return false;
  return Math.abs(valorBanco - somaMensalidades) / somaMensalidades <= toleranciaPct;
}

export function escolherCandidatoCredito(opts: {
  candidatos: CreditoBancoCand[];
  somaMensalidades: number;
  valorBancoUltimo: number | null;
}): { status: 'unico' | 'ambiguidade' | 'nenhum'; candidato?: CreditoBancoCand; avisoValor?: boolean } {
  const { candidatos, somaMensalidades, valorBancoUltimo } = opts;

  const genericos = candidatos.filter((c) => isCreditoGenericoExtrato(c.pessoa, c.descricao));

  if (genericos.length === 0) {
    return { status: 'nenhum' };
  }

  let pool = genericos;
  if (genericos.length > 1) {
    const compativeis = genericos.filter((c) =>
      valorBancoCompativel({ valorBanco: c.valor, somaMensalidades, valorBancoUltimo }),
    );
    if (compativeis.length > 0) {
      pool = compativeis;
    }
  }

  if (pool.length > 1) {
    return { status: 'ambiguidade' };
  }

  const candidato = pool[0];
  const compativel = valorBancoCompativel({
    valorBanco: candidato.valor,
    somaMensalidades,
    valorBancoUltimo,
  });

  return {
    status: 'unico',
    candidato,
    avisoValor: !compativel,
  };
}
