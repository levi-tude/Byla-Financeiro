import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  chavesEquivalentesLinha,
  findBlocoLinha,
  montarComposicaoLinha,
  type BlocoAlvoComposicao,
} from './controleCaixaLinhaComposicao.js';
import type { CategoriaEntradaLinha } from '../domain/entradas/categoriasEntrada.js';
import type { CategoriaSaidaLinha } from '../domain/despesas/categoriasSaida.js';
import { YOGA_AJUSTE_FIXO } from '../domain/entradas/repasseParceiros.js';

const catalogEntrada: CategoriaEntradaLinha[] = [
  {
    templateKey: 'ent_parc_danca',
    label: 'Dança',
    blocoTemplateKey: 'entrada_parceiros',
    blocoTitulo: 'ENTRADAS PARCEIROS',
    ordem: 0,
    blocoOrdem: 0,
    linhaId: 'l-danca',
    blocoId: 'b-ent',
    isCustom: false,
  },
  {
    templateKey: 'ent_parc_yoga',
    label: 'Yoga',
    blocoTemplateKey: 'entrada_parceiros',
    blocoTitulo: 'ENTRADAS PARCEIROS',
    ordem: 1,
    blocoOrdem: 0,
    linhaId: 'l-yoga',
    blocoId: 'b-ent',
    isCustom: false,
  },
];

const catalogSaida: CategoriaSaidaLinha[] = [
  {
    templateKey: 'sai_fix_aluguel',
    label: 'Aluguel',
    blocoTemplateKey: 'saida_gastos_fixos',
    blocoTitulo: 'SAÍDAS FIXAS',
    ordem: 0,
    blocoOrdem: 1,
    linhaId: 'l-alug',
    blocoId: 'b-sai',
    isCustom: false,
  },
];

const blocoEntrada: BlocoAlvoComposicao = {
  tipo: 'entrada',
  titulo: 'ENTRADAS PARCEIROS',
  templateKey: 'entrada_parceiros',
  linhas: [
    {
      id: 'l-danca',
      label: 'Dança',
      valor: 500,
      valorTexto: 'extrato_classificado',
      templateKey: 'ent_parc_danca',
    },
    {
      id: 'l-yoga',
      label: 'Yoga',
      valor: 1000,
      valorTexto: 'extrato_classificado',
      templateKey: 'ent_parc_yoga',
    },
  ],
};

const blocoSaidaParc: BlocoAlvoComposicao = {
  tipo: 'saida',
  titulo: 'SAÍDAS PARCEIROS',
  templateKey: 'saida_parceiros',
  linhas: [
    {
      id: 'l-sai-yoga',
      label: 'Yoga',
      valor: roundYoga(1000),
      valorTexto: 'calculado_repasse',
      templateKey: 'sai_parc_yoga',
    },
  ],
};

const blocoFixas: BlocoAlvoComposicao = {
  tipo: 'saida',
  titulo: 'SAÍDAS FIXAS',
  templateKey: 'saida_gastos_fixos',
  linhas: [
    {
      id: 'l-alug',
      label: 'Aluguel',
      valor: 2000,
      valorTexto: 'extrato_classificado',
      templateKey: 'sai_fix_aluguel',
    },
  ],
};

function roundYoga(entrada: number): number {
  return Math.round(((entrada + YOGA_AJUSTE_FIXO) / 2) * 100) / 100;
}

describe('controleCaixaLinhaComposicao', () => {
  it('chavesEquivalentesLinha inclui estável e linha:id', () => {
    const keys = chavesEquivalentesLinha(blocoEntrada.linhas[0]!, 'entrada');
    assert.ok(keys.has('ent_parc_danca'));
    assert.ok(keys.has('linha:l-danca'));
  });

  it('findBlocoLinha resolve por template keys', () => {
    const hit = findBlocoLinha(
      [blocoEntrada, blocoSaidaParc],
      'entrada_parceiros',
      'ent_parc_danca',
    );
    assert.equal(hit?.linha.label, 'Dança');
  });

  it('modo Oficial não lista extrato', () => {
    const r = montarComposicaoLinha({
      modo: 'oficial',
      mes: 6,
      ano: 2026,
      visao: 'competencia',
      bloco: blocoEntrada,
      linha: blocoEntrada.linhas[0]!,
      entradasParceiros: blocoEntrada.linhas,
      catalogEntrada,
      catalogSaida,
      transacoesEntrada: [
        {
          id: 'tx1',
          data: '2026-06-10',
          pessoa: 'Maria Ficticia',
          valor: 250,
          descricao: 'PIX',
          origem_efetiva: 'mapeamento_manual',
          template_key_efetivo: 'ent_parc_danca',
          mes_competencia: 6,
          ano_competencia: 2026,
        },
      ],
      transacoesDespesa: [],
      pagamentosDinheiro: [],
    });
    assert.equal(r.tipoComposicao, 'modo_oficial');
    assert.equal(r.itens.length, 0);
    assert.ok(r.mensagem?.includes('Oficial'));
  });

  it('entrada: extrato + dinheiro somam na modalidade', () => {
    const r = montarComposicaoLinha({
      modo: 'sistema',
      mes: 6,
      ano: 2026,
      visao: 'competencia',
      bloco: blocoEntrada,
      linha: blocoEntrada.linhas[0]!,
      entradasParceiros: blocoEntrada.linhas,
      catalogEntrada,
      catalogSaida,
      transacoesEntrada: [
        {
          id: 'tx-pix',
          data: '2026-06-05',
          pessoa: 'Ana Exemplo',
          valor: 200,
          descricao: 'PIX recebido',
          origem_efetiva: 'mapeamento_manual',
          template_key_efetivo: 'ent_parc_danca',
          mes_competencia: 6,
          ano_competencia: 2026,
        },
        {
          id: 'tx-outra',
          data: '2026-06-05',
          pessoa: 'Bruno Exemplo',
          valor: 300,
          descricao: 'PIX',
          origem_efetiva: 'mapeamento_manual',
          template_key_efetivo: 'ent_parc_yoga',
          mes_competencia: 6,
          ano_competencia: 2026,
        },
      ],
      transacoesDespesa: [],
      pagamentosDinheiro: [
        {
          aba: 'Dança',
          modalidade: null,
          forma: 'Dinheiro',
          valor: 100,
          mes_competencia: 6,
          ano_competencia: 2026,
          data_pagamento: '2026-06-08',
          aluno_nome: 'Carla Exemplo',
        },
      ],
    });
    assert.equal(r.tipoComposicao, 'extrato_e_dinheiro');
    assert.equal(r.itens.length, 2);
    assert.equal(r.totalItens, 300);
    assert.ok(r.itens.some((i) => i.origem === 'extrato' && i.meioLabel === 'PIX'));
    assert.ok(r.itens.some((i) => i.origem === 'dinheiro_fluxo' && i.pessoa === 'Carla Exemplo'));
  });

  it('saída parceiros: fórmula com base, sem lista de PIX', () => {
    const r = montarComposicaoLinha({
      modo: 'sistema',
      mes: 6,
      ano: 2026,
      visao: 'competencia',
      bloco: blocoSaidaParc,
      linha: blocoSaidaParc.linhas[0]!,
      entradasParceiros: blocoEntrada.linhas,
      catalogEntrada,
      catalogSaida,
      transacoesEntrada: [
        {
          id: 'tx-ignorada',
          data: '2026-06-01',
          pessoa: 'Repasse Ficticio',
          valor: 500,
          descricao: 'PIX',
          origem_efetiva: 'mapeamento_manual',
          template_key_efetivo: 'sai_parc_yoga',
          mes_competencia: 6,
          ano_competencia: 2026,
        },
      ],
      transacoesDespesa: [],
      pagamentosDinheiro: [],
    });
    assert.equal(r.tipoComposicao, 'formula_repasse');
    assert.equal(r.itens.length, 0);
    assert.ok(r.formula);
    assert.equal(r.formula!.baseEntrada, 1000);
    assert.ok(r.formula!.descricao.includes(String(YOGA_AJUSTE_FIXO)));
    assert.ok(r.formula!.aviso.toLowerCase().includes('fórmula'));
  });

  it('saída fixa: lista extrato classificado', () => {
    const r = montarComposicaoLinha({
      modo: 'sistema',
      mes: 6,
      ano: 2026,
      visao: 'competencia',
      bloco: blocoFixas,
      linha: blocoFixas.linhas[0]!,
      entradasParceiros: [],
      catalogEntrada,
      catalogSaida,
      transacoesEntrada: [],
      transacoesDespesa: [
        {
          id: 'tx-fix',
          data: '2026-06-12',
          pessoa: 'Imobiliaria Exemplo',
          valor: 2000,
          descricao: 'Aluguel sala',
          origem_efetiva: 'mapeamento_manual',
          template_key_efetivo: 'sai_fix_aluguel',
          mes_competencia: 6,
          ano_competencia: 2026,
        },
      ],
      pagamentosDinheiro: [],
    });
    assert.equal(r.tipoComposicao, 'extrato_e_dinheiro');
    assert.equal(r.itens.length, 1);
    assert.equal(r.totalItens, 2000);
    assert.equal(r.itens[0]!.pessoa, 'Imobiliaria Exemplo');
  });
});
