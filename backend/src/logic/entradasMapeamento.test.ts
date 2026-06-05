import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  pickMapeamentoEntradaForPessoa,
  pickSugestaoFluxoEntradaForPessoa,
} from './entradasMapeamento.js';
import type { CategoriaEntradaLinha } from '../domain/entradas/categoriasEntrada.js';
import type { MapeamentoRow } from './despesasMapeamento.js';

const catalog: CategoriaEntradaLinha[] = [
  {
    templateKey: 'ent_parc_danca',
    label: 'Dança',
    blocoTemplateKey: 'entrada_parceiros',
    blocoTitulo: 'Entradas Parceiros',
    ordem: 0,
    blocoOrdem: 0,
    linhaId: '1',
    blocoId: 'b1',
    isCustom: false,
  },
];

const baseRow: MapeamentoRow = {
  id: 'x',
  pessoa_normalizada: 'joao silva',
  categoria: 'Dança',
  subcategoria: null,
  template_key: 'ent_parc_danca',
  bloco_template_key: 'entrada_parceiros',
  aplica_tipo: 'entrada',
  ativo: true,
  updated_at: new Date().toISOString(),
};

describe('pickMapeamentoEntradaForPessoa', () => {
  it('resolve regra ativa entrada confirmada', () => {
    const r = pickMapeamentoEntradaForPessoa([{ ...baseRow, confirmado: true }], 'joao silva', 3, 2026, catalog);
    assert.equal(r?.categoria.templateKey, 'ent_parc_danca');
  });

  it('ignora sugestão fluxo não confirmada para classificação', () => {
    const r = pickMapeamentoEntradaForPessoa(
      [{ ...baseRow, confirmado: false, origem_regra: 'validacao_fluxo' }],
      'joao silva',
      3,
      2026,
      catalog,
    );
    assert.equal(r, null);
  });
});

describe('pickSugestaoFluxoEntradaForPessoa', () => {
  it('retorna sugestão pendente do fluxo', () => {
    const r = pickSugestaoFluxoEntradaForPessoa(
      [{ ...baseRow, confirmado: false, origem_regra: 'validacao_fluxo', observacao: 'Vínculo 01/06' }],
      'joao silva',
      3,
      2026,
      catalog,
    );
    assert.equal(r?.categoria.templateKey, 'ent_parc_danca');
    assert.equal(r?.row.observacao, 'Vínculo 01/06');
  });
});