import assert from 'node:assert/strict';
import test from 'node:test';
import { planAlunosSoInserir, planPagamentosSoInserir } from './syncFluxoSoInserirPlan.js';

const base = {
  aluno_nome: 'Aluna Fictícia',
  modalidade: 'Modalidade Teste',
  data_pagamento: '2026-03-05',
  valor: 100,
  mes_competencia: 3,
  ano_competencia: 2026,
};

test('pagamento igual pelo conteúdo é pulado mesmo em outra linha/acentuação', () => {
  const plan = planPagamentosSoInserir(
    [{ ...base, linha: 99 }],
    [{ ...base, aluno_nome: '  aluna  ficticia ' }],
  );
  assert.equal(plan.inserts.length, 0);
  assert.equal(plan.duplicados, 1);
});

test('competência, valor ou data diferentes viram insert', () => {
  const plan = planPagamentosSoInserir(
    [
      { ...base, mes_competencia: 4 },
      { ...base, valor: 101 },
      { ...base, data_pagamento: '2026-03-06' },
    ],
    [base],
  );
  assert.equal(plan.inserts.length, 3);
});

test('multiconjunto: 2 iguais na planilha e 1 no banco insere só 1', () => {
  const plan = planPagamentosSoInserir([base, base], [base]);
  assert.equal(plan.inserts.length, 1);
  assert.equal(plan.duplicados, 1);
});

test('aluno existente não é reinserido; novo é', () => {
  const plan = planAlunosSoInserir(
    [
      { aba: 'ABA X', modalidade: 'M', aluno_nome: 'Pessoa Teste' },
      { aba: 'ABA X', modalidade: 'M', aluno_nome: 'Pessoa Nova' },
    ],
    [{ aba: 'aba x', modalidade: 'm', aluno_nome: 'PESSOA TESTE' }],
  );
  assert.deepEqual(plan.inserts.map((a) => a.aluno_nome), ['Pessoa Nova']);
});
