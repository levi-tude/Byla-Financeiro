import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  parseCategoriaControleFiltro,
  parseCategoriasControleFiltro,
  transacaoPassaFiltroCategoriaControle,
  transacaoPassaFiltroCategorias,
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

describe('parseCategoriasControleFiltro', () => {
  it('sem valor retorna filtro nulo', () => {
    assert.deepStrictEqual(parseCategoriasControleFiltro(undefined, undefined, 'incluir'), { ok: true, filtro: null });
    assert.deepStrictEqual(parseCategoriasControleFiltro('', '', 'excluir'), { ok: true, filtro: null });
  });

  it('aceita lista separada por vírgula e remove duplicados', () => {
    const r = parseCategoriasControleFiltro('entrada::a,_pendente,entrada::a', undefined, 'excluir');
    assert.deepStrictEqual(r, { ok: true, filtro: { modo: 'excluir', itens: ['entrada::a', '_pendente'] } });
  });

  it('usa o param legado `categoria` quando a lista está vazia', () => {
    const r = parseCategoriasControleFiltro(undefined, 'saida::bloco:saida_gastos_fixos', 'incluir');
    assert.deepStrictEqual(r, {
      ok: true,
      filtro: { modo: 'incluir', itens: ['saida::bloco:saida_gastos_fixos'] },
    });
  });

  it('rejeita item inválido na lista', () => {
    assert.deepStrictEqual(parseCategoriasControleFiltro('entrada::a,foo::bar', undefined, 'incluir'), { ok: false });
  });
});

describe('transacaoPassaFiltroCategorias', () => {
  const map = new Map<string, ClassificacaoTransacao>([
    ['e1', { template_key: 'entrada_aluguel', categoria_label: 'Aluguel', bloco_template_key: 'entrada_aluguel_coworking', classificado: true }],
    ['e2', { template_key: 'entrada_a', categoria_label: 'Parceiro A', bloco_template_key: 'entrada_parceiros', classificado: true }],
    ['e3', { template_key: null, categoria_label: null, bloco_template_key: null, classificado: false }],
  ]);

  it('modo incluir aceita qualquer item da lista', () => {
    const filtro = { modo: 'incluir' as const, itens: ['entrada::entrada_a', 'entrada::entrada_aluguel'] };
    assert.strictEqual(transacaoPassaFiltroCategorias({ id: 'e1', tipo: 'entrada' }, filtro, map), true);
    assert.strictEqual(transacaoPassaFiltroCategorias({ id: 'e2', tipo: 'entrada' }, filtro, map), true);
    assert.strictEqual(transacaoPassaFiltroCategorias({ id: 'e3', tipo: 'entrada' }, filtro, map), false);
  });

  it('modo excluir mostra tudo menos os itens (caso da gestora: tudo menos aluguel)', () => {
    const filtro = { modo: 'excluir' as const, itens: ['entrada::bloco:entrada_aluguel_coworking'] };
    assert.strictEqual(transacaoPassaFiltroCategorias({ id: 'e1', tipo: 'entrada' }, filtro, map), false);
    assert.strictEqual(transacaoPassaFiltroCategorias({ id: 'e2', tipo: 'entrada' }, filtro, map), true);
    // pendente continua visível (não é aluguel)
    assert.strictEqual(transacaoPassaFiltroCategorias({ id: 'e3', tipo: 'entrada' }, filtro, map), true);
  });

  it('modo excluir com _pendente esconde também as sem categoria', () => {
    const filtro = {
      modo: 'excluir' as const,
      itens: ['entrada::bloco:entrada_aluguel_coworking', '_pendente'],
    };
    assert.strictEqual(transacaoPassaFiltroCategorias({ id: 'e3', tipo: 'entrada' }, filtro, map), false);
    assert.strictEqual(transacaoPassaFiltroCategorias({ id: 'e2', tipo: 'entrada' }, filtro, map), true);
  });

  it('filtro vazio passa tudo', () => {
    assert.strictEqual(transacaoPassaFiltroCategorias({ id: 'e3', tipo: 'entrada' }, null, map), true);
    assert.strictEqual(
      transacaoPassaFiltroCategorias({ id: 'e3', tipo: 'entrada' }, { modo: 'incluir', itens: [] }, map),
      true,
    );
  });
});
