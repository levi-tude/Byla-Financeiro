import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPayloadFromMesAnterior,
  estruturaControleCompleta,
  mesAnoAnterior,
  periodoTemEstrutura,
  stripBlocoSaidasAluguel,
} from './mesAnterior.js';
import { buildControleCaixaTemplate } from './template.js';
import type { ControleCaixaReadDto } from '../../services/controleCaixaRead.js';

describe('mesAnoAnterior', () => {
  it('retrocede jan → dez ano anterior', () => {
    assert.deepEqual(mesAnoAnterior(1, 2026), { mes: 12, ano: 2025 });
  });

  it('retrocede jun → mai mesmo ano', () => {
    assert.deepEqual(mesAnoAnterior(6, 2026), { mes: 5, ano: 2026 });
  });
});

describe('stripBlocoSaidasAluguel', () => {
  it('remove bloco Saídas Aluguel', () => {
    const t = buildControleCaixaTemplate();
    const withExtra = {
      ...t,
      blocos: [
        ...t.blocos,
        {
          templateKey: 'saida_aluguel_coworking',
          tipo: 'saida' as const,
          titulo: 'Saídas Aluguel',
          ordem: 99,
          isDefault: true,
          isCustom: false,
          lockedLevel: 'strong' as const,
          linhas: [],
        },
      ],
    };
    const out = stripBlocoSaidasAluguel(withExtra);
    assert.equal(out.blocos.some((b) => b.titulo.includes('Saídas Aluguel')), false);
  });
});

describe('estruturaControleCompleta', () => {
  it('aceita template operacional completo', () => {
    assert.equal(estruturaControleCompleta(buildControleCaixaTemplate()), true);
  });

  it('rejeita só entradas parceiros (sistema incompleto)', () => {
    assert.equal(
      estruturaControleCompleta({
        blocos: [
          {
            templateKey: 'entrada_parceiros',
            tipo: 'entrada',
            titulo: 'ENTRADAS PARCEIROS',
            ordem: 0,
            isDefault: true,
            isCustom: false,
            lockedLevel: 'strong',
            linhas: [],
          },
        ],
      }),
      false,
    );
  });
});

describe('buildPayloadFromMesAnterior', () => {
  it('ignora período sem blocos e usa o seguinte com estrutura', async () => {
    const empty: ControleCaixaReadDto = {
      mes: 3,
      ano: 2026,
      modo: 'sistema',
      modosDisponiveis: ['sistema'],
      somenteLeitura: false,
      existe: true,
      abaRef: null,
      origem: 'mes_anterior',
      updatedAt: null,
      totais: {
        entradaTotal: null,
        saidaTotal: null,
        lucroTotal: null,
        saidaParceirosTotal: null,
        saidaFixasTotal: null,
        saidaSomaSecoesPrincipais: null,
      },
      blocos: [],
    };
    const fullTpl = buildControleCaixaTemplate();
    const full: ControleCaixaReadDto = {
      ...empty,
      mes: 2,
      blocos: fullTpl.blocos.map((b, i) => ({
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
          valor: null,
          valorTexto: null,
          ordem: l.ordem,
          templateKey: l.templateKey,
          isDefault: l.isDefault,
          isCustom: l.isCustom,
          lockedLevel: l.lockedLevel,
        })),
      })),
    };

    assert.equal(periodoTemEstrutura(empty), false);
    assert.equal(periodoTemEstrutura(full), true);

    const payload = await buildPayloadFromMesAnterior(4, 2026, async (m, a) => {
      if (m === 3 && a === 2026) return { data: empty };
      if (m === 2 && a === 2026) return { data: full };
      return { error: 'não encontrado' };
    });
    assert.ok(payload);
    assert.ok(payload!.blocos.length >= 3);
    assert.equal(payload!.blocos.every((b) => b.linhas.every((l) => l.valor == null)), true);
  });
});
