import assert from 'node:assert/strict';
import test from 'node:test';
import { avaliarReplayClassificacao } from './classificacaoReplay.js';

test('replay mede cobertura e bloqueia falsa confiança visível no relatório', () => {
  const report = avaliarReplayClassificacao([
    {
      esperado: 'energia',
      sugestao: { template_key: 'energia', pode_confirmar: true, confianca: 'alta' },
    },
    {
      esperado: 'agua',
      sugestao: { template_key: 'energia', pode_confirmar: true, confianca: 'alta' },
    },
    { esperado: 'aluguel', sugestao: null },
  ]);

  assert.equal(report.totalConfirmados, 3);
  assert.equal(report.comSugestao, 2);
  assert.equal(report.elegiveisIncorretas, 1);
  assert.equal(report.precisaoConfirmacaoPct, 50);
});
