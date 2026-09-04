import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isModalidadeCapacitacao,
  isModalidadeProgramaBolsas,
  mapLinhasParaProgramaBolsas,
} from './programaBolsasMap.js';

describe('isModalidadeCapacitacao', () => {
  it('reconhece curso de capacitação', () => {
    assert.equal(isModalidadeCapacitacao('CURSO DE CAPACITAÇÃO SAB 10:00 JUVENIL/ADULTO'), true);
    assert.equal(isModalidadeCapacitacao('Ballet Iniciante'), false);
  });
});

describe('isModalidadeProgramaBolsas', () => {
  it('reconhece só o bloco do programa', () => {
    assert.equal(isModalidadeProgramaBolsas('PROGRAMA DE BOLSAS'), true);
    assert.equal(isModalidadeProgramaBolsas('CAROLINA BOLSA PROVISORIA'), false);
    assert.equal(isModalidadeProgramaBolsas('JAZZ INICIANTE'), false);
  });
});

describe('mapLinhasParaProgramaBolsas', () => {
  it('mapeia seção bolsas e usa OBS como modalidade original', () => {
    const payload = mapLinhasParaProgramaBolsas({
      aba: 'BYLA DANÇA',
      atualizadoEm: '2026-09-04T12:00:00.000Z',
      linhas: [
        {
          secao: 'bolsas',
          modalidade: 'PROGRAMA DE BOLSAS',
          row: {
            ALUNO: 'Aluna Demo Bolsa',
            PLANO: '100%',
            VALOR: '0',
            VENC: '5',
            OBSERVAÇÕES: 'Jazz Iniciante',
            WPP: '71999990000',
            RESPONSÁVEIS: 'Responsável Demo',
          },
        },
        {
          secao: 'normal',
          modalidade: 'JAZZ',
          row: { ALUNO: 'Aluna Normal Demo', PLANO: 'Mensal' },
        },
      ],
    });
    assert.equal(payload.origem, 'programa_bolsas');
    assert.equal(payload.itens.length, 1);
    assert.equal(payload.itens[0]?.alunoNome, 'Aluna Demo Bolsa');
    assert.equal(payload.itens[0]?.modalidadeOriginal, 'Jazz Iniciante');
    assert.equal(payload.itens[0]?.plano, '100%');
    assert.equal(payload.itens[0]?.valorReferencia, 0);
    assert.equal(payload.itens[0]?.venc, '5');
    assert.equal(payload.itens[0]?.wpp, '71999990000');
    assert.equal(payload.itens[0]?.responsaveis, 'Responsável Demo');
  });
});
