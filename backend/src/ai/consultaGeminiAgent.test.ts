import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONSULTA_TOOL_DECLS,
  MAX_AGENT_ITERATIONS,
  normalizeToolCall,
  runConsultaAgent,
  stripPii,
} from './consultaGeminiAgent.js';
import type { ConsultaToolId } from './consultaCatalog.js';

const ctx = { mes: 3, ano: 2026 };

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

test('declara 28 tools com nomes únicos', () => {
  assert.equal(CONSULTA_TOOL_DECLS.length, 28);
  assert.equal(new Set(CONSULTA_TOOL_DECLS.map((t) => t.name)).size, 28);
});

test('normalizeToolCall rejeita tool desconhecida e params fora da declaração', () => {
  assert.equal(normalizeToolCall('drop_table', {}, ctx), null);
  const r = normalizeToolCall('resumo_mes', { mes: 7, ano: 2025, sql: 'select 1' }, ctx)!;
  assert.equal(r.tool, 'resumo_mes');
  assert.deepEqual(r.ctx, { mes: 7, ano: 2025 });
  assert.equal(r.params.sql, undefined);
});

test('normalizeToolCall ignora mês inválido e marca precisa_dado', () => {
  const r = normalizeToolCall('resumo_mes', { mes: 13 }, ctx)!;
  assert.equal(r.ctx.mes, 3);
  const c = normalizeToolCall('comparar_meses', { mes_a: '2026-01' }, ctx)!;
  assert.equal(c.params.precisa_dado, '1');
});

test('stripPii remove cpf, telefone e e-mail', () => {
  const s = stripPii('Aluno Demo Um, cpf 123.456.789-09, tel (71) 99999-1234, demo@exemplo.com');
  assert.ok(!s.includes('123.456.789-09'));
  assert.ok(!s.includes('99999-1234'));
  assert.ok(!s.includes('demo@exemplo.com'));
  assert.ok(s.includes('Aluno Demo Um'));
});

test('agente chama tool e responde com texto final', async () => {
  const calls: string[] = [];
  let n = 0;
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    n++;
    const body = JSON.parse(String(init.body));
    if (n === 1) {
      assert.equal(body.contents.length, 3); // 2 de histórico + pergunta
      return jsonRes(200, { candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'resumo_mes', args: { mes: 2 } } }] } }] });
    }
    const resp = JSON.stringify(body.contents.at(-1));
    assert.ok(!resp.includes('demo@exemplo.com'));
    return jsonRes(200, { candidates: [{ content: { role: 'model', parts: [{ text: 'Entradas: R$ 10,00.' }] } }] });
  }) as unknown as typeof fetch;
  const r = await runConsultaAgent(
    'e fevereiro?',
    [
      { role: 'user', content: 'resumo de março' },
      { role: 'assistant', content: 'ok' },
    ],
    ctx,
    {
      apiKey: 'teste',
      fetchImpl,
      today: '2026-03-10',
      executeTool: async (tool: ConsultaToolId, _p, c) => {
        calls.push(`${tool}:${c.mes}`);
        return { ok: true, tool, factsText: 'Entradas R$ 10,00 contato demo@exemplo.com' };
      },
    },
  );
  assert.equal(r.ok, true);
  assert.deepEqual(calls, ['resumo_mes:2']);
});

test('429 retorna rate_limit', async () => {
  const fetchImpl = (async () => jsonRes(429, {})) as unknown as typeof fetch;
  const r = await runConsultaAgent('oi', [], ctx, {
    apiKey: 'teste', fetchImpl, today: '2026-03-10',
    executeTool: async () => { throw new Error('não deveria'); },
  });
  assert.deepEqual(r.ok ? null : r.reason, 'rate_limit');
});

test('loop limitado a MAX_AGENT_ITERATIONS', async () => {
  let n = 0;
  const fetchImpl = (async () => {
    n++;
    return jsonRes(200, { candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'saldo_banco', args: {} } }] } }] });
  }) as unknown as typeof fetch;
  const r = await runConsultaAgent('oi', [], ctx, {
    apiKey: 'teste', fetchImpl, today: '2026-03-10', models: ['m1'],
    executeTool: async (tool) => ({ ok: true, tool, factsText: 'x' }),
  });
  assert.equal(r.ok, false);
  assert.ok(n <= MAX_AGENT_ITERATIONS);
});
