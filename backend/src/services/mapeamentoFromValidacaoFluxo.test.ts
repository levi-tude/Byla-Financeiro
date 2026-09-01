import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  conflitoAbasTemplateKeys,
  sincronizarMapeamentoSugestoesFromVinculosMes,
} from './mapeamentoFromValidacaoFluxo.js';

// Re-export interno via comportamento: vínculo Validação deve poder substituir manual.
// Teste de integração leve documentado no script reconciliarMapeamentoValidacaoControle.
describe('mapeamentoFromValidacaoFluxo exports', () => {
  it('exporta sincronizarMapeamentoSugestoesFromVinculosMes', () => {
    assert.equal(typeof sincronizarMapeamentoSugestoesFromVinculosMes, 'function');
  });
});

describe('conflitoAbasTemplateKeys', () => {
  it('sem conflito com uma aba', () => {
    assert.equal(conflitoAbasTemplateKeys(['ent_parc_yoga']), false);
  });

  it('detecta conflito com abas diferentes', () => {
    assert.equal(conflitoAbasTemplateKeys(['ent_parc_yoga', 'ent_parc_danca']), true);
  });

  it('ignora duplicatas', () => {
    assert.equal(conflitoAbasTemplateKeys(['ent_parc_yoga', 'ent_parc_yoga']), false);
  });
});
