import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cicloAtualDoPlano,
  competenciaNoCicloAtual,
  parseMatriculaCompetencia,
  previstosVirtuaisDoCiclo,
  resolverPlanoCiclo,
} from './planoCicloPrevisto.js';

test('parseMatriculaCompetencia: ISO, BR e inválidos', () => {
  assert.deepEqual(parseMatriculaCompetencia('2026-03-15'), { ano: 2026, mes: 3 });
  assert.deepEqual(parseMatriculaCompetencia('15/03/2026'), { ano: 2026, mes: 3 });
  assert.deepEqual(parseMatriculaCompetencia('03/2026'), { ano: 2026, mes: 3 });
  assert.deepEqual(parseMatriculaCompetencia('2026-03'), { ano: 2026, mes: 3 });
  assert.equal(parseMatriculaCompetencia(''), null);
  assert.equal(parseMatriculaCompetencia('abc'), null);
  assert.equal(parseMatriculaCompetencia(null), null);
});

test('resolverPlanoCiclo: trimestral/semestral/mensal', () => {
  assert.equal(resolverPlanoCiclo('Trimestral').tipo, 'trimestral');
  assert.equal(resolverPlanoCiclo('Trimestral').N, 3);
  assert.equal(resolverPlanoCiclo('SEMESTRAL').tipo, 'semestral');
  assert.equal(resolverPlanoCiclo('SEMESTRAL').N, 6);
  assert.equal(resolverPlanoCiclo('Mensal').tipo, 'mensal');
  assert.equal(resolverPlanoCiclo(null).tipo, 'mensal');
});

test('trimestral ~5 meses desde matrícula → 2º ciclo (offsets 3,4,5)', () => {
  // Ingresso mar/2026; referência ago/2026 → monthsElapsed=5; cycleIndex=1
  const ciclo = cicloAtualDoPlano({
    matricula: '15/03/2026',
    plano: 'Trimestral',
    referencia: { ano: 2026, mes: 8 },
  });
  assert.ok(ciclo);
  assert.equal(ciclo!.monthsElapsed, 5);
  assert.equal(ciclo!.cycleIndex, 1);
  assert.deepEqual(ciclo!.offsets, [3, 4, 5]);
  assert.deepEqual(ciclo!.competencias, [
    { ano: 2026, mes: 6 },
    { ano: 2026, mes: 7 },
    { ano: 2026, mes: 8 },
  ]);
});

test('prefill só ciclo atual; mês já lançado não entra como previsto', () => {
  const previstos = previstosVirtuaisDoCiclo({
    matricula: '2026-03-01',
    plano: 'Trimestral',
    referencia: { ano: 2026, mes: 8 },
    lancadasKeys: new Set(['2026-07']),
  });
  assert.deepEqual(previstos, [
    { ano: 2026, mes: 6 },
    { ano: 2026, mes: 8 },
  ]);
  assert.equal(
    competenciaNoCicloAtual({
      matricula: '2026-03-01',
      plano: 'Trimestral',
      referencia: { ano: 2026, mes: 8 },
      alvo: { ano: 2026, mes: 9 },
    }),
    false,
  );
});

test('mensal: sem prefill futuro / ciclo null', () => {
  assert.equal(
    cicloAtualDoPlano({
      matricula: '01/03/2026',
      plano: 'Mensal',
      referencia: { ano: 2026, mes: 8 },
    }),
    null,
  );
  assert.deepEqual(
    previstosVirtuaisDoCiclo({
      matricula: '01/03/2026',
      plano: 'Mensal',
      referencia: { ano: 2026, mes: 8 },
    }),
    [],
  );
});

test('matrícula inválida → sem previstos', () => {
  assert.equal(
    cicloAtualDoPlano({
      matricula: 'sem data',
      plano: 'Trimestral',
      referencia: { ano: 2026, mes: 8 },
    }),
    null,
  );
  assert.deepEqual(
    previstosVirtuaisDoCiclo({
      matricula: '',
      plano: 'Semestral',
      referencia: { ano: 2026, mes: 8 },
    }),
    [],
  );
});

test('semestral: ciclo com N=6', () => {
  // Ingresso jan/2026; referência jul/2026 → elapsed=6; cycleIndex=1 → offsets 6..11
  const ciclo = cicloAtualDoPlano({
    matricula: '2026-01',
    plano: 'Semestral',
    referencia: { ano: 2026, mes: 7 },
  });
  assert.ok(ciclo);
  assert.equal(ciclo!.cycleIndex, 1);
  assert.equal(ciclo!.offsets.length, 6);
  assert.equal(ciclo!.offsets[0], 6);
  assert.equal(ciclo!.competencias[0].mes, 7);
});
