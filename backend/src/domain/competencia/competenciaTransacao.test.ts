import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addMonthsComp,
  competenciaAlinhaData,
  detectDuplicatasCompetencia,
  suggestCompetenciaDespesa,
  suggestCompetenciaEntrada,
} from './competenciaTransacao.js';

describe('competenciaTransacao', () => {
  it('suggestCompetenciaEntrada usa fluxo quando presente', () => {
    const r = suggestCompetenciaEntrada('2026-03-28', 4, 2026);
    assert.equal(r.efetiva.mes, 4);
    assert.equal(r.origem, 'validacao_fluxo');
  });

  it('suggestCompetenciaDespesa repasse dia 5 sugere mês anterior', () => {
    const r = suggestCompetenciaDespesa('2026-02-05', true);
    assert.equal(r.efetiva.mes, 1);
    assert.equal(r.efetiva.ano, 2026);
    assert.equal(r.origem, 'heuristica_repasso');
  });

  it('detectDuplicatasCompetencia marca ids repetidos', () => {
    const d = detectDuplicatasCompetencia([
      { id: 'a', pessoaNorm: 'joao', mes: 3, ano: 2026 },
      { id: 'b', pessoaNorm: 'joao', mes: 3, ano: 2026 },
      { id: 'c', pessoaNorm: 'maria', mes: 3, ano: 2026 },
    ]);
    assert.equal(d.has('a'), true);
    assert.equal(d.has('b'), true);
    assert.equal(d.has('c'), false);
  });

  it('competenciaAlinhaData', () => {
    assert.equal(competenciaAlinhaData('2026-03-05', 3, 2026), true);
    assert.equal(competenciaAlinhaData('2026-03-05', 4, 2026), false);
  });

  it('addMonthsComp', () => {
    assert.deepEqual(addMonthsComp(1, 2026, -1), { mes: 12, ano: 2025 });
  });
});
