import assert from 'node:assert/strict';
import test from 'node:test';
import { colisoesSemEspaco, planAlunosSoInserir, planPagamentosSoInserir } from './syncFluxoSoInserirPlan.js';

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

test('ignora espaços no nome do aluno: "Nome Teste" == "NOMETESTE"', () => {
  const pag = planPagamentosSoInserir(
    [{ ...base, aluno_nome: 'Nome Teste' }],
    [{ ...base, aluno_nome: 'NOMETESTE' }],
  );
  assert.equal(pag.inserts.length, 0);
  const al = planAlunosSoInserir(
    [{ aba: 'ABA X', modalidade: 'M', aluno_nome: 'Nome Teste' }],
    [{ aba: 'ABA X', modalidade: 'M', aluno_nome: 'NOMETESTE' }],
  );
  assert.equal(al.inserts.length, 0);
});

test('colisoesSemEspaco lista nomes que só se igualam sem espaços, por aba', () => {
  const c = colisoesSemEspaco([
    { aba: 'ABA X', aluno_nome: 'Ana Bela' },
    { aba: 'ABA X', aluno_nome: 'ANABELA' },
    { aba: 'ABA X', aluno_nome: 'ana bela' },
    { aba: 'ABA Y', aluno_nome: 'Ana Bela' },
    { aba: 'ABA X', aluno_nome: 'Outra Pessoa' },
  ]);
  assert.equal(c.length, 1);
  assert.deepEqual(c[0].variacoes, ['ana bela', 'anabela']);
});
