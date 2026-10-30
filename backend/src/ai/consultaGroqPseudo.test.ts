import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runConsultaAgent } from './consultaGeminiAgent.js';
import { Pseudonimizador, type NomeConhecido } from './pseudonimizacao.js';
import { resolveLlmProviders, GROQ_MODELS, llmGenerateText } from './llmProviders.js';
import { gerarConsultaReply } from '../services/consultaBylaService.js';

const NOMES: NomeConhecido[] = [
  { nome: 'Aluno Demo Um', tipo: 'aluno' },
  { nome: 'Aluna Demo Dois', tipo: 'aluno' },
  { nome: 'PAGADOR DEMO', tipo: 'pessoa' },
];
const REAIS = ['Aluno Demo Um', 'Aluna Demo Dois', 'PAGADOR DEMO', 'aluno demo um', 'pagador demo'];
const groq = [{ provider: 'groq' as const, apiKey: 'chave-fake', models: GROQ_MODELS }];
const ctx = { mes: 9, ano: 2026 };

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
function semNomeReal(payload: string) {
  for (const n of REAIS) assert.ok(!payload.toLowerCase().includes(n.toLowerCase()), `vazou "${n}" no payload`);
}

test('Pseudonimizador: códigos estáveis, sem acento/caixa, e round-trip', () => {
  const p = new Pseudonimizador(NOMES);
  const a = p.ocultar('quanto a ALUNO DEMO UM pagou? e Aluna Demo Dois? de novo aluno demo um');
  assert.equal(a, 'quanto a Aluno 1 pagou? e Aluno 2? de novo Aluno 1');
  assert.equal(p.ocultar('PIX PAGADOR DEMO'), 'PIX Pessoa 1');
  assert.equal(p.revelar('Aluno 1 pagou; Pessoa 1 enviou; Pessoa 9 não existe'), 'ALUNO DEMO UM pagou; PAGADOR DEMO enviou; Pessoa 9 não existe');
  assert.deepEqual(p.revelarArgs({ nome: 'Aluno 2', mes: 9 }), { nome: 'Aluna Demo Dois', mes: 9 });
  assert.equal(p.ocultar('Aluno Demo Umberto'), 'Aluno Demo Umberto'); // não corta palavra
});

test('Groq: nenhum nome real chega ao LLM; args com código voltam ao nome real; resposta revelada', async () => {
  const payloads: string[] = [];
  let toolNome = '';
  let n = 0;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
    const body = JSON.parse(String(init.body));
    payloads.push(String(init.body));
    assert.equal(body.model, 'openai/gpt-oss-120b');
    assert.ok(body.tools.length > 0);
    n++;
    if (n === 1) {
      assert.match(body.messages.at(-1).content, /quanto a Aluno 2 pagou/);
      return jsonRes(200, {
        choices: [{ message: { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'busca_aluno', arguments: '{"nome":"Aluno 2"}' } }] } }],
      });
    }
    const toolMsg = body.messages.at(-1);
    assert.equal(toolMsg.role, 'tool');
    assert.equal(toolMsg.tool_call_id, 'c1');
    return jsonRes(200, { choices: [{ message: { content: 'Aluno 2 pagou R$ 300,00 (fonte: Fluxo; PIX de Pessoa 1).' } }] });
  }) as unknown as typeof fetch;

  const r = await runConsultaAgent(
    'quanto a Aluno Demo Um pagou? meu email demo@exemplo.com',
    [{ role: 'assistant', content: 'Antes falamos de Aluna Demo Dois.' }],
    ctx,
    {
      providers: groq,
      fetchImpl,
      today: '2026-10-30',
      nomesConhecidos: NOMES,
      executeTool: async (tool, params) => {
        toolNome = params.nome ?? '';
        return { ok: true, tool, factsText: `Aluno Demo Um: R$ 300,00 em 09/2026 (PIX PAGADOR DEMO).` } as never;
      },
    },
  );
  assert.ok(r.ok, JSON.stringify(r));
  if (!r.ok) return;
  assert.equal(r.provider, 'groq');
  assert.equal(toolNome, 'Aluno Demo Um');
  assert.equal(r.text, 'Aluno Demo Um pagou R$ 300,00 (fonte: Fluxo; PIX de PAGADOR DEMO).');
  for (const p of payloads) {
    semNomeReal(p);
    assert.ok(!p.includes('demo@exemplo.com'));
  }
});

test('Groq 429 em todos os modelos → fallback determinístico com aviso', async () => {
  const fetchImpl = (async () => jsonRes(429, { error: { message: 'rate limit' } })) as unknown as typeof fetch;
  const out = await gerarConsultaReply(
    { message: 'resumo do mês', context: { monthYear: '2026-09' } },
    {
      providers: groq,
      fetchImpl,
      nomesConhecidos: [],
      executeTool: async (tool) => ({ ok: true, tool, factsText: 'Fatos demo.' }) as never,
    },
  );
  assert.equal(out.providerUsed, 'fallback');
  assert.match(out.message, /limite gratuito da IA/);
});

test('resolveLlmProviders: groq primeiro, ordem via env, só com chave', () => {
  assert.deepEqual(resolveLlmProviders({ groq: 'g', gemini: 'm' }, 'groq,gemini').map((p) => p.provider), ['groq', 'gemini']);
  assert.deepEqual(resolveLlmProviders({ groq: 'g', gemini: 'm' }, 'gemini,groq').map((p) => p.provider), ['gemini', 'groq']);
  assert.deepEqual(resolveLlmProviders({ gemini: 'm' }, 'groq,gemini').map((p) => p.provider), ['gemini']);
  assert.deepEqual(resolveLlmProviders({}, 'groq'), []);
});

test('llmGenerateText cai para o modelo seguinte do Groq', async () => {
  const models: string[] = [];
  const fetchImpl = (async (_u: string, init: RequestInit) => {
    const b = JSON.parse(String(init.body));
    models.push(b.model);
    if (models.length === 1) return jsonRes(503, {});
    return jsonRes(200, { choices: [{ message: { content: 'ok' } }] });
  }) as unknown as typeof fetch;
  const r = await llmGenerateText([{ role: 'user', content: 'oi' }], { providers: groq, fetchImpl });
  assert.ok(r.ok);
  assert.deepEqual(models, ['openai/gpt-oss-120b', 'openai/gpt-oss-20b']);
});
