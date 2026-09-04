/**
 * Mapeia linhas parseadas da seção PROGRAMA DE BOLSAS para o payload da UI.
 * Sem PII extra; nomes vêm da planilha autenticada (mesmo escopo do Fluxo).
 */

import { parseMoneyFluxo, resolveAlunoNome } from './fluxoPlanilhaImport.js';
import type { SecaoBloco } from './parsePlanilhaPorBlocos.js';

export type ProgramaBolsaItem = {
  alunoNome: string;
  modalidadeOriginal: string | null;
  plano: string | null;
  valorReferencia: number | null;
  venc: string | null;
  responsaveis: string | null;
  wpp: string | null;
  observacoes: string | null;
};

export type ProgramaBolsasPayload = {
  aba: string;
  origem: 'programa_bolsas';
  atualizadoEm: string;
  itens: ProgramaBolsaItem[];
};

type AnyRow = Record<string, unknown>;

function normKey(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
}

function pick(row: AnyRow, keys: string[]): string {
  const wanted = new Set(keys.map(normKey));
  for (const [k, v] of Object.entries(row)) {
    if (wanted.has(normKey(k))) return String(v ?? '').trim();
  }
  return '';
}

/** True se o nome do bloco/modalidade é capacitação (formação). */
export function isModalidadeCapacitacao(nome: string): boolean {
  const n = String(nome ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase();
  return n.includes('CAPACITAC') || n.includes('CURSO DE CAPACIT');
}

/** True se o nome é o bloco Programa de Bolsas (não turma). */
export function isModalidadeProgramaBolsas(nome: string): boolean {
  const n = String(nome ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase();
  if (n.includes('PROGRAMA DE BOLSAS') || n.includes('PROGRAMA BOLSA')) return true;
  // Evita confundir com "bolsa" em plano de aluno avulso
  return n === 'BOLSAS' || n.startsWith('BOLSAS ') || (n.includes('PROGRAMA') && n.includes('BOLSA'));
}

export function mapLinhasParaProgramaBolsas(args: {
  aba: string;
  linhas: Array<{
    row: Record<string, string | number | boolean>;
    secao?: SecaoBloco;
    modalidade?: string;
  }>;
  atualizadoEm?: string;
}): ProgramaBolsasPayload {
  const itens: ProgramaBolsaItem[] = [];
  for (const l of args.linhas) {
    if (l.secao && l.secao !== 'bolsas') continue;
    if (!l.secao && !isModalidadeProgramaBolsas(String(l.modalidade ?? ''))) continue;

    const row = l.row as AnyRow;
    const alunoNome = resolveAlunoNome(row);
    if (!alunoNome) continue;

    const observacoes = pick(row, ['OBSERVAÇÕES', 'OBS.', 'OBS']) || null;
    const plano = pick(row, ['PLANO']) || null;
    const valorRaw = pick(row, [
      'VALOR',
      'VALOR MENSAL',
      'MENSALIDADE',
      'MENSAL',
      'VLR',
      'VALOR R$',
      'VALORES',
      'VALOR MENSALIDADE',
    ]);
    itens.push({
      alunoNome,
      modalidadeOriginal: observacoes,
      plano,
      valorReferencia: parseMoneyFluxo(valorRaw),
      venc: pick(row, ['VENC', 'VENC.', 'DATA VENC', 'VENCIMENTO']) || null,
      responsaveis: pick(row, ['RESPONSÁVEIS', 'RESPONSAVEIS', 'RESPONS.', 'RESP.']) || null,
      wpp: pick(row, ['WPP', 'TELEFONE', 'WHATSAPP']) || null,
      observacoes,
    });
  }

  itens.sort((a, b) => a.alunoNome.localeCompare(b.alunoNome, 'pt-BR'));

  return {
    aba: args.aba,
    origem: 'programa_bolsas',
    atualizadoEm: args.atualizadoEm ?? new Date().toISOString(),
    itens,
  };
}
