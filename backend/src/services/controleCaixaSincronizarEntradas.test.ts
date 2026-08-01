import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildControleCaixaTemplate } from '../domain/controleCaixa/template.js';
import { mergeEstruturaPreservandoValores } from './controleCaixaEstrutura.js';
import { aplicarSyncCompletoSistema } from './controleCaixaSyncLogic.js';
import {
  agregarEntradasClassificadas,
  filtrarTransacoesParaSyncVisao,
} from './controleCaixaSincronizarEntradas.js';
import {
  agregarDinheiroFluxoParceiros,
  mesclarValoresEntrada,
} from '../logic/dinheiroFluxoParaControle.js';
import type { ControleCaixaReadDto } from './controleCaixaRead.js';
import { catalogoEntradasFromControleData } from '../domain/entradas/categoriasEntrada.js';
import { YOGA_AJUSTE_FIXO, PILATES_MARI_AJUSTE_FIXO } from '../domain/entradas/repasseParceiros.js';
import { transacaoContaNaCompetencia } from './transacaoCompetenciaService.js';

function dtoFromTemplate(partial: Partial<ControleCaixaReadDto> = {}): ControleCaixaReadDto {
  const t = buildControleCaixaTemplate();
  return {
    mes: 6,
    ano: 2026,
    modo: 'sistema',
    modosDisponiveis: ['oficial', 'sistema'],
    somenteLeitura: false,
    existe: true,
    abaRef: 'JULHO 26',
    origem: 'teste',
    updatedAt: null,
    totais: { ...t.totais },
    blocos: t.blocos.map((b, i) => ({
      id: `b${i}`,
      tipo: b.tipo,
      titulo: b.titulo,
      ordem: b.ordem,
      templateKey: b.templateKey,
      isDefault: b.isDefault,
      isCustom: b.isCustom,
      lockedLevel: b.lockedLevel,
      linhas: b.linhas.map((l, j) => ({
        id: `l${i}-${j}`,
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
    ...partial,
  };
}

function linha(data: ControleCaixaReadDto, templateKey: string) {
  return data.blocos.flatMap((b) => b.linhas).find((l) => l.templateKey === templateKey);
}

describe('mergeEstruturaPreservandoValores', () => {
  it('restaura saídas fixas a partir do oficial e mantém valor de Dança do sistema', () => {
    const oficial = dtoFromTemplate({ modo: 'oficial', origem: 'migracao_planilha' });
    const sistemaIncompleto: ControleCaixaReadDto = {
      ...dtoFromTemplate(),
      origem: 'sincronizar_entradas',
      blocos: [
        {
          id: 'only',
          tipo: 'entrada',
          titulo: 'ENTRADAS PARCEIROS',
          ordem: 0,
          templateKey: 'entrada_parceiros',
          isDefault: true,
          isCustom: false,
          lockedLevel: 'strong',
          linhas: [
            {
              id: 'danca',
              label: 'Dança',
              valor: 4338.44,
              valorTexto: 'extrato_classificado',
              ordem: 0,
              templateKey: 'ent_parc_danca',
              isDefault: true,
              isCustom: false,
              lockedLevel: 'warn',
            },
          ],
        },
      ],
    };

    const merged = mergeEstruturaPreservandoValores(oficial, sistemaIncompleto);
    assert.ok(merged.blocos.length >= 3);
    assert.ok(merged.blocos.some((b) => b.titulo.toLowerCase().includes('fixas')));
    const danca = merged.blocos
      .flatMap((b) => b.linhas)
      .find((l) => l.templateKey === 'ent_parc_danca' || l.label === 'Dança');
    assert.equal(danca?.valor, 4338.44);
    assert.equal(danca?.valorTexto, 'extrato_classificado');

    const oficialComValor = dtoFromTemplate({ modo: 'oficial', origem: 'migracao_planilha' });
    const yogaOficial = oficialComValor.blocos
      .flatMap((b) => b.linhas)
      .find((l) => l.templateKey === 'ent_parc_yoga');
    if (yogaOficial) {
      yogaOficial.valor = 999;
      yogaOficial.valorTexto = 'da_planilha';
    }
    const mergedSemVazar = mergeEstruturaPreservandoValores(oficialComValor, sistemaIncompleto);
    const yoga = mergedSemVazar.blocos
      .flatMap((b) => b.linhas)
      .find((l) => l.templateKey === 'ent_parc_yoga');
    assert.equal(yoga?.valor, null);
    assert.equal(yoga?.valorTexto, null);
  });

  it('preserva linha custom do Sistema que não existe no oficial', () => {
    const oficial = dtoFromTemplate({ modo: 'oficial', origem: 'migracao_planilha' });
    const sistema = dtoFromTemplate({ origem: 'sistema_editor' });
    const aluguel = sistema.blocos.find((b) => b.templateKey === 'entrada_aluguel_coworking');
    assert.ok(aluguel);
    aluguel!.linhas.push({
      id: 'custom-40',
      label: 'Cowork Demo Alpha',
      valor: 900,
      valorTexto: 'extrato_classificado',
      ordem: 99,
      templateKey: 'ent_alug_x_cowork_demo_alpha',
      isDefault: false,
      isCustom: true,
      lockedLevel: 'none',
    });

    const merged = mergeEstruturaPreservandoValores(oficial, sistema);
    const hit = merged.blocos
      .flatMap((b) => b.linhas)
      .find((l) => l.label === 'Cowork Demo Alpha');
    assert.ok(hit);
    assert.equal(hit?.valor, 900);
    assert.equal(hit?.templateKey, 'ent_alug_x_cowork_demo_alpha');
  });
});

describe('aplicarSyncCompletoSistema', () => {
  it('sobrescreve entradas parceiros e zera categorias sem classificado', () => {
    const data = dtoFromTemplate();
    const yoga = linha(data, 'ent_parc_yoga');
    if (yoga) {
      yoga.valor = 999;
      yoga.valorTexto = 'manual';
    }

    const entradas = new Map<string, number>([['ent_parc_danca', 1000]]);
    aplicarSyncCompletoSistema(data, entradas, new Map());

    assert.equal(linha(data, 'ent_parc_danca')?.valor, 1000);
    assert.equal(linha(data, 'ent_parc_yoga')?.valor, 0);
    assert.equal(linha(data, 'ent_parc_yoga')?.valorTexto, 'sync_zerado');
  });

  it('calcula saídas parceiros só por fórmula (Dança 60%, Yoga (e+480)/2, Pilates 55%×(e+460), Teatro/GR 50%)', () => {
    const data = dtoFromTemplate();
    const entradas = new Map<string, number>([
      ['ent_parc_danca', 1000],
      ['ent_parc_yoga', 2000],
      ['ent_parc_pilates_mari', 3000],
      ['ent_parc_teatro', 800],
      ['ent_parc_bruna_gr', 400],
    ]);
    aplicarSyncCompletoSistema(data, entradas, new Map());

    assert.equal(linha(data, 'sai_parc_danca')?.valor, 600);
    assert.equal(linha(data, 'sai_parc_yoga')?.valor, (2000 + YOGA_AJUSTE_FIXO) / 2);
    assert.equal(
      linha(data, 'sai_parc_pilates_mari')?.valor,
      Math.round(0.55 * (3000 + PILATES_MARI_AJUSTE_FIXO) * 100) / 100,
    );
    assert.equal(linha(data, 'sai_parc_teatro')?.valor, 400);
    assert.equal(linha(data, 'sai_parc_bruna_gr')?.valor, 200);
  });

  it('não aplica fórmula de Yoga quando entrada está vazia (evita 240 fantasma)', () => {
    const data = dtoFromTemplate();
    aplicarSyncCompletoSistema(data, new Map([['ent_parc_danca', 500]]), new Map());
    assert.equal(linha(data, 'sai_parc_yoga')?.valor, 0);
    assert.equal(linha(data, 'sai_parc_danca')?.valor, 300);
  });

  it('Teatro Infantil fica fora do sync automático salvo se houver entrada correspondente', () => {
    const data = dtoFromTemplate();
    const sai = linha(data, 'sai_parc_teatro_infantil');
    if (sai) {
      sai.valor = 777;
      sai.valorTexto = 'manual';
    }

    aplicarSyncCompletoSistema(data, new Map([['ent_parc_danca', 100]]), new Map());
    assert.equal(linha(data, 'sai_parc_teatro_infantil')?.valor, 0);

    aplicarSyncCompletoSistema(
      data,
      new Map([
        ['ent_parc_danca', 100],
        ['ent_parc_teatro_infantil', 800],
      ]),
      new Map(),
    );
    assert.equal(linha(data, 'sai_parc_teatro_infantil')?.valor, 400);
  });

  it('sincroniza aluguel/coworking a partir de classificados e zera o restante', () => {
    const data = dtoFromTemplate();
    const entradas = new Map<string, number>([['ent_alug_neto_sba', 1500]]);
    aplicarSyncCompletoSistema(data, entradas, new Map());
    assert.equal(linha(data, 'ent_alug_neto_sba')?.valor, 1500);
    assert.equal(linha(data, 'ent_alug_pholha')?.valor, 0);
  });

  it('sincroniza saídas fixas a partir de despesas e não usa despesas de parceiros', () => {
    const data = dtoFromTemplate();
    const dancaAntes = linha(data, 'sai_parc_danca');
    if (dancaAntes) dancaAntes.valor = 111;

    const despesas = new Map<string, number>([
      ['sai_fix_energia', 250],
      ['sai_parc_danca', 9999], // deve ser ignorado pelo agregador de fixas; aqui simula mapa já filtrado
    ]);
    // No serviço o agregador exclui parceiros; aqui o mapa de fixas só deve ter fixas.
    despesas.delete('sai_parc_danca');
    aplicarSyncCompletoSistema(data, new Map([['ent_parc_danca', 1000]]), despesas);

    assert.equal(linha(data, 'sai_fix_energia')?.valor, 250);
    assert.equal(linha(data, 'sai_fix_agua')?.valor, 0);
    // Saída parceiro vem da fórmula, não do 9999.
    assert.equal(linha(data, 'sai_parc_danca')?.valor, 600);
  });

  it('recalcula totais após sync', () => {
    const data = dtoFromTemplate();
    aplicarSyncCompletoSistema(
      data,
      new Map([
        ['ent_parc_danca', 1000],
        ['ent_alug_neto_sba', 500],
      ]),
      new Map([['sai_fix_energia', 100]]),
    );
    assert.equal(data.totais.entradaTotal, 1500);
    assert.equal(data.totais.saidaParceirosTotal, 600);
    assert.equal(data.totais.saidaFixasTotal, 100);
    assert.equal(data.totais.saidaTotal, 700);
    assert.equal(data.totais.lucroTotal, 800);
  });
});

describe('filtrarTransacoesParaSyncVisao (competência)', () => {
  const base = {
    data: '2026-06-15',
    valor: 340,
    origem_efetiva: 'mapeamento_manual',
    template_key_efetivo: 'ent_parc_danca',
    categoria_efetiva: 'Dança',
    mes_competencia: 6,
    ano_competencia: 2026,
  };

  it('inclui competência sugerida (não confirmada) — alinhado a Entradas/Despesas', () => {
    const txs = [{ ...base, competencia_confirmada: false }];
    assert.equal(transacaoContaNaCompetencia(txs[0], 6, 2026, true), false);
    assert.equal(filtrarTransacoesParaSyncVisao(txs, 6, 2026, 'competencia').length, 1);
  });

  it('exclui mês de competência diferente', () => {
    const txs = [{ ...base, mes_competencia: 7, competencia_confirmada: false }];
    assert.equal(filtrarTransacoesParaSyncVisao(txs, 6, 2026, 'competencia').length, 0);
  });

  it('agrega valor de classificado não confirmado em visão competência', () => {
    const txs = [
      { ...base, valor: 1000, competencia_confirmada: false },
      { ...base, valor: 500, competencia_confirmada: true, template_key_efetivo: 'ent_parc_yoga' },
    ];
    const map = agregarEntradasClassificadas(txs, [], 6, 2026, 'competencia');
    assert.equal(map.get('ent_parc_danca'), 1000);
    assert.equal(map.get('ent_parc_yoga'), 500);
  });

  it('não dobra valor quando chave efetiva já é a estável (catálogo resolve)', () => {
    const catalog = catalogoEntradasFromControleData(dtoFromTemplate());
    const txs = [
      {
        ...base,
        valor: 1000,
        competencia_confirmada: false,
        template_key_efetivo: 'ent_parc_danca',
        categoria_efetiva: 'Dança',
      },
    ];
    const map = agregarEntradasClassificadas(txs, catalog, 6, 2026, 'competencia');
    assert.equal(map.get('ent_parc_danca'), 1000);
  });

  it('sticky com tx em dois meses: sync do mês A só soma A; mês B só B; sem classificado → 0', () => {
    const catalog = catalogoEntradasFromControleData(dtoFromTemplate());
    const txs = [
      {
        ...base,
        data: '2026-06-10',
        valor: 400,
        mes_competencia: 6,
        ano_competencia: 2026,
        template_key_efetivo: 'ent_parc_danca',
        categoria_efetiva: 'Dança',
      },
      {
        ...base,
        data: '2026-07-10',
        valor: 700,
        mes_competencia: 7,
        ano_competencia: 2026,
        template_key_efetivo: 'ent_parc_danca',
        categoria_efetiva: 'Dança',
      },
      {
        ...base,
        data: '2026-06-12',
        valor: 999,
        mes_competencia: 6,
        ano_competencia: 2026,
        origem_efetiva: 'heuristica',
        template_key_efetivo: 'ent_parc_yoga',
        categoria_efetiva: 'Yoga',
      },
    ];
    const mapJun = agregarEntradasClassificadas(txs, catalog, 6, 2026, 'competencia');
    const mapJul = agregarEntradasClassificadas(txs, catalog, 7, 2026, 'competencia');
    assert.equal(mapJun.get('ent_parc_danca'), 400);
    assert.equal(mapJul.get('ent_parc_danca'), 700);
    assert.equal(mapJun.get('ent_parc_yoga'), undefined);
    assert.equal(mapJul.get('ent_parc_yoga'), undefined);

    const data = dtoFromTemplate({ mes: 6 });
    aplicarSyncCompletoSistema(data, mapJun, new Map());
    assert.equal(linha(data, 'ent_parc_danca')?.valor, 400);
    assert.equal(linha(data, 'ent_parc_yoga')?.valor, 0);
    assert.equal(linha(data, 'sai_parc_danca')?.valor, 240);
    assert.equal(linha(data, 'sai_parc_yoga')?.valor, 0);
  });
});

describe('dinheiro Fluxo no sync Sistema (integração pura)', () => {
  it('extrato + dinheiro na mesma modalidade; só dinheiro em outra; aba sem chave ignorada', () => {
    const catalog = catalogoEntradasFromControleData(dtoFromTemplate());
    const extrato = agregarEntradasClassificadas(
      [
        {
          data: '2026-06-15',
          valor: 1000,
          origem_efetiva: 'mapeamento_manual',
          template_key_efetivo: 'ent_parc_danca',
          categoria_efetiva: 'Dança',
          mes_competencia: 6,
          ano_competencia: 2026,
          competencia_confirmada: false,
        },
      ],
      catalog,
      6,
      2026,
      'competencia',
    );
    const dinheiro = agregarDinheiroFluxoParceiros(
      [
        {
          aba: 'BYLA DANÇA',
          modalidade: null,
          forma: 'Dinheiro',
          valor: 200,
          mes_competencia: 6,
          ano_competencia: 2026,
          data_pagamento: '2026-06-10',
        },
        {
          aba: 'PILATES MARINA',
          modalidade: null,
          forma: 'Espécie',
          valor: 350,
          mes_competencia: 6,
          ano_competencia: 2026,
          data_pagamento: '2026-06-12',
        },
        {
          aba: 'OFICINA DESCONHECIDA',
          modalidade: null,
          forma: 'Dinheiro',
          valor: 999,
          mes_competencia: 6,
          ano_competencia: 2026,
          data_pagamento: '2026-06-12',
        },
      ],
      catalog,
      6,
      2026,
      'competencia',
    );
    const merged = mesclarValoresEntrada(extrato, dinheiro);
    const data = dtoFromTemplate();
    aplicarSyncCompletoSistema(data, merged, new Map());

    assert.equal(linha(data, 'ent_parc_danca')?.valor, 1200);
    assert.equal(linha(data, 'ent_parc_pilates_mari')?.valor, 350);
    assert.equal(linha(data, 'sai_parc_danca')?.valor, 720);
    assert.equal(
      linha(data, 'sai_parc_pilates_mari')?.valor,
      Math.round(0.55 * (350 + PILATES_MARI_AJUSTE_FIXO) * 100) / 100,
    );
  });
});
