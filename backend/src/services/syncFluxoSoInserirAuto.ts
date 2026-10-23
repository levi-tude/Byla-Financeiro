/**
 * Sync automático do Fluxo — SÓ INSERE (chamado pelo Apps Script via webhook).
 *
 * Regra absoluta: apenas INSERT. Nunca UPDATE / DELETE / upsert, nunca inativa aluno,
 * nunca mexe em vínculos. Se o plano tiver QUALQUER conflito, nada é gravado.
 *
 * Reaproveita o plano de `logic/syncFluxoSoInserirPlan.ts` (mesma lógica do script
 * `scripts/syncFluxoSoInserir.ts`). Dependências de I/O são injetadas para teste.
 */
import { normFluxoImport } from '../logic/fluxoPlanilhaImport.js';
import type { PagamentoDesiredIncremental } from '../logic/syncFluxoIncrementalPlan.js';
import {
  chaveAluno,
  colisoesSemEspaco,
  normNome,
  normNomeAluno,
  planAlunosSoInserir,
  planPagamentosSoInserir,
} from '../logic/syncFluxoSoInserirPlan.js';

type Row = Record<string, unknown>;

export type AlunoPlanilha = {
  aba: string;
  modalidade: string;
  aluno_nome: string;
  linha_planilha: number;
} & Row;

export type Contagens = {
  alunos: number;
  pagamentos: number;
  vinculos: number;
  pagamentosComVinculo: number;
};

export type LeituraPlanilha = {
  ano: number;
  abas: string[];
  alunosPlanilha: AlunoPlanilha[];
  desiredPags: PagamentoDesiredIncremental[];
  /** Abas que falharam na leitura (bloqueia). */
  errosLeitura: string[];
  /** Lançamentos descartados no parse (bloqueia: pode ser pagamento perdido). */
  errosParse: number;
  datasCorrigidas: number;
};

export type LeituraBanco = { existAlunos: Row[]; existPags: Row[] };

export type SyncDeps = {
  lerPlanilha(): Promise<LeituraPlanilha>;
  lerBanco(): Promise<LeituraBanco>;
  contar(): Promise<Contagens>;
  /** Somente INSERT. Retorna mensagem de erro ou null. */
  inserirAluno(row: Row): Promise<string | null>;
  inserirPagamento(row: Row): Promise<string | null>;
  /** Opcional: grava a execução em tabela de log (só se existir). */
  registrarExecucao?(r: SyncResumo): Promise<void>;
  /** Opcional: aviso para o Levi (ex.: webhook n8n). */
  notificar?(r: SyncResumo): Promise<void>;
  log?(level: 'info' | 'warn' | 'error', data: Row): void;
};

export type Conflito = { tipo: string; quantidade: number; detalhe?: unknown };

export type SyncResumo = {
  ok: boolean;
  status: 'inserido' | 'nada_a_inserir' | 'bloqueado_conflito' | 'erro' | 'ocupado';
  iniciadoEm: string;
  finalizadoEm: string;
  ano?: number;
  abas?: string[];
  contagens?: { antes: Contagens; depois: Contagens };
  inseridos?: { alunos: number; pagamentos: number };
  previstos?: { alunos: number; pagamentos: number };
  pagamentosDuplicadosPulados?: number;
  conflitos: Conflito[];
  avisos: string[];
  erros: string[];
};

const CAMPOS_INTERNOS = new Set(['secao', 'raw_row', 'origem']);
export function sanitizeAluno(r: Row): Row {
  const out = Object.fromEntries(
    Object.entries(r).filter(([k]) => !k.startsWith('_') && !CAMPOS_INTERNOS.has(k)),
  );
  out.origem = 'migracao_planilha';
  if (out.pendencia_campos_ignorados == null) out.pendencia_campos_ignorados = [];
  if (out.cobranca_tentativas == null) out.cobranca_tentativas = [];
  return out;
}

/** Plano puro (sem I/O). Mesma lógica do script, mais detecção de conflitos que bloqueiam. */
export function planejarSoInserir(p: LeituraPlanilha & LeituraBanco) {
  const conflitos: Conflito[] = [];
  const avisos: string[] = [];
  const { existAlunos, existPags, alunosPlanilha, desiredPags } = p;

  if (p.errosLeitura.length)
    conflitos.push({ tipo: 'falha_leitura_aba', quantidade: p.errosLeitura.length, detalhe: p.errosLeitura });
  if (p.errosParse > 0) conflitos.push({ tipo: 'lancamento_data_invalida', quantidade: p.errosParse });
  if (p.datasCorrigidas > 0) avisos.push(`${p.datasCorrigidas} datas corrigidas no parse`);

  // Nome duplicado na própria planilha (mesma aba+modalidade+nome em linhas diferentes) entre os NOVOS.
  const existentesKeys = new Set(
    existAlunos.map((a) =>
      chaveAluno({ aba: String(a.aba ?? ''), modalidade: String(a.modalidade ?? ''), aluno_nome: String(a.aluno_nome ?? '') }),
    ),
  );
  const contNovos = new Map<string, number>();
  for (const a of alunosPlanilha) {
    const k = chaveAluno(a);
    if (existentesKeys.has(k)) continue;
    contNovos.set(k, (contNovos.get(k) ?? 0) + 1);
  }
  const dupNovos = [...contNovos.entries()].filter(([, n]) => n > 1).map(([k]) => k);
  if (dupNovos.length) conflitos.push({ tipo: 'nome_duplicado_planilha', quantidade: dupNovos.length });

  const alunosPlan = planAlunosSoInserir(
    alunosPlanilha,
    existAlunos.map((a) => ({
      aba: String(a.aba ?? ''),
      modalidade: String(a.modalidade ?? ''),
      aluno_nome: String(a.aluno_nome ?? ''),
    })),
  );
  const linhasOcupadas = new Set(existAlunos.map((a) => `${normFluxoImport(a.aba)}::${Number(a.linha_planilha)}`));
  const alunosInserir: AlunoPlanilha[] = [];
  const alunosConflitoLinha: AlunoPlanilha[] = [];
  for (const a of alunosPlan.inserts) {
    const k = `${normFluxoImport(a.aba)}::${a.linha_planilha}`;
    if (linhasOcupadas.has(k)) alunosConflitoLinha.push(a);
    else {
      linhasOcupadas.add(k);
      alunosInserir.push(a);
    }
  }
  if (alunosConflitoLinha.length)
    conflitos.push({ tipo: 'aluno_novo_linha_ocupada', quantidade: alunosConflitoLinha.length });

  const pagPlan = planPagamentosSoInserir(
    desiredPags,
    existPags.map((x) => ({
      aluno_nome: String(x.aluno_nome ?? ''),
      modalidade: String(x.modalidade ?? ''),
      data_pagamento: String(x.data_pagamento ?? '').slice(0, 10),
      valor: Number(x.valor) || 0,
      mes_competencia: Number(x.mes_competencia) || 0,
      ano_competencia: Number(x.ano_competencia) || 0,
    })),
  );

  const chaveAl = (aba: unknown, mod: unknown, nome: unknown) =>
    [normNome(aba), normNome(mod), normNomeAluno(nome)].join('|');
  const linhaBanco = new Map<string, { linha: number; nome: string }>();
  for (const a of existAlunos)
    linhaBanco.set(chaveAl(a.aba, a.modalidade, a.aluno_nome), {
      linha: Number(a.linha_planilha),
      nome: String(a.aluno_nome),
    });
  for (const a of alunosInserir)
    linhaBanco.set(chaveAl(a.aba, a.modalidade, a.aluno_nome), { linha: a.linha_planilha, nome: a.aluno_nome });

  let semAluno = 0;
  let remapeados = 0;
  const comLinha: PagamentoDesiredIncremental[] = [];
  for (const x of pagPlan.inserts) {
    const alvo = linhaBanco.get(chaveAl(x.aba, x.modalidade, x.aluno_nome));
    if (alvo == null) {
      semAluno += 1;
      continue;
    }
    if (alvo.linha !== x.linha_planilha) remapeados += 1;
    comLinha.push({ ...x, linha_planilha: alvo.linha, aluno_nome: alvo.nome });
  }
  if (semAluno) conflitos.push({ tipo: 'pagamento_sem_aluno', quantidade: semAluno });
  if (remapeados) avisos.push(`${remapeados} pagamento(s) novo(s) usam a linha do aluno no banco`);

  const maxOrdem = new Map<string, number>();
  for (const x of existPags) {
    const k = `${x.aba}::${Number(x.linha_planilha)}`;
    maxOrdem.set(k, Math.max(maxOrdem.get(k) ?? 0, Number(x.ordem_lancamento) || 0));
  }
  const pagsInserir: Row[] = comLinha.map((x) => {
    const k = `${x.aba}::${x.linha_planilha}`;
    const ordem = (maxOrdem.get(k) ?? 0) + 1;
    maxOrdem.set(k, ordem);
    return {
      aba: x.aba,
      modalidade: x.modalidade,
      linha_planilha: x.linha_planilha,
      ordem_lancamento: ordem,
      aluno_nome: x.aluno_nome,
      data_pagamento: x.data_pagamento,
      forma: x.forma,
      valor: x.valor,
      mes_competencia: x.mes_competencia,
      ano_competencia: x.ano_competencia,
      responsaveis: x.responsaveis ?? null,
      pagador_pix: x.pagador_pix ?? null,
      raw_pagamento: x.raw_pagamento ?? {},
      origem: 'migracao_planilha',
    };
  });

  const colisoes = colisoesSemEspaco([
    ...existAlunos.map((a) => ({ aba: String(a.aba ?? ''), aluno_nome: String(a.aluno_nome ?? '') })),
    ...alunosPlanilha.map((a) => ({ aba: a.aba, aluno_nome: a.aluno_nome })),
  ]);
  if (colisoes.length) conflitos.push({ tipo: 'nome_ambiguo_sem_espaco', quantidade: colisoes.length });

  return {
    alunosInserir,
    pagsInserir,
    duplicados: pagPlan.duplicados,
    conflitos,
    avisos,
  };
}

let rodando = false;
/** Só para testes. */
export function __resetLock() {
  rodando = false;
}

/**
 * Executa o sync com trava (uma execução por vez neste processo).
 * Idempotente: deduplicação por conteúdo → rodar de novo sem mudança na planilha insere 0.
 */
export async function executarSyncSoInserir(deps: SyncDeps): Promise<SyncResumo> {
  const iniciadoEm = new Date().toISOString();
  const log = deps.log ?? (() => {});
  if (rodando) {
    return {
      ok: false,
      status: 'ocupado',
      iniciadoEm,
      finalizadoEm: new Date().toISOString(),
      conflitos: [],
      avisos: ['Já existe um sync em andamento; esta chamada foi ignorada.'],
      erros: [],
    };
  }
  rodando = true;
  let resumo: SyncResumo;
  try {
    resumo = await rodar(deps, iniciadoEm);
  } catch (e) {
    resumo = {
      ok: false,
      status: 'erro',
      iniciadoEm,
      finalizadoEm: new Date().toISOString(),
      conflitos: [],
      avisos: [],
      erros: [e instanceof Error ? e.message : String(e)],
    };
  } finally {
    rodando = false;
  }
  // Log sem PII (só contagens / tipos).
  log(resumo.ok ? 'info' : 'warn', { msg: 'sync_fluxo_so_inserir', ...resumo });
  if (deps.registrarExecucao) {
    try {
      await deps.registrarExecucao(resumo);
    } catch (e) {
      log('warn', { msg: 'sync_fluxo_so_inserir: falha ao registrar execução', erro: String(e) });
    }
  }
  if (deps.notificar && resumo.status !== 'nada_a_inserir') {
    try {
      await deps.notificar(resumo);
    } catch (e) {
      log('warn', { msg: 'sync_fluxo_so_inserir: falha ao notificar', erro: String(e) });
    }
  }
  return resumo;
}

async function rodar(deps: SyncDeps, iniciadoEm: string): Promise<SyncResumo> {
  const antes = await deps.contar();
  const planilha = await deps.lerPlanilha();
  const banco = await deps.lerBanco();
  const plan = planejarSoInserir({ ...planilha, ...banco });
  const base = {
    iniciadoEm,
    ano: planilha.ano,
    abas: planilha.abas,
    previstos: { alunos: plan.alunosInserir.length, pagamentos: plan.pagsInserir.length },
    pagamentosDuplicadosPulados: plan.duplicados,
    conflitos: plan.conflitos,
    avisos: plan.avisos,
  };

  if (plan.conflitos.length > 0) {
    return {
      ...base,
      ok: false,
      status: 'bloqueado_conflito',
      finalizadoEm: new Date().toISOString(),
      contagens: { antes, depois: antes },
      inseridos: { alunos: 0, pagamentos: 0 },
      erros: [],
    };
  }
  if (plan.alunosInserir.length === 0 && plan.pagsInserir.length === 0) {
    return {
      ...base,
      ok: true,
      status: 'nada_a_inserir',
      finalizadoEm: new Date().toISOString(),
      contagens: { antes, depois: antes },
      inseridos: { alunos: 0, pagamentos: 0 },
      erros: [],
    };
  }

  const erros: string[] = [];
  let alunos = 0;
  let pagamentos = 0;
  for (const a of plan.alunosInserir) {
    const err = await deps.inserirAluno(sanitizeAluno(a));
    if (err) erros.push(`insert aluno (${a.aba} linha ${a.linha_planilha}): ${err}`);
    else alunos += 1;
  }
  for (const row of plan.pagsInserir) {
    const err = await deps.inserirPagamento(row);
    if (err) erros.push(`insert pagamento (${row.aba} ${row.data_pagamento}): ${err}`);
    else pagamentos += 1;
  }
  const depois = await deps.contar();
  if (depois.pagamentosComVinculo !== antes.pagamentosComVinculo || depois.vinculos !== antes.vinculos)
    erros.push(`ALERTA: vínculos mudaram (${antes.vinculos} → ${depois.vinculos})`);
  if (depois.alunos < antes.alunos || depois.pagamentos < antes.pagamentos)
    erros.push('ALERTA: contagem diminuiu durante o sync (algo externo apagou registros?)');

  return {
    ...base,
    ok: erros.length === 0,
    status: erros.length ? 'erro' : 'inserido',
    finalizadoEm: new Date().toISOString(),
    contagens: { antes, depois },
    inseridos: { alunos, pagamentos },
    erros,
  };
}
