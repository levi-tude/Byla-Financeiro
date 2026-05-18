import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyIntent } from './intentCatalog.js';
import { buildAssistantPlaybookResponse } from './assistantPlaybook.js';

test('classifyIntent reconhece pendências e cobranças', () => {
  const c1 = classifyIntent('mostrar pendências e cobranças do fluxo de caixa');
  assert.equal(c1.intent, 'fluxo_pendencias_cobrancas');

  const c2 = classifyIntent('abrir cobrança para esse aluno');
  assert.equal(c2.intent, 'fluxo_cobranca_acao');
});

test('playbook exige confirmação para qualquer navegação', () => {
  const intentsComAcao = [
    'fluxo_lancar_entrada',
    'fluxo_lancar_saida',
    'fluxo_editar_lancamento',
    'fluxo_excluir_lancamento',
    'fluxo_conferir_total_dia',
    'fluxo_conferir_total_mes',
    'fluxo_fechamento_mes',
    'fluxo_filtrar_periodo',
    'fluxo_resumo_pagamento',
    'fluxo_pendencias_cobrancas',
    'fluxo_cobranca_acao',
    'fluxo_categoria_lancamento',
    'fluxo_erro_saldo',
    'abrir_fluxo_caixa',
  ] as const;

  for (const intent of intentsComAcao) {
    const r = buildAssistantPlaybookResponse(intent);
    assert.ok(r.actions.length > 0, `intent ${intent} deveria ter ação`);
    assert.equal(r.needsConfirmation, true, `intent ${intent} deveria exigir confirmação`);
  }
});

test('fallback mantém foco em fluxo e sem ação direta', () => {
  const r = buildAssistantPlaybookResponse('fallback_duvida_operacional');
  assert.equal(r.actions.length, 0);
  assert.equal(r.needsConfirmation, false);
  assert.match(r.message.toLowerCase(), /fluxo de caixa/);
});

