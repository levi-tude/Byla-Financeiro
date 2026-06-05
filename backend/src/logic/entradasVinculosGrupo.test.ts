import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildGruposPixComVinculos, pagadorNormParaMapeamento } from './entradasVinculosGrupo.js';
import type { PlanilhaItem } from './conciliacaoPagamentoMatch.js';
import type { TransacaoEntradaClassificada } from './entradasAgrupamento.js';
import type { CategoriaEntradaLinha } from '../domain/entradas/categoriasEntrada.js';

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

describe('pagadorNormParaMapeamento', () => {
  it('usa nome do extrato (Vicente) e não só o aluno', () => {
    const txn = {
      pessoa: 'Vicente de Andrade',
    } as TransacaoEntradaClassificada;
    const fluxo = {
      aluno: 'Marcele',
      pagadorPix: undefined,
      responsaveis: [],
    } as PlanilhaItem;
    assert.equal(pagadorNormParaMapeamento(txn, fluxo), 'vicente de andrade');
  });
});

describe('buildGruposPixComVinculos', () => {
  it('cria grupo por vínculo com aluno do fluxo', () => {
    const txn: TransacaoEntradaClassificada = {
      id: 'pix-1',
      data: '2026-06-10',
      pessoa: 'Vicente de Andrade',
      valor: 240,
      descricao: 'PIX',
      categoria_sugerida: null,
      origem_categoria: null,
      modalidade: null,
      nome_aluno: null,
      pessoa_normalizada: 'vicente de andrade',
      categoria_efetiva: null,
      template_key_efetivo: null,
      origem_efetiva: 'pendente',
    };
    const fluxo: PlanilhaItem = {
      id: 'fluxo::f1',
      aba: 'BYLA DANÇA',
      modalidade: 'Adulto',
      aluno: 'Marcele',
      linha: 1,
      data: '2026-06-10',
      forma: 'pix',
      valor: 240,
      mesCompetencia: 6,
      anoCompetencia: 2026,
      responsaveis: [],
    };
    const { grupos, transacoesRestantes } = buildGruposPixComVinculos(
      [txn],
      [{ id: 'v1', data_ref: '2026-06-10', mes: 6, ano: 2026, banco_id: 'pix-1', planilha_id: 'fluxo::f1', observacao: null }],
      new Map([['fluxo::f1', fluxo]]),
      [],
      6,
      2026,
      catalog,
    );
    assert.equal(grupos.length, 1);
    assert.equal(grupos[0].aluno_nome, 'Marcele');
    assert.equal(grupos[0].pessoa_exibida, 'Vicente de Andrade');
    assert.equal(grupos[0].origem_grupo, 'pix_vinculo');
    assert.equal(transacoesRestantes.length, 0);
  });
});
