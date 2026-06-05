import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  parseCategoriaControleFiltro,
  transacaoPassaFiltroCategoriaControle,
  type ClassificacaoTransacao,
} from './transacoesClassificacaoMap.js';

describe('parseCategoriaControleFiltro', () => {
  it('aceita pendente e chaves prefixadas', () => {
    assert.strictEqual(parseCategoriaControleFiltro(''), null);
    assert.strictEqual(parseCategoriaControleFiltro('_pendente'), '_pendente');
    assert.strictEqual(parseCategoriaControleFiltro('entrada::parceiro_x'), 'entrada::parceiro_x');
    assert.strictEqual(parseCategoriaControleFiltro('saida::fixa_y'), 'saida::fixa_y');
    assert.strictEqual(parseCategoriaControleFiltro('entrada::bloco:entrada_aluguel_coworking'), 'entrada::bloco:entrada_aluguel_coworking');
  });

  it('rejeita formato inválido', () => {
    assert.strictEqual(parseCategoriaControleFiltro('entrada:'), null);
    assert.strictEqual(parseCategoriaControleFiltro('foo::bar'), null);
  });
});

describe('transacaoPassaFiltroCategoriaControle', () => {
  const map = new Map<string, ClassificacaoTransacao>([
    ['e1', { template_key: 'entrada_a', categoria_label: 'Parceiro A', bloco_template_key: 'entrada_parceiros', classificado: true }],
    ['e2', { template_key: null, categoria_label: null, bloco_template_key: null, classificado: false }],
    ['s1', { template_key: 'saida_b', categoria_label: 'Fixa B', bloco_template_key: 'saida_gastos_fixos', classificado: true }],
    ['s2', { template_key: 'saida_c', categoria_label: 'Fixa C', bloco_template_key: 'saida_gastos_fixos', classificado: true }],
  ]);

  it('sem filtro passa tudo', () => {
    assert.strictEqual(transacaoPassaFiltroCategoriaControle({ id: 'e2', tipo: 'entrada' }, null, map), true);
  });

  it('filtra pendente', () => {
    assert.strictEqual(
      transacaoPassaFiltroCategoriaControle({ id: 'e2', tipo: 'entrada' }, '_pendente', map),
      true,
    );
    assert.strictEqual(
      transacaoPassaFiltroCategoriaControle({ id: 'e1', tipo: 'entrada' }, '_pendente', map),
      false,
    );
  });

  it('filtra por template_key e família', () => {
    assert.strictEqual(
      transacaoPassaFiltroCategoriaControle({ id: 'e1', tipo: 'entrada' }, 'entrada::entrada_a', map),
      true,
    );
    assert.strictEqual(
      transacaoPassaFiltroCategoriaControle({ id: 'e1', tipo: 'entrada' }, 'saida::entrada_a', map),
      false,
    );
    assert.strictEqual(
      transacaoPassaFiltroCategoriaControle({ id: 's1', tipo: 'saida' }, 'saida::saida_b', map),
      true,
    );
  });

  it('filtra por bloco inteiro', () => {
    assert.strictEqual(
      transacaoPassaFiltroCategoriaControle({ id: 's1', tipo: 'saida' }, 'saida::bloco:saida_gastos_fixos', map),
      true,
    );
    assert.strictEqual(
      transacaoPassaFiltroCategoriaControle({ id: 's2', tipo: 'saida' }, 'saida::bloco:saida_gastos_fixos', map),
      true,
    );
    assert.strictEqual(
      transacaoPassaFiltroCategoriaControle({ id: 'e1', tipo: 'entrada' }, 'entrada::bloco:entrada_parceiros', map),
      true,
    );
    assert.strictEqual(
      transacaoPassaFiltroCategoriaControle({ id: 's1', tipo: 'saida' }, 'saida::bloco:entrada_parceiros', map),
      false,
    );
  });
});
