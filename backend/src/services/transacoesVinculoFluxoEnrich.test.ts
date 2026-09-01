import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatVinculoFluxoLabel } from './transacoesVinculoFluxoEnrich.js';

describe('formatVinculoFluxoLabel', () => {
  it('um aluno e uma modalidade', () => {
    assert.equal(formatVinculoFluxoLabel(['Aluno Demo'], ['Pilates']), 'Aluno Demo · Pilates');
  });

  it('um aluno sem modalidade', () => {
    assert.equal(formatVinculoFluxoLabel(['Aluno Demo'], []), 'Aluno Demo');
  });

  it('dois alunos distintos', () => {
    assert.equal(
      formatVinculoFluxoLabel(['Aluno A', 'Aluno B'], ['Dança', 'Yoga']),
      'Aluno A, Aluno B',
    );
  });

  it('vazio', () => {
    assert.equal(formatVinculoFluxoLabel([], []), '');
  });
});
