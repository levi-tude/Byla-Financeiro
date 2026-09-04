import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alunoNormKey } from '../logic/alunoPagadorMatch.js';
import {
  analisarCasamentoOrfaosPorDataValor,
  buildStickyPagadorIndex,
} from '../logic/vinculosOrfaosHeuristica.js';
import { planRecuperarOrfaosHeuristica } from './recuperarVinculosOrfaosFluxo.js';

test('planRecuperarOrfaosHeuristica: remap 1:1 inequívoco para planilha_id novo', () => {
  const plan = planRecuperarOrfaosHeuristica({
    orfaos: [
      {
        planilha_id: 'fluxo::old-uuid-demo',
        data_ref: '2026-05-04',
        valor: 250,
        pessoa_banco: 'Pagador Demo',
      },
    ],
    pagamentosLivres: [
      {
        id: 'new-uuid-demo',
        alunoKey: 'pilates|4|aluno demo silva',
        alunoNorm: alunoNormKey('Aluno Demo Silva'),
        data_pagamento: '2026-05-04',
        valor: 250,
      },
      {
        id: 'outro',
        alunoKey: 'yoga|1|outra demo',
        alunoNorm: alunoNormKey('Outra Demo'),
        data_pagamento: '2026-05-10',
        valor: 180,
      },
    ],
  });

  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0]?.oldPlanilhaId, 'fluxo::old-uuid-demo');
  assert.equal(plan.updates[0]?.newPlanilhaId, 'fluxo::new-uuid-demo');
  assert.equal(plan.ambiguosIgnorados, 0);
  assert.equal(plan.semCandidato, 0);
});

test('planRecuperarOrfaosHeuristica: ambíguo N→1 não remapeia', () => {
  const plan = planRecuperarOrfaosHeuristica({
    orfaos: [
      { planilha_id: 'fluxo::old-a', data_ref: '2026-05-04', valor: 250 },
      { planilha_id: 'fluxo::old-b', data_ref: '2026-05-05', valor: 250 },
    ],
    pagamentosLivres: [
      {
        id: 'shared',
        alunoKey: 'pilates|1|aluno a',
        alunoNorm: alunoNormKey('Aluno A'),
        data_pagamento: '2026-05-04',
        valor: 250,
      },
    ],
  });

  assert.equal(plan.updates.length, 0);
  assert.ok(plan.ambiguosIgnorados >= 1);
});

test('analisarCasamentoOrfaosPorDataValor: conta semCandidato', () => {
  const r = analisarCasamentoOrfaosPorDataValor({
    orfaos: [{ planilha_id: 'fluxo::solo', data_ref: '2026-01-01', valor: 99 }],
    pagamentos: [
      {
        id: 'x',
        alunoKey: 'yoga|1|x',
        alunoNorm: alunoNormKey('X'),
        data_pagamento: '2026-06-01',
        valor: 200,
      },
    ],
  });
  assert.equal(r.matches.length, 0);
  assert.equal(r.semCandidato, 1);
  assert.equal(r.ambiguosIgnorados, 0);
});
