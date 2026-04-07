import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PROMPT_VERSION_RELATORIOS,
  buildUserPromptRelatorio,
  getSystemPromptForTipo,
} from './relatoriosPrompts.js';

test('PROMPT_VERSION_RELATORIOS está definida (versionamento)', () => {
  assert.match(PROMPT_VERSION_RELATORIOS, /^\d{4}-\d{2}-\d{2}$/);
});

test('getSystemPromptForTipo mensal: visão geral e linhas da planilha CONTROLE', () => {
  const p = getSystemPromptForTipo('mensal');
  assert.ok(p.includes('## Visão geral financeira'));
  assert.ok(p.includes('## Entradas na planilha CONTROLE de caixa (linha a linha)'));
  assert.ok(p.includes('gestão'));
  assert.ok(p.includes('banco_entradas.top_pessoas_entradas'), 'separa planilha CONTROLE vs extrato');
});

test('buildUserPromptRelatorio mensal inclui [DADOS v…] e controle_caixa_leitura_gestao', () => {
  const u = buildUserPromptRelatorio('mensal', {
    tipo: 'mensal',
    periodo_label: 'Março de 2026',
    controle_caixa_leitura_gestao: { entradas_linha_a_linha: [], saidas_por_categoria: [], gastos_fixos_linha_a_linha: [] },
  });
  assert.ok(u.includes(`[DADOS v${PROMPT_VERSION_RELATORIOS}]`));
  assert.ok(u.includes('controle_caixa_leitura_gestao'));
  assert.ok(u.includes('### Exemplo de como listar'));
});

test('buildUserPromptRelatorio mensal_operacional referencia controle_caixa_leitura_gestao', () => {
  const u = buildUserPromptRelatorio('mensal_operacional', { tipo: 'mensal_operacional' });
  assert.ok(u.includes('controle_caixa_leitura_gestao'));
});
