import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contagensQuemNaoPagou,
  extrairVisualDaIa,
  specDaConsulta,
  specPropostoPelaIa,
  type VisualDeps,
} from './consultaVisual.js';
import { gerarConsultaReply } from '../services/consultaBylaService.js';
import type { ConsultaToolId } from './consultaCatalog.js';

// Dados 100% fictícios.
const deps: VisualDeps = {
  resumoMes: async (mes) => ({ entradas: 1000 + mes * 10, saidas: 600 + mes }),
  modalidades: async (mes) =>
    new Map([
      ['Ballet Demo', { total: 500 + mes, qtd: 5 }],
      ['Yoga Demo', { total: 300, qtd: 3 }],
    ]),
  meios: async () => new Map(),
  saidasMes: async () => [
    { data: '2026-03-05', pessoa: 'Fornecedor Demo Um 123.456.789-00', valor: -400 },
    { data: '2026-03-06', pessoa: 'Fornecedor Demo Um', valor: -100 },
    { data: '2026-03-07', pessoa: 'MARINA PROFESSORA DEMO', valor: -250 },
    { data: '2026-03-08', pessoa: 'Loja Demo Dois', valor: -50 },
  ],
};
const ctx = { mes: 3, ano: 2026 };
const tipos = (s: { secoes: Array<{ type: string }> } | null) => s?.secoes.map((x) => x.type);

test('resumo_mes gera KPI + barras sem IA', async () => {
  const s = await specDaConsulta('resumo_mes', {}, ctx, '', deps);
  assert.ok(s);
  assert.equal(s.origem, 'deterministico');
  assert.deepEqual(tipos(s), ['kpi_cards', 'bar_chart']);
  const kpi = s.secoes[0] as { itens: Array<{ valor: number }> };
  assert.equal(kpi.itens[0]!.valor, 1030);
});

test('balanco_meses (últimos 3 meses) tem totais, barras, linha e tabela', async () => {
  const s = await specDaConsulta('balanco_meses', { meses: '3' }, ctx, '', deps);
  assert.deepEqual(tipos(s), ['kpi_cards', 'bar_chart', 'line_chart', 'table']);
  assert.equal(s!.datasets[0]!.linhas.length, 3);
});

test('comparar_meses gera comparison', async () => {
  const s = await specDaConsulta('comparar_meses', { mes_a: '2026-01', mes_b: '2026-02' }, ctx, '', deps);
  assert.deepEqual(tipos(s), ['comparison', 'bar_chart']);
});

test('modalidades: donut; entradas por modalidade no período: total + barras', async () => {
  assert.deepEqual(tipos(await specDaConsulta('resumo_modalidades', {}, ctx, '', deps)), ['kpi_cards', 'donut', 'table']);
  const s = await specDaConsulta('entradas_modalidade_periodo', { modalidade: 'ballet', mes_inicio: '2026-01', mes_fim: '2026-03' }, ctx, '', deps);
  assert.deepEqual(tipos(s), ['kpi_cards', 'bar_chart']);
  const kpi = s!.secoes[0] as { itens: Array<{ valor: number }> };
  assert.equal(kpi.itens[0]!.valor, 501 + 502 + 503);
  // Sem registro não vira zero: sem cartão.
  assert.equal(await specDaConsulta('entradas_modalidade_periodo', { modalidade: 'inexistente' }, ctx, '', deps), null);
});

test('maiores saídas: ranking agrupado e sem CPF', async () => {
  const s = await specDaConsulta('maiores_saidas', {}, ctx, '', deps);
  assert.deepEqual(tipos(s), ['kpi_cards', 'ranking']);
  const json = JSON.stringify(s);
  assert.ok(!/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(json), 'CPF não pode aparecer');
  const rank = s!.datasets.find((d) => d.id === 'maiores_saidas')!;
  assert.equal(rank.linhas[0]!.total, 500);
});

test('professores: ranking por apelido', async () => {
  const s = await specDaConsulta('repasses_professores', {}, ctx, '', deps);
  assert.ok(s);
  assert.equal(s.datasets[0]!.linhas[0]!.professor, 'Mari');
});

test('quem não pagou: só contagens, nenhum nome', async () => {
  const facts = 'Pendentes:\n- Aluno Demo Um\nPagos: 10 · Parcial: 2 · Pendente: 3 · Sem pagamento e sem valor no cadastro: 1 · Previsto: 4.';
  assert.deepEqual(contagensQuemNaoPagou(facts), { pago: 10, parcial: 2, pendente: 3, sem_dado: 1, previsto: 4 });
  const s = await specDaConsulta('quem_nao_pagou', {}, ctx, facts, deps);
  assert.deepEqual(tipos(s), ['kpi_cards', 'donut']);
  assert.ok(!JSON.stringify(s).includes('Aluno Demo'));
});

test('tool sem visual ou erro de leitura → null', async () => {
  assert.equal(await specDaConsulta('precos_planos' as ConsultaToolId, {}, ctx, '', deps), null);
  const quebrado = { ...deps, resumoMes: async () => { throw new Error('x'); } };
  assert.equal(await specDaConsulta('resumo_mes', {}, ctx, '', quebrado), null);
});

test('IA: bloco <visual> é extraído e removido do texto', () => {
  const r = extrairVisualDaIa('Resposta.\n<visual>{"titulo":"T","secoes":[]}</visual>');
  assert.equal(r.texto, 'Resposta.');
  assert.deepEqual(r.draft, { titulo: 'T', secoes: [] });
  assert.equal(extrairVisualDaIa('a <visual>não é json</visual>').draft, null);
});

test('IA: spec válido é aceito; malicioso/inválido é rejeitado', async () => {
  const base = (await specDaConsulta('balanco_meses', { meses: '3' }, ctx, '', deps))!;
  const id = base.datasets[0]!.id;
  const ok = specPropostoPelaIa({ titulo: 'Saldo', secoes: [{ type: 'line_chart', titulo: 'Saldo', dataset: id, x: 'mes', series: ['saldo'] }] }, base.datasets, 'groq');
  assert.ok(ok);
  assert.equal(ok.origem, 'groq');

  const maliciosos: unknown[] = [
    { titulo: 'x', secoes: [{ type: 'html', html: '<script>alert(1)</script>' }] },
    { titulo: 'x', secoes: [{ type: 'bar_chart', titulo: 't', dataset: id, x: 'mes', series: ['saldo'], onClick: 'fetch("//evil")' }] },
    { titulo: 'x', secoes: [{ type: 'bar_chart', titulo: 't', dataset: 'inventado', x: 'mes', series: ['saldo'] }] },
    { titulo: 'x', secoes: [{ type: 'bar_chart', titulo: 't', dataset: id, x: 'mes', series: ['constructor'] }] },
    { titulo: 'x', secoes: [{ type: 'table', titulo: 't', dataset: '../../etc' }] },
    { titulo: 'x', secoes: [{ type: 'kpi_cards', titulo: 't', itens: [{ label: 'L', dataset: id, linha: 0, coluna: 'saldo', valor: 999999 }] }] },
    { titulo: 'x', secoes: [], __proto__: { admin: true } },
    'function(){}',
    null,
  ];
  for (const m of maliciosos) assert.equal(specPropostoPelaIa(m, base.datasets, 'gemini'), null, JSON.stringify(m));

  // Narrativa da IA é descartada (texto livre poderia trazer nomes).
  const soNarr = specPropostoPelaIa({ titulo: 'x', secoes: [{ type: 'narrative', texto: 'Aluno Demo Um pagou' }] }, base.datasets, 'groq');
  assert.equal(soNarr, null);
});

test('serviço: roteador devolve visual sem IA', async () => {
  const executeTool = async (tool: ConsultaToolId) => ({ ok: true as const, tool, factsText: 'Balanço fictício.' });
  const r = await gerarConsultaReply({ message: 'balanço dos últimos 3 meses', context: { monthYear: '2026-03' } }, { apiKey: '', executeTool, visualDeps: deps });
  assert.equal(r.providerUsed, 'deterministic');
  assert.ok(r.visual, `esperava visual (tool=${r.tool})`);
  assert.ok(!r.message.includes('⟦IA⟧'));
});

test('serviço: sem visualDeps (teste com executeTool injetado) → visual null', async () => {
  const executeTool = async (tool: ConsultaToolId) => ({ ok: true as const, tool, factsText: 'x' });
  const r = await gerarConsultaReply({ message: 'balanço dos últimos 3 meses' }, { apiKey: '', executeTool });
  assert.equal(r.visual, null);
});
