import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEGACY_ENTRADA_ALUGUEL_TEMPLATE_KEY_LABELS,
  LEGACY_SAIDA_FIXA_TEMPLATE_KEY_LABELS,
  stableEntradaAluguelTemplateKeyForLabel,
  stableSaidaFixaTemplateKeyForLabel,
} from './chavesEstaveis.js';
import { buildControleCaixaTemplate } from './template.js';

describe('chavesEstaveis aluguel e fixas', () => {
  it('resolve rótulos de aluguel para ent_alug_*', () => {
    assert.equal(stableEntradaAluguelTemplateKeyForLabel('Neto (SBA)'), 'ent_alug_neto_sba');
    assert.equal(stableEntradaAluguelTemplateKeyForLabel('Pholha (Funcional)'), 'ent_alug_pholha');
    assert.equal(stableEntradaAluguelTemplateKeyForLabel('Forró e Alma'), 'ent_alug_forro_alma');
  });

  it('resolve rótulos de saídas fixas para sai_fix_*', () => {
    assert.equal(stableSaidaFixaTemplateKeyForLabel('Energia'), 'sai_fix_energia');
    assert.equal(stableSaidaFixaTemplateKeyForLabel('Água'), 'sai_fix_agua');
    assert.equal(stableSaidaFixaTemplateKeyForLabel('Funcionários'), 'sai_fix_funcionarios');
  });

  it('template padrão já traz chaves estáveis em aluguel e fixas', () => {
    const t = buildControleCaixaTemplate();
    const aluguel = t.blocos.find((b) => b.templateKey === 'entrada_aluguel_coworking');
    const fixas = t.blocos.find((b) => b.templateKey === 'saida_gastos_fixos');
    assert.ok(aluguel?.linhas.every((l) => (l.templateKey ?? '').startsWith('ent_alug_')));
    assert.ok(fixas?.linhas.every((l) => (l.templateKey ?? '').startsWith('sai_fix_')));
    assert.ok(Object.keys(LEGACY_ENTRADA_ALUGUEL_TEMPLATE_KEY_LABELS).length >= 5);
    assert.ok(Object.keys(LEGACY_SAIDA_FIXA_TEMPLATE_KEY_LABELS).length >= 10);
  });
});
