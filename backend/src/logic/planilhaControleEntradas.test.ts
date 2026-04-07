/**
 * Testes da extração de entradas do CONTROLE (sem duplicar com saídas).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  chaveLinhaControleDetalhe,
  extrairBlocosEntradasPorColunasDetectadas,
  extrairBlocosEntradasPorOrdemLinhas,
  filtrarEntradasQueColidemComSaidas,
  mergeEntradasColunaEOrdem,
  tituloBlocoEntradaCabecalho,
} from './planilhaControleEntradas.js';
import type { LinhaPlanilha, SaidaBlocoPlanilha } from '../domain/FluxoPlanilhaTotais.js';

describe('filtrarEntradasQueColidemComSaidas', () => {
  it('remove linha de entrada que coincide com detalhe de saída (rótulo + valor)', () => {
    const entradas: SaidaBlocoPlanilha[] = [
      {
        titulo: 'Entradas',
        linhas: [
          { label: 'Água', valor: '80', valorNum: 80 },
          { label: 'Mensalidade X', valor: '500', valorNum: 500 },
        ],
      },
    ];
    const saidas: SaidaBlocoPlanilha[] = [
      {
        titulo: 'Saídas Fixas',
        linhas: [{ label: 'Água', valor: '80', valorNum: 80 }],
      },
    ];
    const out = filtrarEntradasQueColidemComSaidas(entradas, saidas);
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].linhas.length, 1);
    assert.strictEqual(out[0].linhas[0].label, 'Mensalidade X');
  });
});

describe('mergeEntradasColunaEOrdem', () => {
  it('prefere ordem quando há linhas; coluna só se ordem vazia', () => {
    const porColuna: LinhaPlanilha[][] = [
      [{ label: 'Só na coluna', valor: '10', valorNum: 10 }],
    ];
    const out = mergeEntradasColunaEOrdem(porColuna, []);
    const labels = out.flatMap((b) => b.linhas.map((l) => l.label));
    assert.ok(labels.includes('Só na coluna'));
  });
});

describe('tituloBlocoEntradaCabecalho', () => {
  it('reconhece Entrada Aluguel/Coworking', () => {
    assert.ok(tituloBlocoEntradaCabecalho('Entrada Aluguel / Coworking'));
    assert.ok(tituloBlocoEntradaCabecalho('Receita Aluguel Coworking'));
  });
});

describe('entrada após bloco de saída na mesma aba', () => {
  it('captura linhas sob cabeçalho de entrada depois das saídas', () => {
    const values = [
      ['Mensalidades', ''],
      ['Aluno A', '100'],
      ['SAÍDAS PARCEIROS', ''],
      ['Repasse professor', '50'],
      ['Entrada Aluguel / Coworking', ''],
      ['Sala coworking', '3000'],
    ];
    const out = extrairBlocosEntradasPorOrdemLinhas(values);
    const titulos = out.map((b) => b.titulo);
    assert.ok(titulos.some((t) => t.includes('Aluguel')));
    const linhas = out.flatMap((b) => b.linhas);
    assert.ok(linhas.some((l) => l.label === 'Sala coworking' && l.valorNum === 3000));
    assert.ok(!linhas.some((l) => l.label === 'Repasse professor'));
  });
});

describe('linhas soltas após fechamento do quadro', () => {
  it('não inclui nomes abaixo de Entrada/Saída/Lucro total', () => {
    const values = [
      ['ENTRADAS PARCEIROS', ''],
      ['Dança', '1000'],
      ['', '', 'Entrada Total', '1500'],
      ['', '', 'Saída Total', '1200'],
      ['', '', 'LUCRO TOTAL', '300'],
      ['Nilson', '1895,52'],
      ['Andrea', '1621'],
      ['Maria Eduarda', '1500'],
      ['levi', '500'],
    ];
    const out = extrairBlocosEntradasPorOrdemLinhas(values);
    const labels = out.flatMap((b) => b.linhas.map((l) => l.label));
    assert.ok(labels.includes('Dança'));
    assert.ok(!labels.includes('Nilson'));
    assert.ok(!labels.includes('Andrea'));
    assert.ok(!labels.includes('Maria Eduarda'));
    assert.ok(!labels.includes('levi'));
  });
});

describe('extrairBlocosEntradasPorColunasDetectadas', () => {
  it('captura entradas em colunas paralelas (parceiros + aluguel/coworking)', () => {
    const values = [
      ['ENTRADAS PARCEIROS', '', '', 'ENTRADAS ALUGUEL / COWORKING', ''],
      ['Dança', '1000', '', 'Neto (SBA)', '4116,16'],
      ['Yoga', '200', '', 'Pholha (Funcional)', '2500'],
      ['TOTAL', '1200', '', 'TOTAL', '6616,16'],
      ['', '', '', 'Entrada Total', '7816,16'],
    ];
    const out = extrairBlocosEntradasPorColunasDetectadas(values);
    const labels = out.flatMap((b) => b.linhas.map((l) => l.label));
    assert.ok(labels.includes('Dança'));
    assert.ok(labels.includes('Neto (SBA)'));
    assert.ok(labels.includes('Pholha (Funcional)'));
  });
});

describe('extrairBlocosEntradasPorOrdemLinhas', () => {
  it('com rótulo na col A e valor na B, não usa número da saída à direita na mesma linha', () => {
    const values = [['Aluno João', '500', 'Luz', '120']];
    const out = extrairBlocosEntradasPorOrdemLinhas(values);
    const linhas = out.flatMap((b) => b.linhas);
    assert.ok(linhas.some((l) => l.label === 'Aluno João' && l.valorNum === 500));
    assert.ok(!linhas.some((l) => l.valorNum === 120));
  });
});

describe('chaveLinhaControleDetalhe', () => {
  it('normaliza label para match estável', () => {
    const a = chaveLinhaControleDetalhe({ label: 'Água', valor: '10', valorNum: 10 });
    const b = chaveLinhaControleDetalhe({ label: 'AGUA', valor: '10', valorNum: 10 });
    assert.strictEqual(a, b);
  });
});
