import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getLimiteAtivosParaAba, parsearAbaEmBlocos } from './parsePlanilhaPorBlocos.js';

describe('parsePlanilhaPorBlocos — BYLA DANÇA', () => {
  it('linhaLimiteAtivos inclui bloco Jazz (após linha 81)', () => {
    assert.equal(getLimiteAtivosParaAba('BYLA DANÇA'), 92);
  });

  it('alunos Jazz nas linhas 84+ são ativos', () => {
    const values: string[][] = [];
    for (let i = 0; i < 82; i++) values.push(['']);
    values.push(['JAZZ INICIANTE PRO NALUH TER E QUI 19:00 JUVENIL/ADULTO']);
    values.push(['ALUNO', 'WPP', 'VALOR']);
    values.push(['SARA TESTE', '', '135']);

    const parsed = parsearAbaEmBlocos(values, 'BYLA DANÇA', 92);
    const jazz = parsed.find((p) => p.linha1Based === 85);
    assert.ok(jazz);
    assert.equal(jazz!.ativo, true);
    assert.match(jazz!.modalidade, /JAZZ/i);
  });
});
