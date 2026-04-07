import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extrairBlocosSaidasPorDescobertaColunas } from './planilhaControleDescobertaColunas.js';

describe('extrairBlocosSaidasPorDescobertaColunas', () => {
  it('descobre SAÍDAS PARCEIROS e SAÍDAS FIXAS no cabeçalho (layout tipo ABRIL 26)', () => {
    const values = [
      ['ENTRADAS PARCEIROS', '', 'ENTRADAS ALUGUEL', '', 'SAÍDAS PARCEIROS', '', 'SAÍDAS FIXAS'],
      ['Dança', '100', 'x', '200', 'Dança', '300', 'Energia', '50'],
      ['Yoga', '10', '', '', 'Yoga', '20', 'Água', '5'],
    ];
    const blocos = extrairBlocosSaidasPorDescobertaColunas(values);
    assert.ok(blocos.length >= 2);
    const parc = blocos.find((b) => b.titulo.includes('Parceiros'));
    const fix = blocos.find((b) => b.titulo.includes('Fixas'));
    assert.ok(parc?.linhas.some((l) => l.label.includes('Dança')));
    assert.ok(fix?.linhas.some((l) => l.label.includes('Energia')));
  });
});
