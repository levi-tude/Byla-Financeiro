/** Qualidade dos dados no Consulta Byla (cobertura do extrato, PII, sem dados, repasse, alunos ativos). Nomes fictícios. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  executeConsultaTool,
  formatAlunosPorModalidade,
  formatBalancoMeses,
  formatCompararMeses,
  periodoExtratoDaTool,
  textoCoberturaExtrato,
  type CoberturaLoader,
} from '../services/consultaBylaTools.js';
import { garantirCoberturaExtrato, runConsultaAgent, stripPii } from './consultaGeminiAgent.js';
import { limparDocumentoPessoa, Pseudonimizador } from './pseudonimizacao.js';
import { gerarConsultaReply } from '../services/consultaBylaService.js';
import { filtrarTransacoesOficiais, type TransacaoBase } from '../services/transacoesFiltro.js';
import { businessRules } from '../businessRules.js';
import { GROQ_MODELS } from './llmProviders.js';
import type { ConsultaToolId } from './consultaCatalog.js';

const ctxOut = { mes: 10, ano: 2026 };
const semDadosLoader: CoberturaLoader = async () => ({ ultimaNoPeriodo: null, ultimaGeral: '2026-10-21' });

// ---------- 1) cobertura do extrato ----------
test('1: cobertura informa "dados do extrato até" e avisa mês incompleto', () => {
  const t = textoCoberturaExtrato('2026-10-01', '2026-10-31', { ultimaNoPeriodo: '2026-10-21', ultimaGeral: '2026-10-21' });
  assert.match(t, /Dados do extrato até 21\/10\/2026\./);
  assert.match(t, /período incompleto/);
  const fechado = textoCoberturaExtrato('2026-09-01', '2026-09-30', { ultimaNoPeriodo: '2026-09-29', ultimaGeral: '2026-10-21' });
  assert.match(fechado, /até 29\/09\/2026/);
  assert.doesNotMatch(fechado, /incompleto/);
});

test('1: tools do extrato têm período; tools do Fluxo não', () => {
  assert.deepEqual(periodoExtratoDaTool('resumo_mes', {}, ctxOut), { inicio: '2026-10-01', fim: '2026-10-31', exclusivo: true });
  assert.equal(periodoExtratoDaTool('balanco_meses', { meses: '4' }, ctxOut)?.inicio, '2026-07-01');
  assert.equal(periodoExtratoDaTool('comparar_meses', { mes_a: '2026-10', mes_b: '2026-09' }, ctxOut)?.inicio, '2026-09-01');
  assert.equal(periodoExtratoDaTool('resumo_modalidades', {}, ctxOut), null);
  assert.equal(periodoExtratoDaTool('alunos_por_modalidade', {}, ctxOut), null);
});

test('1: IA que esquece a data recebe a linha de cobertura anexada', () => {
  const fatos = ['Resumo...\nDados do extrato até 21/10/2026. ATENÇÃO: período incompleto — o extrato só foi importado até 21/10/2026; x.'];
  const out = garantirCoberturaExtrato('Entradas R$ 100,00.', fatos);
  assert.match(out, /até 21\/10\/2026/);
  assert.match(out, /incompleto/);
  const ok = 'Entradas R$ 100,00 (dados do extrato até 21/10/2026, mês incompleto).';
  assert.equal(garantirCoberturaExtrato(ok, fatos), ok);
});

// ---------- 3) sem dados ≠ R$ 0,00 ----------
test('3: período sem lançamento → "sem dados", sem R$ 0,00 (tool)', async () => {
  for (const [tool, params] of [
    ['resumo_mes', {}],
    ['resumo_semana', { data_ref: '2026-10-28' }],
    ['movimentos_banco_dia', { data: '2026-10-28' }],
    ['balanco_meses', { meses: '2' }],
  ] as Array<[ConsultaToolId, Record<string, string>]>) {
    const r = await executeConsultaTool(tool, params, { mes: 11, ano: 2026 }, { cobertura: semDadosLoader });
    assert.ok(r.ok, tool);
    if (r.ok) {
      assert.match(r.factsText, /Sem dados do extrato para esse período/, tool);
      assert.match(r.factsText, /21\/10\/2026/);
      assert.doesNotMatch(r.factsText, /0,00/, tool);
    }
  }
});

test('3: balanço e comparação marcam mês vazio como "sem dados"', () => {
  const b = formatBalancoMeses([{ mes: 10, ano: 2026 }, { mes: 11, ano: 2026 }], [{ entradas: 100, saidas: 40 }, null]);
  assert.match(b, /11\/2026: sem dados no extrato/);
  assert.doesNotMatch(b, /11\/2026: entradas R\$\s*0,00/);
  const c = formatCompararMeses({ mes: 10, ano: 2026 }, { mes: 11, ano: 2026 }, { entradas: 100, saidas: 40 }, null);
  assert.match(c, /Sem dados no extrato para 11\/2026/);
  assert.doesNotMatch(c, /R\$\s*0,00/);
});

test('3: fallback (sem IA) responde sem dados, nunca R$ 0,00', async () => {
  const executeTool = (tool: ConsultaToolId, params: Record<string, string>, ctx: { mes: number; ano: number }) =>
    executeConsultaTool(tool, params, ctx, { cobertura: semDadosLoader });
  const r = await gerarConsultaReply({ message: 'Resumo do mês', context: { monthYear: '11/2026' } }, { apiKey: '', executeTool });
  assert.equal(r.providerUsed, 'deterministic');
  assert.match(r.message, /Sem dados do extrato para esse período/);
  assert.doesNotMatch(r.message, /0,00/);
});

test('3: IA que responde R$ 0,00 para período vazio é corrigida', async () => {
  let n = 0;
  const fetchImpl = (async () => {
    n++;
    const msg =
      n === 1
        ? { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'resumo_mes', arguments: '{"mes":11,"ano":2026}' } }] }
        : { content: 'Em novembro entraram R$ 0,00.' };
    return new Response(JSON.stringify({ choices: [{ message: msg }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
  const r = await runConsultaAgent('quanto entrou em novembro?', [], { mes: 11, ano: 2026 }, {
    providers: [{ provider: 'groq', apiKey: 'fake', models: GROQ_MODELS }],
    fetchImpl,
    today: '2026-10-30',
    executeTool: (tool, params, ctx) => executeConsultaTool(tool, params, ctx, { cobertura: semDadosLoader }),
  });
  assert.ok(r.ok);
  if (r.ok) {
    assert.match(r.text, /Sem dados para esse período/);
    assert.doesNotMatch(r.text, /0,00/);
  }
});

// ---------- 2) documento colado ao nome ----------
test('2: limparDocumentoPessoa remove CPF/CNPJ completos, parciais e mascarados do campo pessoa', () => {
  assert.equal(limparDocumentoPessoa('FULANO DE TAL 123.456.789-00'), 'FULANO DE TAL');
  assert.equal(limparDocumentoPessoa('***.456.789-** FULANA FICTICIA'), 'FULANA FICTICIA');
  assert.equal(limparDocumentoPessoa('BELTRANO FICTICIO12345678'), 'BELTRANO FICTICIO');
  assert.equal(limparDocumentoPessoa('EMPRESA DEMO LTDA 12.345.678/0001-90'), 'EMPRESA DEMO LTDA');
  assert.equal(limparDocumentoPessoa('CICRANO DEMO - 4567'), 'CICRANO DEMO');
  assert.equal(limparDocumentoPessoa('Nome Sem Documento'), 'Nome Sem Documento');
});

test('2: stripPii remove documento colado ao nome mas preserva valores e datas', () => {
  const t = stripPii('PIX de FULANO DEMO12345678 e ***.456.789-** BELTRANO; CNPJ 12.345.678/0001-90. R$ 2.500,00 em 05/10/2026 e 2026-10-05.');
  assert.doesNotMatch(t, /12345678|456\.789|0001-90/);
  assert.match(t, /R\$ 2\.500,00/);
  assert.match(t, /05\/10\/2026/);
  assert.match(t, /2026-10-05/);
});

test('2: nome limpo é pseudonimizado e o documento não chega ao LLM nem à resposta', async () => {
  const pessoaBanco = 'PAGADOR FICTICIO 98765432100';
  const nomes = [{ nome: limparDocumentoPessoa(pessoaBanco), tipo: 'pessoa' as const }];
  const p = new Pseudonimizador(nomes);
  assert.match(p.ocultar(stripPii(`PIX ${pessoaBanco}`)), /^PIX Pessoa 1 \[(cpf|doc) omitido\]$/);
  const payloads: string[] = [];
  let n = 0;
  const fetchImpl = (async (_u: string, init: RequestInit) => {
    payloads.push(String(init.body));
    n++;
    const msg =
      n === 1
        ? { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'movimentos_banco_dia', arguments: '{"data":"2026-10-05"}' } }] }
        : { content: 'Pessoa 1 enviou R$ 2.500,00 (dados do extrato até 05/10/2026).' };
    return new Response(JSON.stringify({ choices: [{ message: msg }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
  const r = await runConsultaAgent('movimentos do banco em 2026-10-05', [], ctxOut, {
    providers: [{ provider: 'groq', apiKey: 'fake', models: GROQ_MODELS }],
    fetchImpl,
    today: '2026-10-30',
    nomesConhecidos: nomes,
    executeTool: async (tool) => ({ ok: true, tool, factsText: `${pessoaBanco} — R$ 2.500,00 (entrada)\nDados do extrato até 05/10/2026.` }),
  });
  for (const pl of payloads) {
    assert.doesNotMatch(pl, /98765432100/);
    assert.doesNotMatch(pl, /PAGADOR FICTICIO/);
  }
  assert.ok(r.ok);
  if (r.ok) {
    assert.match(r.text, /PAGADOR FICTICIO/);
    assert.doesNotMatch(r.text, /98765432100/);
  }
});

// ---------- 4) tolerância do par EA/Blead × repasse (R$ 800, decisão do Levi 30/10; a view usa 300) ----------
test('4: tolerância padrão do par externo é R$ 800 (decisão do Levi; view usa 300)', () => {
  assert.equal(businessRules.transacoes.externalPairTolerance, 800);
  const sam = `${businessRules.transacoes.samuelNamePrefix} demo`;
  const tx = (id: string, tipo: string, pessoa: string, valor: number, data = '2026-10-05'): TransacaoBase => ({ id, data, pessoa, valor, descricao: '', tipo });
  const r = filtrarTransacoesOficiais([
    tx('e1', 'entrada', 'BLEAD AD TECH DEMO', 2500),
    tx('s1', 'saida', sam, 2300), // diff 200 → par
    tx('e2', 'entrada', 'EA DEMO', 1000, '2026-10-06'),
    tx('s2', 'saida', sam, 1500, '2026-10-06'), // diff 500 → par com 800 (não seria na view, 300)
    tx('e3', 'entrada', 'EA DEMO', 2000, '2026-10-07'),
    tx('s3', 'saida', sam, 2800, '2026-10-07'), // diff exatamente 800 → par (<=)
    tx('e4', 'entrada', 'EA DEMO', 1000, '2026-10-08'),
    tx('s4', 'saida', sam, 1900, '2026-10-08'), // diff 900 → não é par
  ]);
  const saidas = r.saidas.map((s) => s.id);
  assert.deepEqual(saidas, ['s4']);
  assert.equal(r.entradas.length, 0); // entradas externas sempre fora
});

// ---------- 5) alunos ativos sem "(modalidade)" ----------
test('5: contagem de alunos ativos exclui a modalidade literal "(modalidade)"', () => {
  const rows = [
    { aba: 'PILATES', modalidade: 'PILATES MANHA', aluno_nome: 'Aluna Demo A', ativo: true },
    { aba: 'PILATES', modalidade: 'PILATES MANHA', aluno_nome: 'Aluno Demo B', ativo: null },
    { aba: 'PILATES', modalidade: 'PILATES MANHA', aluno_nome: 'Aluno Demo C', ativo: false },
    { aba: 'DANCA', modalidade: '(modalidade)', aluno_nome: '(nome)', ativo: true },
    { aba: 'DANCA', modalidade: ' (Modalidade) ', aluno_nome: '(nome)', ativo: true },
  ];
  const t = formatAlunosPorModalidade(rows);
  assert.doesNotMatch(t, /^\(modalidade\)/im);
  assert.match(t, /PILATES MANHA: 2 ativo\(s\), 1 inativo\(s\)/);
  assert.match(t, /TOTAL: 2 ativo\(s\), 1 inativo\(s\)/);
  assert.match(t, /2 linha\(s\) com modalidade "\(modalidade\)"/);
});
