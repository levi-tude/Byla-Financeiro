import assert from 'node:assert/strict';
import test from 'node:test';
import { avaliarReplayMatchesProvaveis } from './matchesProvaveisReplay.js';

test('replay mede precisão e falsos positivos sem expor dados pessoais', () => {
  const relatorio = avaliarReplayMatchesProvaveis({
    vinculosHumanos: [
      { planilhaId: 'fluxo::p1', bancoId: 'b1' },
      { planilhaId: 'fluxo::p2', bancoId: 'b2' },
    ],
    segurosSugeridos: [
      { planilhaId: 'fluxo::p1', bancoId: 'b1' },
      { planilhaId: 'fluxo::p2', bancoId: 'b-errado' },
    ],
  });
  assert.equal(relatorio.total_vinculos_humanos, 2);
  assert.equal(relatorio.seguros_sugeridos, 2);
  assert.equal(relatorio.acertos, 1);
  assert.equal(relatorio.falsos_positivos, 1);
  assert.equal(relatorio.precisao_pct, 50);
  assert.equal(JSON.stringify(relatorio).includes('p1'), false);
});

test('replay detecta colisões de banco entre sugestões seguras', () => {
  const relatorio = avaliarReplayMatchesProvaveis({
    vinculosHumanos: [],
    segurosSugeridos: [
      { planilhaId: 'fluxo::p1', bancoId: 'b1' },
      { planilhaId: 'fluxo::p2', bancoId: 'b1' },
    ],
  });
  assert.equal(relatorio.colisoes, 1);
});
