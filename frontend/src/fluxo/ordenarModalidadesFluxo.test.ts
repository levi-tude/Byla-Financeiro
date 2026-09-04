import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isModalidadeCapacitacao,
  isModalidadeProgramaBolsas,
  ordenarModalidadesFluxo,
} from './ordenarModalidadesFluxo.ts';

describe('ordenarModalidadesFluxo', () => {
  it('coloca capacitação no final e remove programa de bolsas', () => {
    const out = ordenarModalidadesFluxo([
      'CURSO DE CAPACITAÇÃO SAB 10:00',
      'PROGRAMA DE BOLSAS',
      'JAZZ INICIANTE',
      'BALLET',
    ]);
    assert.deepEqual(out, ['BALLET', 'JAZZ INICIANTE', 'CURSO DE CAPACITAÇÃO SAB 10:00']);
  });

  it('não confunde modalidade com bolsa no nome', () => {
    assert.equal(isModalidadeProgramaBolsas('CAROLINA BOLSA PROVISORIA'), false);
    assert.equal(isModalidadeCapacitacao('BALLET'), false);
  });
});
