import { describe, it } from 'node:test';
import assert from 'node:assert';
import { findPagamentoDuplicado, isMesmoLancamentoFluxo } from './fluxoPagamentoDedupe.js';

const base = {
  aba: 'TEATRO',
  modalidade: 'TEATRO PROF JOÃO',
  linha_planilha: 8,
  data_pagamento: '2026-07-10',
  valor: 210,
  mes_competencia: 7,
  ano_competencia: 2026,
};

describe('isMesmoLancamentoFluxo', () => {
  it('trata mesmo lançamento mesmo com grafia/forma irrelevantes no candidato', () => {
    assert.equal(
      isMesmoLancamentoFluxo(base, {
        ...base,
        data_pagamento: '2026-07-10T00:00:00.000Z',
      }),
      true,
    );
  });

  it('não agrupa se valor ou dia diferem', () => {
    assert.equal(isMesmoLancamentoFluxo(base, { ...base, valor: 211 }), false);
    assert.equal(isMesmoLancamentoFluxo(base, { ...base, data_pagamento: '2026-07-11' }), false);
  });

  it('não agrupa modalidades/linhas diferentes (duas atividades no mesmo dia)', () => {
    assert.equal(isMesmoLancamentoFluxo(base, { ...base, modalidade: 'OUTRA' }), false);
    assert.equal(isMesmoLancamentoFluxo(base, { ...base, linha_planilha: 9 }), false);
  });
});

describe('findPagamentoDuplicado', () => {
  it('acha duplicata independente do nome/forma (grafia antiga vs nova)', () => {
    const existentes = [
      {
        id: 'old-row',
        ...base,
      },
    ];
    const hit = findPagamentoDuplicado(existentes, { ...base });
    assert.ok(hit);
    assert.equal(hit!.id, 'old-row');
  });

  it('ignora o próprio id no update', () => {
    const existentes = [{ id: 'self', ...base }];
    assert.equal(findPagamentoDuplicado(existentes, base, 'self'), null);
  });
});
