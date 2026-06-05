import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  matchAluguelCoworkingParaPagador,
  resolverSegmentoEntradaGrupo,
} from './aluguelCoworkingMatch.js';
import type { CategoriaEntradaLinha } from './categoriasEntrada.js';

const catalogAluguel: CategoriaEntradaLinha[] = [
  {
    templateKey: 'linha:neto',
    label: 'Neto (SBA)',
    blocoTemplateKey: 'entrada_aluguel_coworking',
    blocoTitulo: 'ENTRADAS ALUGUEL / COWORKING',
    ordem: 0,
    blocoOrdem: 1,
    linhaId: '1',
    blocoId: 'b1',
    isCustom: false,
  },
  {
    templateKey: 'linha:pholha',
    label: 'Pholha (Funcional)',
    blocoTemplateKey: 'entrada_aluguel_coworking',
    blocoTitulo: 'ENTRADAS ALUGUEL / COWORKING',
    ordem: 1,
    blocoOrdem: 1,
    linhaId: '2',
    blocoId: 'b1',
    isCustom: false,
  },
  {
    templateKey: 'linha:forro',
    label: 'Forró e Alma',
    blocoTemplateKey: 'entrada_aluguel_coworking',
    blocoTitulo: 'ENTRADAS ALUGUEL / COWORKING',
    ordem: 2,
    blocoOrdem: 1,
    linhaId: '3',
    blocoId: 'b1',
    isCustom: false,
  },
];

describe('matchAluguelCoworkingParaPagador', () => {
  it('reconhece Orville Neto → Neto (SBA)', () => {
    const m = matchAluguelCoworkingParaPagador('Orville Neto Silva', 1200, catalogAluguel, new Map([['linha:neto', 1200]]));
    assert.equal(m?.label, 'Neto (SBA)');
    assert.ok((m?.score ?? 0) >= 10);
  });

  it('reconhece Wendel Pholha', () => {
    const m = matchAluguelCoworkingParaPagador('Wendel Pholha', 800, catalogAluguel, new Map());
    assert.equal(m?.label, 'Pholha (Funcional)');
  });

  it('não confunde aluno genérico com aluguel', () => {
    const m = matchAluguelCoworkingParaPagador('Maria Silva Santos', 150, catalogAluguel, new Map());
    assert.equal(m, null);
  });
});

describe('resolverSegmentoEntradaGrupo', () => {
  it('pendente sem sinal vai para mensalidades (não aluguel por default)', () => {
    assert.equal(
      resolverSegmentoEntradaGrupo({
        bloco_template_key: null,
        bloco_titulo: null,
        template_key: null,
        aba_fluxo: null,
        aluno_nome: null,
        sugestao_fluxo: null,
        match_aluguel: null,
      }),
      'mensalidades',
    );
  });

  it('match aluguel forte vai para aluguel_coworking', () => {
    assert.equal(
      resolverSegmentoEntradaGrupo({
        bloco_template_key: null,
        bloco_titulo: null,
        template_key: null,
        aba_fluxo: null,
        aluno_nome: null,
        sugestao_fluxo: null,
        match_aluguel: {
          template_key: 'linha:neto',
          label: 'Neto (SBA)',
          confianca: 'alta',
          motivo: 'Nome: NETO',
          score: 12,
        },
      }),
      'aluguel_coworking',
    );
  });
});
