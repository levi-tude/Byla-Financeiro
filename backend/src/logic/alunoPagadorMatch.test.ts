import { describe, it } from 'node:test';
import assert from 'node:assert';
import { enriquecerPlanilhaComPagadoresAprendidos } from './alunoPagadorMatch.js';
import type { PlanilhaItem } from './conciliacaoPagamentoMatch.js';

const base: PlanilhaItem = {
  id: 'fluxo::1',
  aba: 'PILATES',
  modalidade: 'Pilates',
  aluno: 'Maria Silva',
  linha: 1,
  data: '2026-04-10',
  forma: 'PIX',
  valor: 250,
  mesCompetencia: 4,
  anoCompetencia: 2026,
  responsaveis: [],
};

describe('enriquecerPlanilhaComPagadoresAprendidos', () => {
  it('injeta pagador aprendido no mês anterior', () => {
    const out = enriquecerPlanilhaComPagadoresAprendidos(base, [
      {
        aluno_normalizado: 'MARIA SILVA',
        pessoa_banco_normalizada: 'maria costa',
        pessoa_banco_exibicao: 'Maria Costa',
      },
    ]);
    assert.ok(out.responsaveis.includes('Maria Costa'));
    assert.strictEqual(out.pagadorPix, 'Maria Costa');
  });

  it('não altera se não houver regra', () => {
    const out = enriquecerPlanilhaComPagadoresAprendidos(base, []);
    assert.deepStrictEqual(out, base);
  });
});
