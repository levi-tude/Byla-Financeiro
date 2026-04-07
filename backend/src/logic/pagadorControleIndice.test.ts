import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  matchPagadorABanco,
  encontrarLinhaTeatroControleUnificada,
  encontrarLinhaPilatesMariControle,
} from './pagadorControleIndice.js';

describe('matchPagadorABanco', () => {
  it('compatível com isNameCompatible', () => {
    assert.strictEqual(matchPagadorABanco(['Carlos Silva'], 'CARLOS SILVA PIX', null), true);
    assert.strictEqual(matchPagadorABanco(['Outro'], 'NINGUEM', null), false);
  });
});

describe('encontrarLinhaTeatroControleUnificada', () => {
  it('primeira linha com TEATRO (junta Teatro e Teatro Infantil)', () => {
    const linhas = [
      { titulo: 'P', label: 'Outra', valor: 0 },
      { titulo: 'Parceiros', label: 'Teatro Infantil', valor: 0 },
      { titulo: 'Parceiros', label: 'Teatro', valor: 0 },
    ];
    const hit = encontrarLinhaTeatroControleUnificada(linhas);
    assert.strictEqual(hit?.label, 'Teatro Infantil');
  });
});

describe('encontrarLinhaPilatesMariControle', () => {
  it('encontra Pilates Mari / Marina', () => {
    const linhas = [{ titulo: 'P', label: 'Pilates Mari', valor: 0 }];
    assert.strictEqual(encontrarLinhaPilatesMariControle(linhas)?.label, 'Pilates Mari');
  });
});
