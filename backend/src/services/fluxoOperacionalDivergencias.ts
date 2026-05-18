import { getSupabase } from './supabaseClient.js';
import { config } from '../config.js';
import { PlanilhaAlunosAdapter } from '../adapters/PlanilhaAlunosAdapter.js';
import { lerPagamentosPorAbaEAno } from './planilhaPagamentos.js';
import { isEligibleSheet } from '../businessRules.js';
import { isPlanilhaReadEnabled } from './fluxoPrimarySource.js';

function norm(s: string): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
}

function alunoKey(aba: string, linha: number, nome: string): string {
  return `${norm(aba)}|${linha}|${norm(nome)}`;
}

function resolveAlunoNome(row: Record<string, unknown>): string {
  return String(row.ALUNO ?? row.CLIENTE ?? row.nome ?? row.Cliente ?? '').trim();
}

export type DivergenciaAlunoItem = {
  aba: string;
  modalidade: string;
  linha: number;
  aluno: string;
  origem: 'so_banco' | 'so_planilha';
};

export type DivergenciaPagamentoResumo = {
  mes: number;
  ano: number;
  totalBanco: number;
  totalPlanilha: number;
  delta: number;
};

export type FluxoDivergenciasPayload = {
  mes: number;
  ano: number;
  planilhaHabilitada: boolean;
  alunos: {
    totalBanco: number;
    totalPlanilha: number;
    soNoBanco: DivergenciaAlunoItem[];
    soNaPlanilha: DivergenciaAlunoItem[];
  };
  pagamentos: DivergenciaPagamentoResumo;
  errosPlanilha: string[];
};

export async function computeFluxoDivergencias(mes: number, ano: number): Promise<FluxoDivergenciasPayload> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase não configurado no backend.');

  const { data: alunosBanco, error: alunosErr } = await supabase
    .from('fluxo_alunos_operacionais')
    .select('aba, modalidade, linha_planilha, aluno_nome, ativo');
  if (alunosErr) throw new Error(alunosErr.message);

  const bancoKeys = new Map<string, { aba: string; modalidade: string; linha: number; aluno: string }>();
  for (const a of alunosBanco ?? []) {
    if (a.ativo === false) continue;
    const k = alunoKey(String(a.aba), Number(a.linha_planilha), String(a.aluno_nome));
    bancoKeys.set(k, {
      aba: String(a.aba),
      modalidade: String(a.modalidade),
      linha: Number(a.linha_planilha),
      aluno: String(a.aluno_nome),
    });
  }

  const planilhaKeys = new Map<string, { aba: string; modalidade: string; linha: number; aluno: string }>();
  const errosPlanilha: string[] = [];

  if (isPlanilhaReadEnabled() && config.sheets.spreadsheetId) {
    const adapter = new PlanilhaAlunosAdapter();
    const all = await adapter.listarTodasAbas();
    if (all.error) errosPlanilha.push(all.error);
    else {
      let linhaFallback = 1;
      for (const row of all.rows as Array<Record<string, unknown>>) {
        const aba = String(row._aba ?? '').trim();
        const aluno = resolveAlunoNome(row);
        if (!aba || !aluno) continue;
        const ativo = row._ativo;
        if (ativo === false || ativo === 'false') continue;
        const linha = Number(row._linha ?? row.linha ?? linhaFallback++);
        const mod = String(row._modalidade ?? row.MODALIDADE ?? row['MODALIDADE '] ?? aba).trim();
        const k = alunoKey(aba, linha, aluno);
        planilhaKeys.set(k, { aba, modalidade: mod, linha, aluno });
      }
    }
  }

  const soNoBanco: DivergenciaAlunoItem[] = [];
  const soNaPlanilha: DivergenciaAlunoItem[] = [];

  for (const [k, v] of bancoKeys) {
    if (!planilhaKeys.has(k)) {
      soNoBanco.push({ ...v, origem: 'so_banco' });
    }
  }
  for (const [k, v] of planilhaKeys) {
    if (!bancoKeys.has(k)) {
      soNaPlanilha.push({ ...v, origem: 'so_planilha' });
    }
  }

  soNoBanco.sort((a, b) => a.aba.localeCompare(b.aba) || a.aluno.localeCompare(b.aluno));
  soNaPlanilha.sort((a, b) => a.aba.localeCompare(b.aba) || a.aluno.localeCompare(b.aluno));

  const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const fimDate = new Date(ano, mes, 0);
  const fim = `${ano}-${String(mes).padStart(2, '0')}-${String(fimDate.getDate()).padStart(2, '0')}`;

  const { count: totalBanco, error: pagErr } = await supabase
    .from('fluxo_pagamentos_operacionais')
    .select('*', { count: 'exact', head: true })
    .gte('data_pagamento', inicio)
    .lte('data_pagamento', fim);
  if (pagErr) throw new Error(pagErr.message);

  let totalPlanilha = 0;
  if (isPlanilhaReadEnabled() && config.sheets.spreadsheetId) {
    const adapter = new PlanilhaAlunosAdapter();
    const all = await adapter.listarTodasAbas();
    const abas = Array.from(new Set((all.abas ?? []).filter((a) => isEligibleSheet(a))));
    for (const aba of abas) {
      const p = await lerPagamentosPorAbaEAno(aba, ano);
      if (p.error) {
        errosPlanilha.push(`${aba}: ${p.error}`);
        continue;
      }
      for (const al of p.alunos) {
        for (const pg of al.pagamentos) {
          const mc = Number((pg as { mesCompetencia?: number; mes?: number }).mesCompetencia ?? pg.mes ?? 0);
          if (mc === mes) totalPlanilha += 1;
        }
      }
    }
  }

  return {
    mes,
    ano,
    planilhaHabilitada: isPlanilhaReadEnabled(),
    alunos: {
      totalBanco: bancoKeys.size,
      totalPlanilha: planilhaKeys.size,
      soNoBanco: soNoBanco.slice(0, 200),
      soNaPlanilha: soNaPlanilha.slice(0, 200),
    },
    pagamentos: {
      mes,
      ano,
      totalBanco: totalBanco ?? 0,
      totalPlanilha,
      delta: (totalBanco ?? 0) - totalPlanilha,
    },
    errosPlanilha,
  };
}
