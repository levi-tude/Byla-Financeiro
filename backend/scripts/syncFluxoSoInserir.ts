/**
 * Sync do Fluxo que SÓ INSERE (sem UPDATE, DELETE ou upsert).
 *
 *   npm run sync:fluxo-so-inserir -- 2026                       # dry-run (padrão)
 *   CONFIRM_SO_INSERIR=sim npm run sync:fluxo-so-inserir -- 2026 --apply
 *   opções: --abas="ABA1,ABA2"  --relatorio=/caminho/fora/do/repo.json
 *
 * Regras:
 * - Insere apenas alunos novos e pagamentos novos (inclusive de alunos já existentes).
 * - Nunca inativa aluno, nunca mexe em vínculos, overlay permanente ou confirmações do extrato.
 * - Ignora o bloco de inativos (e Programa de Bolsas) da planilha.
 * - Duplicata pelo conteúdo: aluno (nome normalizado) + modalidade + data + valor + competência.
 * - Relatório JSON local (pode conter nomes): mantenha FORA do repositório.
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import type { SupabaseClient } from '@supabase/supabase-js';
import { PlanilhaAlunosAdapter } from '../src/adapters/PlanilhaAlunosAdapter.js';
import { isEligibleSheet } from '../src/businessRules.js';
import {
  buildAlunosFromPlanilhaRows,
  buildPagamentosDesiredFromAba,
  canonicalSheetName,
  normFluxoImport,
  parseAbasArg,
} from '../src/logic/fluxoPlanilhaImport.js';
import { isModalidadeProgramaBolsas } from '../src/logic/programaBolsasMap.js';
import { fluxoUuidFromAnyPlanilhaId } from '../src/logic/fluxoPagamentoFingerprint.js';
import type { PagamentoDesiredIncremental } from '../src/logic/syncFluxoIncrementalPlan.js';
import {
  planAlunosSoInserir,
  normNome,
  planPagamentosSoInserir,
} from '../src/logic/syncFluxoSoInserirPlan.js';
import { lerPagamentosPorAbaEAno } from '../src/services/planilhaPagamentos.js';
import { getSupabase } from '../src/services/supabaseClient.js';

const T_ALUNOS = 'fluxo_alunos_operacionais';
const T_PAGS = 'fluxo_pagamentos_operacionais';
const T_VINC = 'validacao_pagamentos_vinculos';

type Row = Record<string, unknown>;

async function fetchAll(supabase: SupabaseClient, table: string, select: string): Promise<Row[]> {
  const PAGE = 1000;
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const rows = (data ?? []) as unknown as Row[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

async function contar(supabase: SupabaseClient) {
  const alunos = await fetchAll(supabase, T_ALUNOS, 'id');
  const pags = await fetchAll(supabase, T_PAGS, 'id');
  const vinc = await fetchAll(supabase, T_VINC, 'id, planilha_id');
  const pagIds = new Set(pags.map((p) => String(p.id)));
  const comVinculo = new Set<string>();
  for (const v of vinc) {
    const uuid = fluxoUuidFromAnyPlanilhaId(String(v.planilha_id ?? ''));
    if (uuid && pagIds.has(uuid)) comVinculo.add(uuid);
  }
  return {
    alunos: alunos.length,
    pagamentos: pags.length,
    vinculos: vinc.length,
    pagamentosComVinculo: comVinculo.size,
  };
}

function abaNoFiltro(aba: string, filtro?: string[]): boolean {
  if (!filtro || filtro.length === 0) return true;
  const n = normFluxoImport(aba);
  return filtro.some((f) => normFluxoImport(canonicalSheetName(f)) === n);
}

const CAMPOS_INTERNOS = new Set(['secao', 'raw_row', 'origem']);
function sanitizeAluno(r: Row): Row {
  const out = Object.fromEntries(
    Object.entries(r).filter(([k]) => !k.startsWith('_') && !CAMPOS_INTERNOS.has(k)),
  );
  out.origem = 'migracao_planilha';
  if (out.pendencia_campos_ignorados == null) out.pendencia_campos_ignorados = [];
  if (out.cobranca_tentativas == null) out.cobranca_tentativas = [];
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const ano = Number(args.find((a) => /^\d{4}$/.test(a)) ?? new Date().getFullYear());
  const abasFlag = args.find((a) => a.startsWith('--abas='));
  const filtro = parseAbasArg(abasFlag ? abasFlag.slice('--abas='.length) : undefined)?.map(
    canonicalSheetName,
  );
  const querApply = args.includes('--apply');
  const confirmado = process.env.CONFIRM_SO_INSERIR === 'sim';
  const apply = querApply && confirmado;
  const relFlag = args.find((a) => a.startsWith('--relatorio='));
  const relatorio =
    relFlag?.slice('--relatorio='.length) ??
    (apply ? '/workspace/byla/so-inserir-apply.json' : '/workspace/byla/so-inserir-dryrun.json');

  if (querApply && !confirmado) {
    console.error('--apply exige CONFIRM_SO_INSERIR=sim. Rodando como DRY-RUN.');
  }
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase não configurado (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).');

  const antes = await contar(supabase);
  const avisos: string[] = [];
  const erros: string[] = [];

  // ---- Planilha: alunos ativos (ignora inativos e Programa de Bolsas) ----
  const planilha = new PlanilhaAlunosAdapter();
  const all = await planilha.listarTodasAbas();
  if (all.error) throw new Error(`planilha: ${all.error}`);
  const abas = Array.from(
    new Set(
      (all.abas ?? [])
        .map((a) => canonicalSheetName(a))
        .filter((a) => a && isEligibleSheet(a) && abaNoFiltro(a, filtro)),
    ),
  );
  const alunosPlanilha = buildAlunosFromPlanilhaRows(all.rows as Row[])
    .filter((a) => abaNoFiltro(a.aba, filtro))
    .filter((a) => a.secao !== 'inativo' && a.ativo)
    .filter((a) => a.secao !== 'bolsas' && !isModalidadeProgramaBolsas(a.modalidade));

  // ---- Planilha: pagamentos (lerPagamentosPorAbaEAno já pula inativos e bolsas) ----
  const desiredPags: PagamentoDesiredIncremental[] = [];
  const errosParse: string[] = [];
  const avisosDatas: string[] = [];
  for (const aba of abas) {
    const res = await lerPagamentosPorAbaEAno(aba, ano);
    if (res.error) {
      erros.push(`${aba}: falha ao ler pagamentos`);
      continue;
    }
    desiredPags.push(
      ...buildPagamentosDesiredFromAba({
        aba,
        alunos: res.alunos,
        erros: errosParse,
        avisosDatasCorrigidas: avisosDatas,
      }),
    );
  }
  if (errosParse.length) avisos.push(`${errosParse.length} lançamentos com data inválida descartados no parse`);
  if (avisosDatas.length) avisos.push(`${avisosDatas.length} datas corrigidas no parse`);

  // ---- Banco (todas as origens, todos os anos: dedup por conteúdo) ----
  const existAlunos = await fetchAll(supabase, T_ALUNOS, 'id, aba, modalidade, aluno_nome, linha_planilha');
  const existPags = await fetchAll(
    supabase,
    T_PAGS,
    'id, aba, modalidade, linha_planilha, ordem_lancamento, aluno_nome, data_pagamento, valor, mes_competencia, ano_competencia',
  );

  const alunosPlan = planAlunosSoInserir(
    alunosPlanilha,
    existAlunos.map((a) => ({
      aba: String(a.aba ?? ''),
      modalidade: String(a.modalidade ?? ''),
      aluno_nome: String(a.aluno_nome ?? ''),
    })),
  );
  const linhasOcupadas = new Set(existAlunos.map((a) => `${normFluxoImport(a.aba)}::${Number(a.linha_planilha)}`));
  const alunosInserir = [];
  const alunosConflitoLinha = [];
  for (const a of alunosPlan.inserts) {
    const k = `${normFluxoImport(a.aba)}::${a.linha_planilha}`;
    if (linhasOcupadas.has(k)) alunosConflitoLinha.push(a);
    else {
      linhasOcupadas.add(k);
      alunosInserir.push(a);
    }
  }
  if (alunosConflitoLinha.length) {
    avisos.push(
      `${alunosConflitoLinha.length} aluno(s) novo(s) não inseridos: (aba, linha) já ocupada no banco — revisar manualmente`,
    );
  }

  const pagPlan = planPagamentosSoInserir(
    desiredPags,
    existPags.map((p) => ({
      aluno_nome: String(p.aluno_nome ?? ''),
      modalidade: String(p.modalidade ?? ''),
      data_pagamento: String(p.data_pagamento ?? '').slice(0, 10),
      valor: Number(p.valor) || 0,
      mes_competencia: Number(p.mes_competencia) || 0,
      ano_competencia: Number(p.ano_competencia) || 0,
    })),
  );

  // A linha da planilha pode ter mudado: o pagamento herda a linha do aluno no BANCO
  // (casado por aba + modalidade + nome). Pagamento de aluno novo em conflito de linha é pulado.
  const chaveAl = (aba: unknown, mod: unknown, nome: unknown) =>
    [normNome(aba), normNome(mod), normNome(nome)].join('|');
  const linhaBanco = new Map<string, number>();
  for (const a of existAlunos) linhaBanco.set(chaveAl(a.aba, a.modalidade, a.aluno_nome), Number(a.linha_planilha));
  for (const a of alunosInserir) linhaBanco.set(chaveAl(a.aba, a.modalidade, a.aluno_nome), a.linha_planilha);
  const pagsSemAluno: typeof pagPlan.inserts = [];
  const pagsComLinha: typeof pagPlan.inserts = [];
  let pagsLinhaRemapeada = 0;
  for (const p of pagPlan.inserts) {
    const linha = linhaBanco.get(chaveAl(p.aba, p.modalidade, p.aluno_nome));
    if (linha == null) {
      pagsSemAluno.push(p);
      continue;
    }
    if (linha !== p.linha_planilha) pagsLinhaRemapeada += 1;
    pagsComLinha.push({ ...p, linha_planilha: linha });
  }
  if (pagsSemAluno.length) {
    avisos.push(
      `${pagsSemAluno.length} pagamento(s) novo(s) pulados: aluno não existe no banco nem pode ser inserido (conflito de linha)`,
    );
  }
  if (pagsLinhaRemapeada) {
    avisos.push(`${pagsLinhaRemapeada} pagamento(s) novo(s) usam a linha do aluno no banco (linha da planilha mudou)`);
  }

  // ordem_lancamento livre por (aba, linha) para não bater no UNIQUE.
  const maxOrdem = new Map<string, number>();
  for (const p of existPags) {
    const k = `${p.aba}::${Number(p.linha_planilha)}`;
    maxOrdem.set(k, Math.max(maxOrdem.get(k) ?? 0, Number(p.ordem_lancamento) || 0));
  }
  const pagsInserir = pagsComLinha.map((p) => {
    const k = `${p.aba}::${p.linha_planilha}`;
    const ordem = (maxOrdem.get(k) ?? 0) + 1;
    maxOrdem.set(k, ordem);
    return {
      aba: p.aba,
      modalidade: p.modalidade,
      linha_planilha: p.linha_planilha,
      ordem_lancamento: ordem,
      aluno_nome: p.aluno_nome,
      data_pagamento: p.data_pagamento,
      forma: p.forma,
      valor: p.valor,
      mes_competencia: p.mes_competencia,
      ano_competencia: p.ano_competencia,
      responsaveis: p.responsaveis ?? null,
      pagador_pix: p.pagador_pix ?? null,
      raw_pagamento: p.raw_pagamento ?? {},
      origem: 'migracao_planilha',
    };
  });

  const porModalidade: Record<string, number> = {};
  for (const p of pagsInserir) {
    const k = `${p.aba} / ${p.modalidade}`;
    porModalidade[k] = (porModalidade[k] ?? 0) + 1;
  }

  // ---- Gravação (só INSERT) ----
  let alunosInseridos = 0;
  let pagsInseridos = 0;
  if (apply) {
    for (const a of alunosInserir) {
      const { error } = await supabase.from(T_ALUNOS).insert(sanitizeAluno(a as unknown as Row));
      if (error) erros.push(`insert aluno (${a.aba} linha ${a.linha_planilha}): ${error.message}`);
      else alunosInseridos += 1;
    }
    for (const row of pagsInserir) {
      const { error } = await supabase.from(T_PAGS).insert(row);
      if (error) erros.push(`insert pagamento (${row.aba} ${row.data_pagamento}): ${error.message}`);
      else pagsInseridos += 1;
    }
  }

  const depois = apply
    ? await contar(supabase)
    : {
        alunos: antes.alunos + alunosInserir.length,
        pagamentos: antes.pagamentos + pagsInserir.length,
        vinculos: antes.vinculos,
        pagamentosComVinculo: antes.pagamentosComVinculo,
      };
  if (depois.pagamentosComVinculo !== antes.pagamentosComVinculo) {
    erros.push(
      `ALERTA: pagamentos com vínculo mudaram (${antes.pagamentosComVinculo} → ${depois.pagamentosComVinculo})`,
    );
  }

  const report = {
    geradoEm: new Date().toISOString(),
    modo: apply ? 'apply' : 'dry-run',
    ano,
    abas,
    contagens: { antes, depois, depoisEhPrevisao: !apply },
    resumo: {
      alunosNovos: alunosInserir.length,
      alunosNovosConflitoLinha: alunosConflitoLinha.length,
      alunosJaExistentes: alunosPlan.existentes,
      pagamentosPlanilha: desiredPags.length,
      pagamentosDuplicadosPulados: pagPlan.duplicados,
      pagamentosNovos: pagsInserir.length,
      pagamentosNovosPuladosSemAluno: pagsSemAluno.length,
      pagamentosNovosComLinhaDoBanco: pagsLinhaRemapeada,
      pagamentosNovosPorModalidade: porModalidade,
      ...(apply ? { alunosInseridos, pagsInseridos } : {}),
    },
    alunosAInserir: alunosInserir.map((a) => ({
      aba: a.aba,
      modalidade: a.modalidade,
      linha_planilha: a.linha_planilha,
      aluno_nome: a.aluno_nome,
    })),
    alunosConflitoLinha: alunosConflitoLinha.map((a) => ({
      aba: a.aba,
      modalidade: a.modalidade,
      linha_planilha: a.linha_planilha,
      aluno_nome: a.aluno_nome,
    })),
    pagamentosPuladosSemAluno: pagsSemAluno.map(({ raw_pagamento: _r, ...rest }) => rest),
    pagamentosAInserir: pagsInserir.map(({ raw_pagamento: _r, ...rest }) => rest),
    avisos,
    erros,
  };
  fs.mkdirSync(path.dirname(relatorio), { recursive: true });
  fs.writeFileSync(relatorio, JSON.stringify(report, null, 2));

  // Console sem PII: só contagens.
  console.log(JSON.stringify({ modo: report.modo, ano, contagens: report.contagens, resumo: report.resumo, avisos, erros: erros.length }, null, 2));
  console.log(`Relatório: ${relatorio}`);
  if (erros.length) process.exit(2);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
