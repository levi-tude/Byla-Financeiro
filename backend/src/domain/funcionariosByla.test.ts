import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ENTIDADES_BYLA_PADRAO } from './funcionariosByla.js';
import { matchEntidadeBylaNaLinha } from '../logic/saidaPlanilhaFuncionarioMatch.js';

describe('funcionariosByla', () => {
  it('lista padrão inclui 7 pessoas e BylaDança', () => {
    const pessoas = ENTIDADES_BYLA_PADRAO.filter((x) => !x.subempresa);
    const sub = ENTIDADES_BYLA_PADRAO.filter((x) => x.subempresa);
    assert.equal(pessoas.length, 7);
    assert.equal(sub.length, 1);
    assert.equal(sub[0]?.nome, 'BylaDança');
  });
});

describe('matchEntidadeBylaNaLinha', () => {
  it('reconhece Maria Eduarda', () => {
    const m = matchEntidadeBylaNaLinha('Repasse Maria Eduarda - aula', ENTIDADES_BYLA_PADRAO);
    assert.ok(m);
    assert.equal(m!.entidade.nome, 'Maria Eduarda');
  });

  it('reconhece subempresa Byla Dança', () => {
    const m = matchEntidadeBylaNaLinha('Mensalidade BYLA DANÇA - custo', ENTIDADES_BYLA_PADRAO);
    assert.ok(m);
    assert.equal(m!.entidade.nome, 'BylaDança');
    assert.equal(m!.entidade.subempresa, true);
  });

  it('reconhece Samuel', () => {
    const m = matchEntidadeBylaNaLinha('PIX Samuel Davi', ENTIDADES_BYLA_PADRAO);
    assert.ok(m);
    assert.equal(m!.entidade.nome, 'Samuel');
  });
});
