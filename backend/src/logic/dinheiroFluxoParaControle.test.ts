import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildControleCaixaTemplate } from '../domain/controleCaixa/template.js';
import { catalogoEntradasFromControleData } from '../domain/entradas/categoriasEntrada.js';
import type { ControleCaixaReadDto } from '../services/controleCaixaRead.js';
import { aplicarSyncCompletoSistema } from '../services/controleCaixaSyncLogic.js';
import {
  agregarDinheiroFluxoParceiros,
  mesclarValoresEntrada,
  type PagamentoFluxoDinheiroRow,
} from './dinheiroFluxoParaControle.js';

function dtoFromTemplate(): ControleCaixaReadDto {
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
  };
}

function pag(partial: Partial<PagamentoFluxoDinheiroRow> & Pick<PagamentoFluxoDinheiroRow, 'aba' | 'valor'>): PagamentoFluxoDinheiroRow {
  return {
    modalidade: partial.modalidade ?? null,
    forma: partial.forma ?? 'Dinheiro',
    mes_competencia: partial.mes_competencia ?? 6,
    ano_competencia: partial.ano_competencia ?? 2026,
    data_pagamento: partial.data_pagamento ?? '2026-06-10',
    ...partial,
  };
}

function linha(data: ControleCaixaReadDto, templateKey: string) {
  return data.blocos.flatMap((b) => b.linhas).find((l) => l.templateKey === templateKey);
}

describe('agregarDinheiroFluxoParceiros', () => {
  const catalog = catalogoEntradasFromControleData(dtoFromTemplate());

  it('mapeia Pilates → ent_parc_pilates_mari e Dança → ent_parc_danca', () => {
    const map = agregarDinheiroFluxoParceiros(
      [
        pag({ aba: 'PILATES MARINA', valor: 250 }),
        pag({ aba: 'BYLA DANÇA', modalidade: 'Contemporânea', valor: 180 }),
        pag({ aba: 'YOGA', valor: 120 }),
        pag({ aba: 'TEATRO', valor: 100 }),
        pag({ aba: 'BRUNA GR', valor: 90 }),
      ],
      catalog,
      6,
      2026,
      'competencia',
    );
    assert.equal(map.get('ent_parc_pilates_mari'), 250);
    assert.equal(map.get('ent_parc_danca'), 180);
    assert.equal(map.get('ent_parc_yoga'), 120);
    assert.equal(map.get('ent_parc_teatro'), 100);
    assert.equal(map.get('ent_parc_bruna_gr'), 90);
  });

  it('ignora PIX/cartão — só Dinheiro/espécie', () => {
    const map = agregarDinheiroFluxoParceiros(
      [
        pag({ aba: 'BYLA DANÇA', forma: 'PIX', valor: 999 }),
        pag({ aba: 'BYLA DANÇA', forma: 'Espécie', valor: 50 }),
        pag({ aba: 'BYLA DANÇA', forma: 'Débito', valor: 80 }),
      ],
      catalog,
      6,
      2026,
      'competencia',
    );
    assert.equal(map.get('ent_parc_danca'), 50);
  });

  it('visão competência filtra pelo mês do Fluxo', () => {
    const map = agregarDinheiroFluxoParceiros(
      [
        pag({ aba: 'YOGA', valor: 100, mes_competencia: 6, data_pagamento: '2026-07-02' }),
        pag({ aba: 'YOGA', valor: 200, mes_competencia: 7, data_pagamento: '2026-06-28' }),
      ],
      catalog,
      6,
      2026,
      'competencia',
    );
    assert.equal(map.get('ent_parc_yoga'), 100);
  });

  it('visão caixa filtra pela data_pagamento', () => {
    const map = agregarDinheiroFluxoParceiros(
      [
        pag({ aba: 'YOGA', valor: 100, mes_competencia: 7, data_pagamento: '2026-06-28' }),
        pag({ aba: 'YOGA', valor: 200, mes_competencia: 6, data_pagamento: '2026-07-02' }),
      ],
      catalog,
      6,
      2026,
      'caixa',
    );
    assert.equal(map.get('ent_parc_yoga'), 100);
  });

  it('aba sem chave conhecida não entra (não inventa linha)', () => {
    const map = agregarDinheiroFluxoParceiros(
      [pag({ aba: 'OFICINA AVULSA XYZ', valor: 500 })],
      catalog,
      6,
      2026,
      'competencia',
    );
    assert.equal(map.size, 0);
  });

  it('mescla com extrato classificado na mesma linha e recalcula repasse', () => {
    const dinheiro = agregarDinheiroFluxoParceiros(
      [pag({ aba: 'BYLA DANÇA', valor: 200 })],
      catalog,
      6,
      2026,
      'competencia',
    );
    const extrato = new Map<string, number>([['ent_parc_danca', 1000]]);
    const merged = mesclarValoresEntrada(extrato, dinheiro);
    assert.equal(merged.get('ent_parc_danca'), 1200);

    const data = dtoFromTemplate();
    aplicarSyncCompletoSistema(data, merged, new Map());
    assert.equal(linha(data, 'ent_parc_danca')?.valor, 1200);
    assert.equal(linha(data, 'sai_parc_danca')?.valor, 720);
  });
});
