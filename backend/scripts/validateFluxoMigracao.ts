/**
 * Valida migração da planilha FLUXO (alunos + pagamentos) comparando parser vs Supabase.
 * Uso:
 *   npm run validate:fluxo-migracao -- 2026
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { PlanilhaAlunosAdapter } from '../src/adapters/PlanilhaAlunosAdapter.js';
import { getSupabase } from '../src/services/supabaseClient.js';
import { lerPagamentosPorAbaEAno } from '../src/services/planilhaPagamentos.js';
import { isEligibleSheet } from '../src/businessRules.js';

type DiffItem = { chave: string; planilha: number; banco: number };

type AnyRow = Record<string, unknown>;

function norm(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
}

function pick(row: AnyRow, keys: string[]): string {
  const wanted = new Set(keys.map(norm));
  for (const [k, v] of Object.entries(row)) {
    if (wanted.has(norm(k))) return String(v ?? '').trim();
  }
  return '';
}

function resolveAlunoNome(row: AnyRow): string {
  const principal = String(row.nome ?? '').trim();
  if (principal) return principal;
  const alt = pick(row, ['ALUNO', 'CLIENTE', 'NOME']);
  if (alt) return alt;
  return String(row.col_0 ?? '').trim();
}

function normalizeIsoDate(iso: string): { date: string | null; corrected: boolean } {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return { date: null, corrected: false };
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return { date: null, corrected: false };
  if (month < 1 || month > 12) return { date: null, corrected: false };
  const lastDay = new Date(year, month, 0).getDate();
  if (day >= 1 && day <= lastDay) return { date: `${m[1]}-${m[2]}-${m[3]}`, corrected: false };
  const clamped = Math.min(Math.max(day, 1), lastDay);
  return { date: `${m[1]}-${m[2]}-${String(clamped).padStart(2, '0')}`, corrected: true };
}

function canonicalSheetName(name: string): string {
  const normalized = norm(name).replace(/\s+/g, ' ');
  if (normalized === 'pilates marina') return 'PILATES';
  return String(name ?? '').trim();
}

async function main() {
  const ano = Number(process.argv[2] ?? new Date().getFullYear());
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase não configurado.');

  const adapter = new PlanilhaAlunosAdapter();
  const all = await adapter.listarTodasAbas();
  if (all.error) throw new Error(all.error);
  const rows = (all.rows as AnyRow[]).filter((r) => {
    const aba = String(r._aba ?? '').trim();
    const aluno = resolveAlunoNome(r);
    return Boolean(aba && aluno);
  });

  const countPlanilhaByAba = new Map<string, number>();
  const countPlanilhaByAbaModalidade = new Map<string, number>();
  for (const r of rows) {
    const aba = String(r._aba ?? '').trim();
    const modalidade = String(r._modalidade ?? r._modalidade_aba ?? '').trim();
    if (!aba) continue;
    countPlanilhaByAba.set(aba, (countPlanilhaByAba.get(aba) ?? 0) + 1);
    const k = `${aba}::${modalidade}`;
    countPlanilhaByAbaModalidade.set(k, (countPlanilhaByAbaModalidade.get(k) ?? 0) + 1);
  }

  const { data: alunosDb, error: alunosErr } = await supabase
    .from('fluxo_alunos_operacionais')
    .select('aba, modalidade');
  if (alunosErr) throw new Error(alunosErr.message);
  const countDbByAba = new Map<string, number>();
  const countDbByAbaModalidade = new Map<string, number>();
  for (const r of (alunosDb ?? []) as Array<{ aba: string; modalidade: string }>) {
    const aba = r.aba;
    const modalidade = r.modalidade ?? '';
    countDbByAba.set(aba, (countDbByAba.get(aba) ?? 0) + 1);
    const k = `${aba}::${modalidade}`;
    countDbByAbaModalidade.set(k, (countDbByAbaModalidade.get(k) ?? 0) + 1);
  }

  const diffsAba: DiffItem[] = [];
  const abas = new Set([...countPlanilhaByAba.keys(), ...countDbByAba.keys()]);
  for (const a of abas) {
    const p = countPlanilhaByAba.get(a) ?? 0;
    const b = countDbByAba.get(a) ?? 0;
    if (p !== b) diffsAba.push({ chave: a, planilha: p, banco: b });
  }

  const diffsAbaModalidade: DiffItem[] = [];
  const ks = new Set([...countPlanilhaByAbaModalidade.keys(), ...countDbByAbaModalidade.keys()]);
  for (const k of ks) {
    const p = countPlanilhaByAbaModalidade.get(k) ?? 0;
    const b = countDbByAbaModalidade.get(k) ?? 0;
    if (p !== b) diffsAbaModalidade.push({ chave: k, planilha: p, banco: b });
  }

  // pagamentos
  let pagamentosPlanilha = 0;
  let pagamentosDescartadosDataInvalida = 0;
  const abasElegiveis = Array.from(
    new Set((all.abas ?? []).map((a) => canonicalSheetName(a)).filter((a) => isEligibleSheet(a)))
  );
  const errosPag: string[] = [];
  for (const aba of abasElegiveis) {
    const p = await lerPagamentosPorAbaEAno(aba, ano);
    if (p.error) {
      errosPag.push(`${aba}: ${p.error}`);
      continue;
    }
    for (const al of p.alunos) {
      for (const pg of al.pagamentos) {
        const nd = normalizeIsoDate(pg.data);
        if (!nd.date) {
          pagamentosDescartadosDataInvalida += 1;
          continue;
        }
        pagamentosPlanilha += 1;
      }
    }
  }

  const { count: pagamentosBanco, error: pagErr } = await supabase
    .from('fluxo_pagamentos_operacionais')
    .select('*', { count: 'exact', head: true })
    .gte('data_pagamento', `${ano}-01-01`)
    .lte('data_pagamento', `${ano}-12-31`);
  if (pagErr) throw new Error(pagErr.message);

  const report = {
    ano,
    alunos: {
      totalPlanilha: rows.length,
      totalBanco: alunosDb?.length ?? 0,
      diffsAba,
      diffsAbaModalidade: diffsAbaModalidade.slice(0, 50),
    },
    pagamentos: {
      totalPlanilha: pagamentosPlanilha,
      totalBanco: pagamentosBanco ?? 0,
      delta: (pagamentosBanco ?? 0) - pagamentosPlanilha,
      descartadosDataInvalida: pagamentosDescartadosDataInvalida,
      errosLeituraPlanilha: errosPag,
    },
    ok:
      diffsAba.length === 0 &&
      diffsAbaModalidade.length === 0 &&
      (pagamentosBanco ?? 0) === pagamentosPlanilha &&
      errosPag.length === 0,
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
