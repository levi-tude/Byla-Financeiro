import { describe, it } from 'node:test';
import assert from 'node:assert';
import { melhorMatchControle } from './matchSaidaControle.js';

const linhas = [
  { titulo: 'Saídas Parceiros', label: 'Pilates Mari', valor: 0 },
  { titulo: 'Saídas Fixas', label: 'Energia', valor: 200 },
  { titulo: 'Saídas Fixas', label: 'Telefone / Internet', valor: 0 },
  { titulo: 'Saídas Fixas', label: 'Seguros', valor: 0 },
];

describe('melhorMatchControle', () => {
  it('prioriza linha com nome compatível (estilo conciliação)', () => {
    const hay = 'MARINA DE MELO RODRIGUES PIX';
    const r = melhorMatchControle(linhas, 'MARINA DE MELO RODRIGUES', 'PIX', 100, hay);
    assert.ok(r);
    assert.ok(r!.linha.label.includes('Pilates'));
    assert.ok(r!.score >= 0.38);
  });

  it('ENEL casa com linha Energia', () => {
    const hay = 'ENEL DISTRIBUICAO FATURA';
    const r = melhorMatchControle(linhas, 'ENEL', 'Fatura', 200, hay);
    assert.ok(r);
    assert.ok(r!.linha.label.includes('Energia'));
  });

  it('Telefônica casa com linha telecom', () => {
    const hay = 'TELEFONICA BRASIL S A';
    const r = melhorMatchControle(linhas, 'TELEFONICA BRASIL S A', 'Mensalidade', 99, hay);
    assert.ok(r);
    assert.ok(r!.linha.label.includes('Telefone') || r!.linha.label.includes('Internet'));
  });
});
