import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { NextFunction, Request, Response } from 'express';
import { criacaoRequestSchema, sanitizeNarrativa, validarEHidratar, type Dataset } from './criacoesSpec.js';
import { gerarCriacao, mesesDoPrompt } from '../services/criacoesService.js';
import type { CriacaoToolDeps } from '../services/criacoesDatasets.js';
import { requireRoles, restrictGestor } from '../middleware/auth.js';
import { CONSULTA_PREFIXES, CONSULTA_ROLES } from '../auth/roles.js';

const DS: Dataset = {
  id: 'balanco_2m',
  titulo: 'Balanço',
  fonte: 'Fixture fictícia',
  colunas: [
    { key: 'mes', label: 'Mês', formato: 'mes' },
    { key: 'entradas', label: 'Entradas', formato: 'brl' },
    { key: 'saidas', label: 'Saídas', formato: 'brl' },
  ],
  linhas: [
    { mes: '2026-08', entradas: 1000, saidas: 400 },
    { mes: '2026-09', entradas: 1500.5, saidas: 600 },
  ],
};

test('KPIs são preenchidos pelo servidor a partir do dataset (o valor do modelo é ignorado)', () => {
  const r = validarEHidratar(
    { titulo: 'T', secoes: [{ type: 'kpi_cards', titulo: 'K', itens: [{ label: 'Entradas', dataset: 'balanco_2m', linha: 'total', coluna: 'entradas' }] }] },
    [DS],
    'gemini',
  );
  assert.ok(r.ok);
  if (!r.ok) return;
  const k = r.spec.secoes[0]!;
  assert.equal(k.type, 'kpi_cards');
  if (k.type === 'kpi_cards') assert.equal(k.itens[0]!.valor, 2500.5);
});

test('campos extras, tipos desconhecidos e referências inválidas são descartados', () => {
  const r = validarEHidratar(
    {
      titulo: 'T',
      secoes: [
        { type: 'html', html: '<script>alert(1)</script>' },
        { type: 'bar_chart', titulo: 'B', dataset: 'balanco_2m', x: 'mes', series: ['entradas'], onClick: 'x' },
        { type: 'kpi_cards', titulo: 'K', itens: [{ label: 'X', dataset: 'balanco_2m', linha: 0, coluna: 'entradas', valor: 999999 }] },
        { type: 'line_chart', titulo: 'L', dataset: 'inventado', x: 'mes', series: ['entradas'] },
        { type: 'line_chart', titulo: 'L', dataset: 'balanco_2m', x: 'mes', series: ['mes'] },
        { type: 'line_chart', titulo: 'OK', dataset: 'balanco_2m', x: 'mes', series: ['entradas', 'saidas'] },
      ],
    },
    [DS],
    'gemini',
  );
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.spec.secoes.length, 1);
  assert.equal(r.spec.secoes[0]!.type, 'line_chart');
  assert.equal(r.spec.avisos.length, 5);
});

test('sem seção com dados → falha (para o chamador usar fallback); topo fora do schema → falha', () => {
  assert.equal(validarEHidratar({ titulo: 'T', secoes: [{ type: 'narrative', texto: 'oi' }] }, [DS], 'gemini').ok, false);
  assert.equal(validarEHidratar({ titulo: 'T', secoes: [], script: 1 }, [DS], 'gemini').ok, false);
  assert.equal(validarEHidratar('<div/>', [DS], 'gemini').ok, false);
});

test('narrativa: remove HTML e valores escritos pelo modelo', () => {
  const t = sanitizeNarrativa('<b>Entrou</b> R$ 12.345,67 em setembro, alta de 12% e 1.234 alunos.');
  assert.ok(!/R\$|\d+%|<b>|1\.234/.test(t), t);
});

test('pedido: prompt 3–500 e monthYear YYYY-MM; campos extras rejeitados', () => {
  assert.ok(criacaoRequestSchema.safeParse({ prompt: 'balanço', monthYear: '2026-09' }).success);
  assert.ok(!criacaoRequestSchema.safeParse({ prompt: 'a' }).success);
  assert.ok(!criacaoRequestSchema.safeParse({ prompt: 'x'.repeat(501) }).success);
  assert.ok(!criacaoRequestSchema.safeParse({ prompt: 'balanço', monthYear: '09/2026' }).success);
  assert.ok(!criacaoRequestSchema.safeParse({ prompt: 'balanço', sql: 'drop' }).success);
  assert.equal(mesesDoPrompt('balanço dos últimos 4 meses'), 4);
  assert.equal(mesesDoPrompt('últimos 30 meses'), 12);
});

const fakeDeps: CriacaoToolDeps = {
  resumoMes: async (mes) => ({ entradas: 1000 * mes, saidas: 500 * mes }),
  modalidades: async () => new Map([['Modalidade Demo', { total: 800, qtd: 4 }]]),
  meios: async () => new Map([['PIX', { entradas: 700, saidas: 100, qtd: 5 }]]),
};

test('sem chave Gemini → spec determinístico válido', async () => {
  const s = await gerarCriacao({ prompt: 'balanço dos últimos 4 meses', monthYear: '2026-09' }, { apiKey: '', toolDeps: fakeDeps });
  assert.equal(s.origem, 'deterministico');
  const k = s.secoes[0]!;
  assert.ok(k.type === 'kpi_cards' && k.itens[0]!.valor === 1000 * (6 + 7 + 8 + 9));
});

test('Gemini devolve HTML/JSON inválido → fallback; JSON válido com tool → spec gemini', async () => {
  const reply = (parts: unknown[]) => new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts } }] }), { status: 200 });
  const bad: typeof fetch = async () => reply([{ text: '<html>oi</html>' }]);
  const s1 = await gerarCriacao({ prompt: 'balanço', monthYear: '2026-09' }, { apiKey: 'k', fetchImpl: bad, toolDeps: fakeDeps, models: ['m'] });
  assert.equal(s1.origem, 'deterministico');

  let n = 0;
  const good: typeof fetch = async () =>
    n++ === 0
      ? reply([{ functionCall: { name: 'balanco_meses', args: { meses: 2 } } }])
      : reply([{ text: '```json\n{"titulo":"X","secoes":[{"type":"bar_chart","titulo":"B","dataset":"balanco_2m","x":"mes","series":["entradas"]}]}\n```' }]);
  const s2 = await gerarCriacao({ prompt: 'balanço 2 meses', monthYear: '2026-09' }, { apiKey: 'k', fetchImpl: good, toolDeps: fakeDeps, models: ['m'] });
  assert.equal(s2.origem, 'gemini');
  assert.deepEqual(s2.datasets[0]!.linhas.map((l) => l.entradas), [8000, 9000]);
});

function run(mw: (req: Request, res: Response, next: NextFunction) => void, role: string, path: string) {
  let status = 200;
  let passed = false;
  const res = { status(s: number) { status = s; return this; }, json() { return this; } } as unknown as Response;
  mw({ authUser: { id: 'u', role }, path } as unknown as Request, res, () => { passed = true; });
  return passed ? 200 : status;
}

test('gating /ai/criacoes: admin e gestor sim, secretaria não', () => {
  const g = restrictGestor(CONSULTA_PREFIXES);
  assert.equal(run(g, 'gestor', '/ai/criacoes/gerar'), 200);
  assert.equal(run(g, 'gestor', '/ai/consulta/chat'), 200);
  assert.equal(run(g, 'gestor', '/transacoes'), 403);
  assert.equal(run(requireRoles(CONSULTA_ROLES), 'secretaria', '/ai/criacoes/gerar'), 403);
  assert.equal(run(requireRoles(CONSULTA_ROLES), 'admin', '/ai/criacoes/gerar'), 200);
  assert.equal(run(requireRoles(CONSULTA_ROLES), 'gestor', '/ai/criacoes/gerar'), 200);
});

test('criações via Groq: payload sem nome real, args revelados e provider groq', async () => {
  const { runCriacoesAgent } = await import('./criacoesGeminiAgent.js');
  const payloads: string[] = [];
  let n = 0;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
    payloads.push(String(init.body));
    n++;
    if (n === 1) {
      return new Response(
        JSON.stringify({ choices: [{ message: { content: null, tool_calls: [{ id: 't1', type: 'function', function: { name: 'balanco_meses', arguments: '{"meses":2}' } }] } }] }),
        { status: 200 },
      );
    }
    return new Response(
      JSON.stringify({ choices: [{ message: { content: '{"titulo":"Balanço de Aluno 1","secoes":[{"type":"narrative","texto":"ok"}]}' } }] }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
  const r = await runCriacoesAgent('balanço para mostrar ao Aluno Demo Um', { mes: 9, ano: 2026 }, {
    providers: [{ provider: 'groq', apiKey: 'chave-fake', models: ['openai/gpt-oss-120b'] }],
    fetchImpl,
    toolDeps: fakeDeps,
    today: '2026-10-30',
    nomesConhecidos: [{ nome: 'Aluno Demo Um', tipo: 'aluno' }],
  });
  assert.ok(r.ok, JSON.stringify(r));
  if (!r.ok) return;
  assert.equal(r.provider, 'groq');
  assert.equal((r.draft as { titulo: string }).titulo, 'Balanço de Aluno Demo Um');
  for (const p of payloads) assert.ok(!p.includes('Aluno Demo Um'));
});
