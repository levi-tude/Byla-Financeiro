import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gerarConsultaReply } from '../services/consultaBylaService.js';
import type { ConsultaToolId } from './consultaCatalog.js';

const executeTool = async (tool: ConsultaToolId) => ({ ok: true as const, tool, factsText: 'Saldo fictício R$ 1,00' });

test('sem chave usa modo determinístico', async () => {
  const r = await gerarConsultaReply({ message: 'saldo do banco' }, { apiKey: '', executeTool });
  assert.equal(r.providerUsed, 'deterministic');
});

test('429 do Gemini cai no modo simples e avisa', async () => {
  const fetchImpl = (async () => new Response('{}', { status: 429 })) as unknown as typeof fetch;
  const r = await gerarConsultaReply({ message: 'saldo do banco' }, { apiKey: 'teste', fetchImpl, executeTool });
  assert.equal(r.providerUsed, 'fallback');
  assert.match(r.message, /limite gratuito/);
});
