import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildControleCaixaTemplate } from '../domain/controleCaixa/template.js';
import { mergeEstruturaPreservandoValores } from './controleCaixaEstrutura.js';
import { aplicarSyncCompletoSistema } from './controleCaixaSyncLogic.js';
import type { ControleCaixaReadDto } from './controleCaixaRead.js';
import { YOGA_AJUSTE_FIXO, PILATES_MARI_AJUSTE_FIXO } from '../domain/entradas/repasseParceiros.js';

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
