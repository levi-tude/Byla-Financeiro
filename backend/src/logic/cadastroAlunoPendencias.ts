import { alunoSemCobrancaObrigatoria } from './regimeCobrancaAluno.js';

export const PENDENCIA_CAMPOS_IGNORAVEIS = [
  'wpp',
  'responsaveis',
  'venc',
  'valor_ref',
  'pagador_pix',
  'plano',
] as const;

export type PendenciaCampoIgnoravel = (typeof PENDENCIA_CAMPOS_IGNORAVEIS)[number];

export type CadastroAlunoPendenciasInput = {
  wpp?: string | null;
  responsaveis?: string | null;
  responsaveis_exibicao?: string | null;
  venc?: string | null;
  venc_exibicao?: string | null;
  plano?: string | null;
  regime_cobranca?: string | null;
  valor_referencia?: number | null;
  valor_mensal_exibicao?: number | null;
  valor_mensal_origem?: 'cadastro' | 'planilha_bruta' | 'ultimo_pagamento' | null;
  pagador_pix?: string | null;
  pagador_pix_exibicao?: string | null;
  pendencia_campos_ignorados?: PendenciaCampoIgnoravel[];
};

export function parsePendenciaCamposIgnorados(v: unknown): PendenciaCampoIgnoravel[] {
  if (!Array.isArray(v)) return [];
  const allowed = new Set<string>(PENDENCIA_CAMPOS_IGNORAVEIS);
  const out: PendenciaCampoIgnoravel[] = [];
  for (const x of v) {
    const s = String(x).trim();
    if (allowed.has(s) && !(out as string[]).includes(s)) out.push(s as PendenciaCampoIgnoravel);
  }
  return out;
}

function ignoradosDoAluno(a: CadastroAlunoPendenciasInput): Set<string> {
  return new Set<string>(a.pendencia_campos_ignorados ?? []);
}

/** Mesma regra do Fluxo operacional (`camposCadastroFaltantes`). */
export function camposCadastroFaltantes(a: CadastroAlunoPendenciasInput): string[] {
  const ign = ignoradosDoAluno(a);
  const r: string[] = [];
  if (!ign.has('wpp') && !String(a.wpp ?? '').trim()) r.push('WhatsApp');
  if (!ign.has('responsaveis') && !(a.responsaveis_exibicao?.trim() || a.responsaveis?.trim())) {
    r.push('Responsáveis');
  }
  const semCobranca = alunoSemCobrancaObrigatoria({
    regime_cobranca: a.regime_cobranca,
    plano: a.plano,
  });
  if (!ign.has('venc') && !semCobranca && !(a.venc_exibicao?.trim() || a.venc?.trim())) {
    r.push('Vencimento');
  }
  if (!ign.has('valor_ref') && !semCobranca) {
    if (a.valor_mensal_origem === 'planilha_bruta' || a.valor_mensal_origem === 'ultimo_pagamento') {
      r.push('Valor ref. (confirmar no cadastro)');
    } else if (a.valor_referencia == null && a.valor_mensal_exibicao == null) {
      r.push('Valor ref.');
    }
  }
  if (
    !ign.has('pagador_pix') &&
    !semCobranca &&
    !(a.pagador_pix_exibicao?.trim() || a.pagador_pix?.trim())
  ) {
    r.push('Pagador PIX');
  }
  if (!ign.has('plano') && !semCobranca && !String(a.plano ?? '').trim()) r.push('Plano');
  return r;
}

export function cadastroAlunoEstaCompleto(a: CadastroAlunoPendenciasInput): boolean {
  return camposCadastroFaltantes(a).length === 0;
}
