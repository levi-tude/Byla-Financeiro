/**
 * Migração operacional da planilha FLUXO DE CAIXA BYLA para Supabase.
 * Uso:
 *   npm run migrate:fluxo-operacional -- 2026
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

function parseMoney(v: string): number | null {
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
  if (!Number.isFinite(ano) || ano < 2000) {
    console.error('Uso: npm run migrate:fluxo-operacional -- <ano>');
    process.exit(1);
  }

  const supabase = getSupabase();
  if (!supabase) {
    console.error('Supabase não configurado (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).');
    process.exit(1);
  }

  const planilha = new PlanilhaAlunosAdapter();
  const all = await planilha.listarTodasAbas();
  if (all.error) {
    console.error(`Erro ao ler planilha: ${all.error}`);
    process.exit(1);
  }

  const rows = all.rows as AnyRow[];
  const abas = Array.from(
    new Set(
      (all.abas ?? [])
        .map((a) => canonicalSheetName(a))
        .map((a) => a.trim())
        .filter(Boolean)
    )
  );

  // 1) Snapshot operacional dos alunos (linhas da planilha)
  const linhaFallbackPorAba = new Map<string, number>();
  const alunosPayload = rows
    .filter((r) => String(r._aba ?? '').trim())
    .map((r) => {
      const aba = String(r._aba ?? '').trim();
      const modalidade = String(r._modalidade ?? r._modalidade_aba ?? aba).trim() || aba;
      const alunoNome = resolveAlunoNome(r);
      const linhaRaw = Number(r._linha ?? 0);
      const linhaFallbackAtual = (linhaFallbackPorAba.get(aba) ?? 0) + 1;
      linhaFallbackPorAba.set(aba, linhaFallbackAtual);
      const linha = linhaRaw > 0 ? linhaRaw : linhaFallbackAtual;
      const valorRef = parseMoney(
        pick(r, [
          'VALOR',
          'VALOR MENSAL',
          'MENSALIDADE',
          'MENSAL',
          'VLR',
          'VALOR R$',
          'VALORES',
          'VALOR MENSALIDADE',
        ])
      );
      const ativo = Boolean(r._ativo ?? true);
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
        ativo,
        raw_row: r,
        origem: 'migracao_planilha',
      };
    })
    .filter((x) => x.aba && x.modalidade && x.linha_planilha > 0 && x.aluno_nome);

  if (alunosPayload.length === 0) {
    console.error('Nenhum aluno parseado para migração.');
    process.exit(1);
  }

  const upAlunos = await supabase
    .from('fluxo_alunos_operacionais')
    .upsert(alunosPayload, { onConflict: 'aba,linha_planilha' });
  if (upAlunos.error) {
    console.error(`Erro ao gravar fluxo_alunos_operacionais: ${upAlunos.error.message}`);
    process.exit(1);
  }

  // 2) Pagamentos operacionais por aba/ano
  const pagamentosPayload: Array<Record<string, unknown>> = [];
  const ordemPorLinha = new Map<string, number>();
  const errosPagamentos: string[] = [];
  const avisosPagamentos: string[] = [];
  const avisosDatasCorrigidas: string[] = [];

  for (const aba of abas) {
    if (!isEligibleSheet(aba)) continue;
    const res = await lerPagamentosPorAbaEAno(aba, ano);
    if (res.error) {
      errosPagamentos.push(`${aba}: ${res.error}`);
      continue;
    }
    for (const al of res.alunos) {
      for (const p of al.pagamentos) {
        const linhaKey = `${aba}::${al.linha}`;
        const ordemLancamento = (ordemPorLinha.get(linhaKey) ?? 0) + 1;
        ordemPorLinha.set(linhaKey, ordemLancamento);
        const normalizedDate = normalizeIsoDate(p.data);
        if (!normalizedDate.date) {
          errosPagamentos.push(`${aba}: data inválida descartada (${p.data}) aluno=${al.aluno} linha=${al.linha}`);
          continue;
        }
        if (normalizedDate.corrected) {
          avisosDatasCorrigidas.push(
            `${aba}: data ${p.data} corrigida para ${normalizedDate.date} (aluno=${al.aluno}, linha=${al.linha})`
          );
        }
        pagamentosPayload.push({
          aba,
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
          origem: 'migracao_planilha',
        });
      }
    }
  }

  // Remove o ano alvo para reprocessamento idempotente
  const inicioAno = `${ano}-01-01`;
  const fimAno = `${ano}-12-31`;
  const delYear = await supabase
    .from('fluxo_pagamentos_operacionais')
    .delete()
    .gte('data_pagamento', inicioAno)
    .lte('data_pagamento', fimAno);
  if (delYear.error) {
    console.error(`Erro ao limpar pagamentos do ano ${ano}: ${delYear.error.message}`);
    process.exit(1);
  }

  let pagamentosInseridos = 0;
  let pagamentosOrdemReajustada = 0;
  if (pagamentosPayload.length > 0) {
    for (const originalRow of pagamentosPayload) {
      const row = { ...originalRow };
      let inserted = false;
      let attempts = 0;
      while (!inserted && attempts < 10) {
        attempts += 1;
        const insPag = await supabase.from('fluxo_pagamentos_operacionais').insert(row);
        if (!insPag.error) {
          inserted = true;
          pagamentosInseridos += 1;
          if (attempts > 1) pagamentosOrdemReajustada += 1;
          break;
        }
        if (insPag.error.message.toLowerCase().includes('duplicate key value')) {
          row.ordem_lancamento = Number(row.ordem_lancamento ?? 1) + 1;
          continue;
        }
        console.error(`Erro ao gravar fluxo_pagamentos_operacionais: ${insPag.error.message}`);
        process.exit(1);
      }
      if (!inserted) {
        console.error(`Erro ao gravar fluxo_pagamentos_operacionais: conflito repetido para linha ${JSON.stringify(row)}`);
        process.exit(1);
      }
    }
  }

  // 3) Popular cadastro base (atividades + alunos) sem perder dados operacionais
  const modalidades = Array.from(new Set(alunosPayload.map((r) => String(r.modalidade).trim()).filter(Boolean)));
  const { data: atividadesAntes, error: atividadesAntesErr } = await supabase.from('atividades').select('nome');
  if (atividadesAntesErr) {
    console.error(`Erro ao ler atividades existentes: ${atividadesAntesErr.message}`);
    process.exit(1);
  }
  const atividadesExistentes = new Set((atividadesAntes ?? []).map((a: { nome: string }) => norm(a.nome)));
  const novasAtividades = modalidades.filter((m) => !atividadesExistentes.has(norm(m)));
  if (novasAtividades.length > 0) {
    const insAtv = await supabase.from('atividades').insert(novasAtividades.map((nome) => ({ nome })));
    if (insAtv.error) {
      console.error(`Erro ao inserir novas atividades: ${insAtv.error.message}`);
      process.exit(1);
    }
  }

  const { data: atividades, error: atividadesErr } = await supabase.from('atividades').select('id, nome');
  if (atividadesErr) {
    console.error(`Erro ao ler atividades: ${atividadesErr.message}`);
    process.exit(1);
  }

  const atvByName = new Map<string, string>();
  for (const a of (atividades ?? []) as Array<{ id: string; nome: string }>) atvByName.set(norm(a.nome), a.id);

  const { data: planosExistentes, error: planosErr } = await supabase.from('planos').select('atividade_id');
  if (planosErr) {
    console.error(`Erro ao ler planos existentes: ${planosErr.message}`);
    process.exit(1);
  }
  const planosAtividadeIds = new Set((planosExistentes ?? []).map((p: { atividade_id: string }) => p.atividade_id));
  const novosPlanos = Array.from(atvByName.entries())
    .filter(([, atividadeId]) => !planosAtividadeIds.has(atividadeId))
    .map(([, atividadeId]) => ({ atividade_id: atividadeId, nome: 'Mensalidade', valor_mensal: 0 }));
  if (novosPlanos.length > 0) {
    const insPlano = await supabase.from('planos').insert(novosPlanos);
    if (insPlano.error) {
      console.error(`Erro ao inserir novos planos: ${insPlano.error.message}`);
      process.exit(1);
    }
  }

  const { data: alunosBase, error: alunosBaseErr } = await supabase.from('alunos').select('id, nome');
  if (alunosBaseErr) {
    console.error(`Erro ao ler alunos base: ${alunosBaseErr.message}`);
    process.exit(1);
  }
  const alunosExistentes = new Set((alunosBase ?? []).map((a: { nome: string }) => norm(a.nome)));
  const novosAlunos = Array.from(
    new Set(alunosPayload.map((r) => norm(r.aluno_nome)).filter(Boolean))
  ).filter((n) => !alunosExistentes.has(n));

  if (novosAlunos.length > 0) {
    const rowsInsert = novosAlunos.map((nomeNorm) => {
      const original = alunosPayload.find((r) => norm(r.aluno_nome) === nomeNorm)?.aluno_nome ?? nomeNorm;
      return { nome: original };
    });
    const insAl = await supabase.from('alunos').insert(rowsInsert);
    if (insAl.error) {
      console.error(`Erro ao inserir novos alunos base: ${insAl.error.message}`);
      process.exit(1);
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        ano,
        linhasAlunosMigradas: alunosPayload.length,
        pagamentosMigrados: pagamentosInseridos,
        pagamentosOrdemReajustada,
        abasConsideradas: abas.filter((a) => isEligibleSheet(a)).length,
        errosPagamentos,
        avisosPagamentos,
        avisosDatasCorrigidas: avisosDatasCorrigidas.slice(0, 100),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
