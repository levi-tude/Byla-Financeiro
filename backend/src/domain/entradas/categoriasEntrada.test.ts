import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildControleCaixaTemplate } from '../controleCaixa/template.js';
import {
  catalogoEntradasFromControleData,
  catalogoEntradasParceirosFromControleData,
  isCategoriaEntradaAluguelCoworking,
  isCategoriaEntradaParceiros,
} from './categoriasEntrada.js';
import { linhaTemplateKey } from '../despesas/categoriasSaida.js';
import type { ControleCaixaReadDto } from '../../services/controleCaixaRead.js';

function fakeControleFromTemplate(): ControleCaixaReadDto {
  const template = buildControleCaixaTemplate();
  return {
    mes: 6,
    ano: 2026,
    abaRef: null,
    origem: 'template',
    updatedAt: null,
    totais: {
      entradaTotal: null,
      saidaTotal: null,
      lucroTotal: null,
      saidaParceirosTotal: null,
      saidaFixasTotal: null,
      saidaSomaSecoesPrincipais: null,
    },
    blocos: template.blocos.map((b, bi) => ({
      id: `b-${bi}`,
      tipo: b.tipo,
      titulo: b.titulo,
      ordem: b.ordem,
      templateKey: b.templateKey,
      isDefault: b.isDefault,
      isCustom: b.isCustom,
      lockedLevel: b.lockedLevel,
      linhas: b.linhas.map((l, li) => ({
        id: `l-${bi}-${li}`,
        label: l.label,
        valor: l.valor,
        valorTexto: l.valorTexto,
        ordem: l.ordem,
        templateKey: l.templateKey,
        isDefault: l.isDefault,
        isCustom: l.isCustom,
        lockedLevel: l.lockedLevel,
      })),
    })),
  };
}

describe('catalogoEntradasFromControleData', () => {
  it('inclui Parceiros e Aluguel/Coworking', () => {
    const catalog = catalogoEntradasFromControleData(fakeControleFromTemplate());
    const parceiros = catalog.filter(isCategoriaEntradaParceiros);
    const aluguel = catalog.filter(isCategoriaEntradaAluguelCoworking);
    assert.equal(parceiros.length, 5);
    assert.equal(aluguel.length, 5);
    assert.ok(parceiros.some((c) => c.label === 'Dança'));
    assert.ok(aluguel.some((c) => c.label === 'Neto (SBA)'));
    assert.ok(parceiros.some((c) => c.templateKey === linhaTemplateKey(null, 'l-0-0')));
  });

  it('catalogoEntradasParceirosFromControleData filtra só parceiros', () => {
    const onlyParceiros = catalogoEntradasParceirosFromControleData(fakeControleFromTemplate());
    assert.equal(onlyParceiros.length, 5);
    assert.ok(onlyParceiros.every(isCategoriaEntradaParceiros));
  });
});
