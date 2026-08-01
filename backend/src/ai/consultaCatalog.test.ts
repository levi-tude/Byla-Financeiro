import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CONSULTA_MENU,
  extractAlunoNome,
  extractValorBrl,
  parseMonthYearContext,
  resolveConsultaIntent,
} from './consultaCatalog.js';

describe('parseMonthYearContext', () => {
  it('aceita MM/YYYY e YYYY-MM', () => {
    assert.deepEqual(parseMonthYearContext('07/2026'), { mes: 7, ano: 2026 });
    assert.deepEqual(parseMonthYearContext('2026-07'), { mes: 7, ano: 2026 });
  });

  it('rejeita inválido', () => {
    assert.equal(parseMonthYearContext('foo'), null);
    assert.equal(parseMonthYearContext('13/2026'), null);
  });
});

describe('resolveConsultaIntent menu', () => {
  for (const item of CONSULTA_MENU) {
    it(`menu "${item.label}" → ${item.tool}`, () => {
      const r = resolveConsultaIntent(item.label, new Date('2026-07-31T12:00:00'));
      assert.ok(r);
      assert.equal(r!.tool, item.tool);
      assert.equal(r!.source, 'menu');
    });
  }
});

describe('resolveConsultaIntent keywords', () => {
  it('busca aluno', () => {
    const r = resolveConsultaIntent('situação do aluno Ana Clara');
    assert.ok(r);
    assert.equal(r!.tool, 'busca_aluno');
    assert.equal(r!.params.nome, 'Ana Clara');
  });

  it('busca valor', () => {
    const r = resolveConsultaIntent('tem lançamento de R$ 250,00?');
    assert.ok(r);
    assert.equal(r!.tool, 'busca_por_valor');
    assert.equal(r!.params.valor, '250');
  });

  it('fora do catálogo', () => {
    assert.equal(resolveConsultaIntent('me conta uma piada'), null);
  });

  it('periodo iso', () => {
    const r = resolveConsultaIntent('resumo 2026-07-01 a 2026-07-15');
    assert.ok(r);
    assert.equal(r!.tool, 'resumo_periodo');
    assert.equal(r!.params.inicio, '2026-07-01');
    assert.equal(r!.params.fim, '2026-07-15');
  });
});

describe('extract helpers', () => {
  it('extractValorBrl', () => {
    assert.equal(extractValorBrl('R$ 1.250,50'), 1250.5);
  });

  it('extractAlunoNome', () => {
    assert.equal(extractAlunoNome('como está o aluno Pedro Souza?'), 'Pedro Souza');
  });
});
