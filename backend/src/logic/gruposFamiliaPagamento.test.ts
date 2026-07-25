import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  familiaPagamentoChave,
  familiaPagamentoRotulo,
  grupoFamiliaCompativel,
  withGruposFamiliaCatalogo,
  type GrupoFamiliaPagamento,
} from './gruposFamiliaPagamento.js';

/** Catálogo fictício — nunca usar nomes reais de clientes nos testes do repo público. */
const CATALOGO_FICTICIO: GrupoFamiliaPagamento[] = [
  {
    chave: 'marina_sofia_costa',
    rotulo: 'mãe e filha',
    membros: [
      ['MARINA', 'COSTA'],
      ['SOFIA', 'COSTA'],
    ],
  },
  {
    chave: 'carla_pedro_almeida',
    rotulo: 'casal',
    membros: [
      ['CARLA', 'ALMEIDA'],
      ['PEDRO', 'ALMEIDA'],
    ],
  },
];

describe('gruposFamiliaPagamento', () => {
  it('reconhece mãe e filha no mesmo grupo sticky', () => {
    withGruposFamiliaCatalogo(CATALOGO_FICTICIO, () => {
      assert.equal(
        familiaPagamentoChave('MARINA COSTA SILVA'),
        'marina_sofia_costa',
      );
      assert.equal(familiaPagamentoChave('SOFIA COSTA'), 'marina_sofia_costa');
      assert.equal(familiaPagamentoRotulo('SOFIA COSTA'), 'mãe e filha');
      assert.ok(grupoFamiliaCompativel('MARINA COSTA SILVA', 'SOFIA COSTA'));
    });
  });

  it('não agrupa homônimos de sobrenome fora do catálogo', () => {
    withGruposFamiliaCatalogo(CATALOGO_FICTICIO, () => {
      assert.equal(familiaPagamentoChave('ANA COSTA SANTANA'), null);
      assert.ok(!grupoFamiliaCompativel('ANA COSTA SANTANA', 'SOFIA COSTA'));
    });
  });

  it('reconhece casal no catálogo sticky', () => {
    withGruposFamiliaCatalogo(CATALOGO_FICTICIO, () => {
      assert.equal(familiaPagamentoChave('CARLA ALMEIDA'), 'carla_pedro_almeida');
      assert.equal(familiaPagamentoChave('PEDRO ALMEIDA'), 'carla_pedro_almeida');
      assert.equal(familiaPagamentoRotulo('CARLA ALMEIDA'), 'casal');
      assert.ok(grupoFamiliaCompativel('CARLA ALMEIDA', 'PEDRO ALMEIDA'));
    });
  });

  it('sem catálogo carregado, não agrupa por família', () => {
    withGruposFamiliaCatalogo([], () => {
      assert.equal(familiaPagamentoChave('MARINA COSTA SILVA'), null);
    });
  });
});
