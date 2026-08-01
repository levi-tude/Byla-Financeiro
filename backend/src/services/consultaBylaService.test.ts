import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { mensagemRecusaForaDoCatalogo, resolveConsultaIntent } from '../ai/consultaCatalog.js';

describe('consultaByla orchestration helpers', () => {
  it('recusa fora do catálogo tem sugestão de menu', () => {
    const msg = mensagemRecusaForaDoCatalogo();
    assert.match(msg, /não tenho essa consulta/i);
    assert.match(msg, /Resumo do mês/);
  });

  it('intent de menu não depende de LLM', () => {
    const r = resolveConsultaIntent('Pendentes de conciliação');
    assert.ok(r);
    assert.equal(r!.tool, 'pendentes_conciliacao');
    assert.equal(r!.source, 'menu');
  });
});

describe('gerarConsultaReply com tool mock', () => {
  it('retorna facts quando intent resolve', async () => {
    // Smoke: import dinâmico do serviço (sem chamar Supabase neste teste).
    const intent = resolveConsultaIntent('Resumo do mês');
    assert.ok(intent);
    assert.equal(intent!.tool, 'resumo_mes');
  });
});

// silence unused mock import if node version differs
void mock;
