import assert from 'node:assert/strict';
import test from 'node:test';
import { podeConfirmarIndividualmente, rotuloGrupoMatch } from './matchesProvaveisView.js';

test('somente seguro e médio 1:1 permitem confirmação individual', () => {
  assert.equal(
    podeConfirmarIndividualmente({ grupo_ui: 'seguro', n_para_1: false, planilha_ids: ['p1'] }),
    true,
  );
  assert.equal(
    podeConfirmarIndividualmente({ grupo_ui: 'medio', n_para_1: false, planilha_ids: ['p1'] }),
    true,
  );
  assert.equal(
    podeConfirmarIndividualmente({ grupo_ui: 'ambiguo', n_para_1: false, planilha_ids: ['p1'] }),
    false,
  );
  assert.equal(
    podeConfirmarIndividualmente({
      grupo_ui: 'medio',
      n_para_1: true,
      planilha_ids: ['p1', 'p2'],
    }),
    false,
  );
});

test('rótulos são simples para a equipe administrativa', () => {
  assert.equal(rotuloGrupoMatch('seguro'), 'Seguro para vincular');
  assert.equal(rotuloGrupoMatch('medio'), 'Precisa confirmar');
  assert.equal(rotuloGrupoMatch('ambiguo'), 'Ambíguo');
});
