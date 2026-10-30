import { test } from 'node:test';
import assert from 'node:assert/strict';
import { llmChat, parseGroqLimitError, LlmHttpError, GROQ_MODELS } from './llmProviders.js';
import { resolveConsultaIntent, extrairModalidadeEntrada } from './consultaCatalog.js';
import { runConsultaAgent, MAX_TOOL_RESULT_CHARS } from './consultaGeminiAgent.js';

const P = { provider: 'groq' as const, apiKey: 'chave-de-teste', models: ['m1'] };
const ok = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const r429 = (retry: string | null) =>
  new Response(
    JSON.stringify({ error: { message: 'Rate limit reached for model `openai/gpt-oss-120b` in organization `org_abc123` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Used 7000, Requested 2600.' } }),
    { status: 429, headers: retry ? { 'retry-after': retry } : {} },
  );

test('429 com retry-after curto: espera e repete uma vez', async () => {
  let n = 0;
  const esperas: number[] = [];
  const f = (async () => (n++ === 0 ? r429('2') : ok('oi'))) as typeof fetch;
  const r = await llmChat(P, 'm1', [{ role: 'user', content: 'x' }], undefined, { fetchImpl: f, sleep: async (ms) => void esperas.push(ms) });
  assert.equal(r.text, 'oi');
  assert.equal(n, 2);
  assert.equal(esperas.length, 1);
});

test('429 com retry-after longo: não espera; erro traz tipo de limite sem org id', async () => {
  let n = 0;
  const f = (async () => (n++, r429('40'))) as typeof fetch;
  await assert.rejects(
    llmChat(P, 'm1', [{ role: 'user', content: 'x' }], undefined, { fetchImpl: f, sleep: async () => assert.fail('não deveria esperar') }),
    (e: unknown) => {
      assert.ok(e instanceof LlmHttpError);
      assert.equal(e.status, 429);
      assert.equal(e.info.limite, 'TPM');
      assert.equal(e.info.retryAfterS, 40);
      assert.ok(!e.info.detalhe?.includes('org_abc123'));
      return true;
    },
  );
  assert.equal(n, 1);
});

test('parseGroqLimitError reconhece TPD', () => {
  assert.equal(parseGroqLimitError('{"error":{"message":"... on tokens per day (TPD): Limit 200000"}}').limite, 'TPD');
});

test('modelos Groq não usam llama-3.3-70b-versatile (desligado em 16/08/2026)', () => {
  assert.ok(!(GROQ_MODELS as readonly string[]).includes('llama-3.3-70b-versatile'));
});

test('fallback: "Quanto entrou de Pilates esse mês?" → entradas_modalidade_periodo', () => {
  const i = resolveConsultaIntent('Quanto entrou de Pilates esse mês?');
  assert.equal(i?.tool, 'entradas_modalidade_periodo');
  assert.equal(i?.params.modalidade, 'pilates');
  assert.equal(extrairModalidadeEntrada('quanto entrou de yoga nos ultimos 3 meses'), 'yoga');
  assert.equal(extrairModalidadeEntrada('quanto entrou no caixa hoje'), null);
  assert.equal(resolveConsultaIntent('entradas por modalidade')?.tool, 'resumo_modalidades');
});

test('agente corta resultado de função grande e devolve falhas para log', async () => {
  const enviados: string[] = [];
  let n = 0;
  const f = (async (_u: string, init: RequestInit) => {
    enviados.push(String(init.body));
    if (n++ === 0)
      return new Response(JSON.stringify({ choices: [{ message: { content: '', tool_calls: [{ id: 'c1', function: { name: 'resumo_mes', arguments: '{}' } }] } }] }), { status: 200 });
    return ok('Resumo pronto.');
  }) as typeof fetch;
  const r = await runConsultaAgent('balanço do mês', [], { mes: 10, ano: 2026 } as never, {
    providers: [P], fetchImpl: f, today: '2026-10-30', nomesConhecidos: [],
    executeTool: async (tool) => ({ ok: true, tool, factsText: 'x'.repeat(20000) }) as never,
  });
  assert.ok(r.ok, JSON.stringify(r));
  assert.ok(enviados[1]!.includes('x'.repeat(MAX_TOOL_RESULT_CHARS)));
  assert.ok(!enviados[1]!.includes('x'.repeat(MAX_TOOL_RESULT_CHARS + 1)));
  assert.ok(enviados[1]!.includes('resultado cortado'));

  const f429 = (async () => r429(null)) as typeof fetch;
  const r2 = await runConsultaAgent('oi', [], { mes: 10, ano: 2026 } as never, {
    providers: [P], fetchImpl: f429, today: '2026-10-30', nomesConhecidos: [], executeTool: async () => ({}) as never,
  });
  assert.equal(r2.ok, false);
  if (!r2.ok) {
    assert.equal(r2.reason, 'rate_limit');
    assert.equal(r2.falhas?.[0]?.limite, 'TPM');
    assert.equal(r2.falhas?.[0]?.model, 'm1');
  }
});
