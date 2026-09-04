import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  analisarCasamentoOrfaosPorDataValor,
  buildStickyPagadorIndex,
  casarVinculosOrfaosPorDataValor,
} from './vinculosOrfaosHeuristica.js';
import { alunoNormKey } from './alunoPagadorMatch.js';

test('casa órfão 1:1 por data±1 e valor', () => {
  const matches = casarVinculosOrfaosPorDataValor({
    orfaos: [
      {
        planilha_id: 'fluxo::old-demo',
        data_ref: '2026-05-04',
        valor: 250,
        pessoa_banco: 'Pagador Demo',
      },
    ],
    pagamentos: [
      {
        id: 'new-demo',
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

  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.newPagamentoId, 'new-demo');
  assert.equal(matches[0]?.alunoKey, 'pilates|4|aluno demo silva');
  assert.equal(matches[0]?.pessoa_banco, 'Pagador Demo');
});

test('não casa quando dois pagamentos competem pelo mesmo órfão', () => {
  const matches = casarVinculosOrfaosPorDataValor({
    orfaos: [{ planilha_id: 'fluxo::old', data_ref: '2026-05-04', valor: 250 }],
    pagamentos: [
      { id: 'a', alunoKey: 'pilates|1|a', alunoNorm: 'a', data_pagamento: '2026-05-04', valor: 250 },
      { id: 'b', alunoKey: 'pilates|2|b', alunoNorm: 'b', data_pagamento: '2026-05-05', valor: 250 },
    ],
  });
  assert.equal(matches.length, 0);
});

test('não casa quando dois órfãos competem pelo mesmo pagamento', () => {
  const matches = casarVinculosOrfaosPorDataValor({
    orfaos: [
      { planilha_id: 'fluxo::old-1', data_ref: '2026-05-04', valor: 250 },
      { planilha_id: 'fluxo::old-2', data_ref: '2026-05-05', valor: 250 },
    ],
    pagamentos: [
      { id: 'a', alunoKey: 'pilates|1|a', alunoNorm: 'a', data_pagamento: '2026-05-04', valor: 250 },
    ],
  });
  assert.equal(matches.length, 0);
});

test('sticky desambigua dois pagamentos mesmo valor/data', () => {
  const sticky = buildStickyPagadorIndex([
    {
      pessoa_banco_normalizada: 'pagador demo',
      aluno_normalizado: alunoNormKey('Aluno Demo A'),
    },
  ]);
  const r = analisarCasamentoOrfaosPorDataValor({
    orfaos: [
      {
        planilha_id: 'fluxo::old',
        data_ref: '2026-05-04',
        valor: 250,
        pessoa_banco: 'Pagador Demo',
      },
    ],
    pagamentos: [
      {
        id: 'a',
        alunoKey: 'pilates|1|aluno demo a',
        alunoNorm: alunoNormKey('Aluno Demo A'),
        data_pagamento: '2026-05-04',
        valor: 250,
      },
      {
        id: 'b',
        alunoKey: 'pilates|2|aluno demo b',
        alunoNorm: alunoNormKey('Aluno Demo B'),
        data_pagamento: '2026-05-04',
        valor: 250,
      },
    ],
    stickyPagadorIndex: sticky,
  });
  assert.equal(r.matches.length, 1);
  assert.equal(r.matches[0]?.newPagamentoId, 'a');
  assert.equal(r.ambiguosIgnorados, 0);
});

test('sticky amplia janela de data quando valor bate', () => {
  const sticky = buildStickyPagadorIndex([
    {
      pessoa_banco_normalizada: 'pagador demo',
      aluno_normalizado: alunoNormKey('Aluno Demo A'),
    },
  ]);
  const r = analisarCasamentoOrfaosPorDataValor({
    orfaos: [
      {
        planilha_id: 'fluxo::old',
        data_ref: '2026-05-04',
        valor: 250,
        pessoa_banco: 'Pagador Demo',
      },
    ],
    pagamentos: [
      {
        id: 'a',
        alunoKey: 'pilates|1|aluno demo a',
        alunoNorm: alunoNormKey('Aluno Demo A'),
        data_pagamento: '2026-05-10',
        valor: 250,
      },
    ],
    stickyPagadorIndex: sticky,
  });
  assert.equal(r.matches.length, 1);
  assert.equal(r.matches[0]?.newPagamentoId, 'a');
});
