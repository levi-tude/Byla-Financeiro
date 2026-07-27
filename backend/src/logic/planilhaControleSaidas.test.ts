/**
 * Parser de saídas do CONTROLE — valores vs rótulos com dígitos.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  inferRotuloEValorLinha,
  parseValor,
} from './planilhaControleSaidas.js';

describe('parseValor', () => {
  it('aceita moeda BR e número simples', () => {
    assert.strictEqual(parseValor('R$ 877,00'), 877);
    assert.strictEqual(parseValor('1.234,56'), 1234.56);
    assert.strictEqual(parseValor('100'), 100);
    assert.strictEqual(parseValor('(50,00)'), -50);
  });

  it('rejeita rótulo com dígitos (ex.: 13º Nilson)', () => {
    assert.strictEqual(parseValor('13º Nilson'), null);
    assert.strictEqual(parseValor('13ºNilson'), null);
    assert.strictEqual(parseValor('2x mensalidade'), null);
  });
});

describe('inferRotuloEValorLinha', () => {
  it('não usa 13º como valor; pega a célula de moeda', () => {
    const r = inferRotuloEValorLinha(['13º Nilson', 'R$ 877,00']);
    assert.ok(r);
    assert.strictEqual(r!.label, '13º Nilson');
    assert.strictEqual(r!.value, 877);
  });

  it('linha com rótulo à esquerda e valor à direita', () => {
    const r = inferRotuloEValorLinha(['Água', '', 'R$ 80,00']);
    assert.ok(r);
    assert.strictEqual(r!.label, 'Água');
    assert.strictEqual(r!.value, 80);
  });
});
