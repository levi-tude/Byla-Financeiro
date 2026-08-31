import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  blocoParaSnap,
  cellTemDiff,
  compararBlocos,
  compararControles,
  montarDeltaCell,
  valoresDiferem,
} from './controleCaixaComparacao.ts';

describe('controleCaixaComparacao', () => {
  it('tolerância de centavos: iguais dentro de 0,01', () => {
    assert.equal(valoresDiferem(100, 100.005), false);
    assert.equal(valoresDiferem(100, 100.02), true);
  });

  it('montarDeltaCell: só em um modo', () => {
    const soSis = montarDeltaCell(null, 50);
    assert.equal(soSis.presenca, 'sistema');
    assert.equal(soSis.delta, 50);
    assert.equal(cellTemDiff(soSis), true);

    const soOf = montarDeltaCell(40, null);
    assert.equal(soOf.presenca, 'oficial');
    assert.equal(soOf.delta, -40);
  });

  it('soDiffs omite linhas iguais e blocos sem diferença', () => {
    const oficial = [
      blocoParaSnap({
        templateKey: 'entrada_parceiros',
        titulo: 'Entradas Parceiros',
        tipo: 'entrada',
        linhas: [
          { templateKey: 'ent_yoga', label: 'Yoga', valor: 1000 },
          { templateKey: 'ent_pilates', label: 'Pilates', valor: 500 },
        ],
      }),
      blocoParaSnap({
        templateKey: 'saida_fixas',
        titulo: 'Saídas Fixas',
        tipo: 'saida',
        linhas: [{ templateKey: 'sai_fix_net', label: 'Net', valor: 100 }],
      }),
    ];
    const sistema = [
      blocoParaSnap({
        templateKey: 'entrada_parceiros',
        titulo: 'Entradas Parceiros',
        tipo: 'entrada',
        linhas: [
          { templateKey: 'ent_yoga', label: 'Yoga', valor: 1000 },
          { templateKey: 'ent_pilates', label: 'Pilates', valor: 480 },
        ],
      }),
      blocoParaSnap({
        templateKey: 'saida_fixas',
        titulo: 'Saídas Fixas',
        tipo: 'saida',
        linhas: [{ templateKey: 'sai_fix_net', label: 'Net', valor: 100 }],
      }),
    ];

    const diffs = compararBlocos(oficial, sistema, { soDiffs: true });
    assert.equal(diffs.length, 1);
    assert.equal(diffs[0].chave, 'entrada_parceiros');
    assert.equal(diffs[0].linhas.length, 1);
    assert.equal(diffs[0].linhas[0].chave, 'l:pilates');
    assert.equal(diffs[0].linhas[0].cell.delta, -20);

    const tudo = compararBlocos(oficial, sistema, { soDiffs: false });
    assert.equal(tudo.length, 2);
    assert.equal(tudo[0].linhas.length, 2);
  });

  it('linha só no Sistema aparece como diff', () => {
    const oficial = [
      blocoParaSnap({
        templateKey: 'b1',
        titulo: 'B1',
        tipo: 'entrada',
        linhas: [{ templateKey: 'a', label: 'A', valor: 10 }],
      }),
    ];
    const sistema = [
      blocoParaSnap({
        templateKey: 'b1',
        titulo: 'B1',
        tipo: 'entrada',
        linhas: [
          { templateKey: 'a', label: 'A', valor: 10 },
          { templateKey: 'b', label: 'B', valor: 5 },
        ],
      }),
    ];
    const diffs = compararBlocos(oficial, sistema, { soDiffs: true });
    assert.equal(diffs[0].linhas.length, 1);
    assert.equal(diffs[0].linhas[0].cell.presenca, 'sistema');
  });

  it('alinha planilha sem templateKey com sistema que tem chave (pelo rótulo)', () => {
    const oficial = [
      blocoParaSnap({
        templateKey: null,
        titulo: 'ENTRADAS PARCEIROS',
        tipo: 'entrada',
        linhas: [
          { id: 'uuid-a', label: 'Yoga', valor: 1000 },
          { id: 'uuid-b', label: 'Pilates', valor: 500 },
        ],
      }),
    ];
    const sistema = [
      blocoParaSnap({
        templateKey: 'entrada_parceiros',
        titulo: 'Entradas Parceiros',
        tipo: 'entrada',
        linhas: [
          { templateKey: 'ent_parc_yoga', label: 'Yoga', valor: 1000 },
          { templateKey: 'ent_parc_pilates', label: 'Pilates', valor: 480 },
        ],
      }),
    ];
    const diffs = compararBlocos(oficial, sistema, { soDiffs: true });
    assert.equal(diffs.length, 1);
    assert.equal(diffs[0].chave, 'entrada_parceiros');
    assert.equal(diffs[0].linhas.length, 1);
    assert.equal(diffs[0].linhas[0].label, 'Pilates');
    assert.equal(diffs[0].linhas[0].cell.presenca, 'ambos');
    assert.equal(diffs[0].linhas[0].cell.delta, -20);
  });

  it('compararControles totais sistema − oficial', () => {
    const c = compararControles(
      {
        totais: { entradaTotal: 100, saidaTotal: 40, lucroTotal: 60 },
        blocos: [],
      },
      {
        totais: { entradaTotal: 90, saidaTotal: 40, lucroTotal: 50 },
        blocos: [],
      },
    );
    assert.equal(c.totais.entradas.delta, -10);
    assert.equal(c.totais.lucro.delta, -10);
    assert.equal(c.blocos.length, 0);
  });
});
