/**
 * Helpers compartilhados para importar Fluxo da planilha (migrate legado e sync incremental).
 */

import type { PagamentosAluno } from '../services/planilhaPagamentos.js';
import type { PagamentoDesiredIncremental } from './syncFluxoIncrementalPlan.js';
import type { SecaoBloco } from './parsePlanilhaPorBlocos.js';

type AnyRow = Record<string, unknown>;

export function normFluxoImport(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
}

function pick(row: AnyRow, keys: string[]): string {
  const wanted = new Set(keys.map(normFluxoImport));
  for (const [k, v] of Object.entries(row)) {
    if (wanted.has(normFluxoImport(k))) return String(v ?? '').trim();
  }
  return '';
}

export function parseMoneyFluxo(v: string): number | null {
  const raw = (v ?? '').trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d,.\-]/g, '');
  if (!cleaned) return null;
  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  let normalized = cleaned;
  if (hasComma && hasDot) normalized = cleaned.replace(/\./g, '').replace(',', '.');
  else if (hasComma) normalized = cleaned.replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function resolveAlunoNome(row: AnyRow): string {
  const principal = String(row.nome ?? '').trim();
  if (principal) return principal;
  const alt = pick(row, ['ALUNO', 'CLIENTE', 'NOME']);
  if (alt) return alt;
  return String(row.col_0 ?? '').trim();
}

export function normalizeIsoDate(iso: string): { date: string | null; corrected: boolean } {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return { date: null, corrected: false };
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return { date: null, corrected: false };
  }
  if (month < 1 || month > 12) return { date: null, corrected: false };
  const lastDay = new Date(year, month, 0).getDate();
  if (day >= 1 && day <= lastDay) return { date: `${m[1]}-${m[2]}-${m[3]}`, corrected: false };
  const clamped = Math.min(Math.max(day, 1), lastDay);
  return { date: `${m[1]}-${m[2]}-${String(clamped).padStart(2, '0')}`, corrected: true };
}

export function canonicalSheetName(name: string): string {
  const normalized = normFluxoImport(name).replace(/\s+/g, ' ');
  if (normalized === 'pilates marina') return 'PILATES';
  return String(name ?? '').trim();
}

export type AlunoPlanilhaPayload = {
  aba: string;
  modalidade: string;
  linha_planilha: number;
  aluno_nome: string;
  wpp: string | null;
  responsaveis: string | null;
  plano: string | null;
  matricula: string | null;
  fim: string | null;
  venc: string | null;
  valor_referencia: number | null;
  pagador_pix: string | null;
  observacoes: string | null;
  ativo: boolean;
  /** Seção detectada automaticamente pelo parser (normal, bolsas, capacitacao, inativo). */
  secao: SecaoBloco;
  raw_row: AnyRow;
  origem: 'migracao_planilha';
};

export function buildAlunosFromPlanilhaRows(rows: AnyRow[]): AlunoPlanilhaPayload[] {
  const linhaFallbackPorAba = new Map<string, number>();
  return rows
    .filter((r) => String(r._aba ?? '').trim())
    .map((r) => {
      const aba = String(r._aba ?? '').trim();
      const modalidade = String(r._modalidade ?? r._modalidade_aba ?? aba).trim() || aba;
      const alunoNome = resolveAlunoNome(r);
      const linhaRaw = Number(r._linha ?? 0);
      const linhaFallbackAtual = (linhaFallbackPorAba.get(aba) ?? 0) + 1;
      linhaFallbackPorAba.set(aba, linhaFallbackAtual);
      const linha = linhaRaw > 0 ? linhaRaw : linhaFallbackAtual;
      const valorRef = parseMoneyFluxo(
        pick(r, [
          'VALOR',
          'VALOR MENSAL',
          'MENSALIDADE',
          'MENSAL',
          'VLR',
          'VALOR R$',
          'VALORES',
          'VALOR MENSALIDADE',
        ]),
      );
      return {
        aba,
        modalidade,
        linha_planilha: linha,
        aluno_nome: alunoNome,
        wpp: pick(r, ['WPP', 'TELEFONE', 'WHATSAPP']) || null,
        responsaveis: pick(r, ['RESPONSÁVEIS', 'RESPONSAVEIS', 'RESPONS.', 'RESP.']) || null,
        plano: pick(r, ['PLANO']) || null,
        matricula: pick(r, ['MATRICULA', 'MATRÍCULA']) || null,
        fim: pick(r, ['FIM']) || null,
        venc: pick(r, ['VENC', 'VENC.', 'DATA VENC', 'VENCIMENTO']) || null,
        valor_referencia: valorRef,
        pagador_pix: pick(r, ['PRÓ', 'PRO', 'PAGADOR', 'PIX']) || null,
        observacoes: pick(r, ['OBSERVAÇÕES', 'OBS.', 'OBS']) || null,
        ativo: Boolean(r._ativo ?? true),
        secao: (String(r._secao ?? 'normal') as SecaoBloco) || 'normal',
        raw_row: r,
        origem: 'migracao_planilha' as const,
      };
    })
    .filter((x) => x.aba && x.modalidade && x.linha_planilha > 0 && x.aluno_nome);
}

export function buildPagamentosDesiredFromAba(args: {
  aba: string;
  alunos: PagamentosAluno[];
  erros: string[];
  avisosDatasCorrigidas: string[];
}): PagamentoDesiredIncremental[] {
  const out: PagamentoDesiredIncremental[] = [];
  const ordemPorLinha = new Map<string, number>();
  for (const al of args.alunos) {
    for (const p of al.pagamentos) {
      const linhaKey = `${args.aba}::${al.linha}`;
      const ordemLancamento = (ordemPorLinha.get(linhaKey) ?? 0) + 1;
      ordemPorLinha.set(linhaKey, ordemLancamento);
      const normalizedDate = normalizeIsoDate(p.data);
      if (!normalizedDate.date) {
        args.erros.push(
          `${args.aba}: data inválida descartada (${p.data}) aluno=${al.aluno} linha=${al.linha}`,
        );
        continue;
      }
      if (normalizedDate.corrected) {
        args.avisosDatasCorrigidas.push(
          `${args.aba}: data ${p.data} corrigida para ${normalizedDate.date} (aluno=${al.aluno}, linha=${al.linha})`,
        );
      }
      out.push({
        aba: args.aba,
        modalidade: al.modalidade,
        linha_planilha: al.linha,
        ordem_lancamento: ordemLancamento,
        aluno_nome: al.aluno,
        data_pagamento: normalizedDate.date,
        forma: p.forma || null,
        valor: p.valor,
        mes_competencia: p.mesCompetencia,
        ano_competencia: p.anoCompetencia,
        responsaveis: (p.responsaveis ?? []).join(' | ') || null,
        pagador_pix: p.pagadorPix || null,
        raw_pagamento: p,
      });
    }
  }
  return out;
}

export function parseAbasArg(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const list = raw
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
  return list.length > 0 ? list : undefined;
}
