import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildControleCaixaTemplate } from '../domain/controleCaixa/template.js';
import { mergeEstruturaPreservandoValores } from './controleCaixaSincronizarEntradas.js';
import type { ControleCaixaReadDto } from './controleCaixaRead.js';

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
  });
});
