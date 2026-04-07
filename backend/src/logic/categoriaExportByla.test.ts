import test from 'node:test';
import assert from 'node:assert/strict';
import { classificarTransacaoParaPlanilha } from './categoriaExportByla.js';

test('precedencia: mapeamento_manual vence demais regras', () => {
  const r = classificarTransacaoParaPlanilha({
    id: '1',
    data: '2026-03-10',
    tipo: 'entrada',
    valor: 100,
    pessoa: 'X',
    descricao: null,
    categoria_sugerida: 'Manual Categoria',
    subcategoria_sugerida: 'Manual Sub',
    modalidade: null,
    nome_aluno: null,
    origem_categoria: 'mapeamento_manual',
  });
  assert.equal(r.categoria, 'Manual Categoria');
  assert.equal(r.subcategoria, 'Manual Sub');
  assert.equal(r.origem_classificacao, 'mapeamento_manual');
  assert.equal(r.referencia_negocio, 'Manual Sub');
});

test('match mensalidade/cadastro gera 2 niveis e referencia de aluno', () => {
  const r = classificarTransacaoParaPlanilha({
    id: '2',
    data: '2026-03-11',
    tipo: 'entrada',
    valor: 250,
    pessoa: 'Aluno',
    descricao: 'mensalidade',
    categoria_sugerida: 'A classificar',
    subcategoria_sugerida: '',
    modalidade: 'Pilates',
    nome_aluno: 'Fulano',
    origem_categoria: 'cadastro_mensalidade',
  });
  assert.equal(r.referencia_negocio, 'Fulano');
  assert.equal(r.categoria, 'Receita');
  assert.equal(r.subcategoria, 'Mensalidade - Pilates');
  assert.equal(r.origem_classificacao, 'cadastro_mensalidade');
});

test('regras financeiras: saída de funcionário vira pagamento de professor', () => {
  const r = classificarTransacaoParaPlanilha({
    id: '3',
    data: '2026-03-12',
    tipo: 'saida',
    valor: 800,
    pessoa: 'Samuel Davi Tude',
    descricao: 'PIX',
    categoria_sugerida: 'A classificar',
    subcategoria_sugerida: '',
    modalidade: null,
    nome_aluno: null,
    origem_categoria: 'fallback',
  });
  assert.equal(r.referencia_negocio, 'Samuel');
  assert.equal(r.categoria, 'Despesa');
  assert.equal(r.subcategoria, 'Pagamento de professor/funcionário');
  assert.equal(r.origem_classificacao, 'match_funcionario_byla');
});

test('fallback: sem match fica A classificar', () => {
  const r = classificarTransacaoParaPlanilha({
    id: '4',
    data: '2026-03-13',
    tipo: 'entrada',
    valor: 195,
    pessoa: 'Adriana Silva Nico',
    descricao: 'Adriana Silva Nico',
    categoria_sugerida: 'A classificar',
    subcategoria_sugerida: '',
    modalidade: null,
    nome_aluno: null,
    origem_categoria: 'fallback',
  });
  assert.equal(r.categoria, 'A classificar');
  assert.equal(r.subcategoria, 'Adriana Silva Nico');
  assert.equal(r.referencia_negocio, 'Adriana Silva Nico');
  assert.equal(r.origem_classificacao, 'fallback');
});
