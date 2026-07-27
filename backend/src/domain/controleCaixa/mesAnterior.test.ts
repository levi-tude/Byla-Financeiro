import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPayloadFromMesAnterior,
  estruturaControleCompleta,
  estruturaControleLegadaGenerica,
  mesAnoAnterior,
  periodoTemEstrutura,
  periodoUsavelParaHerdar,
  precisaRepararEstruturaSistema,
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

describe('estruturaControleLegadaGenerica', () => {
  it('detecta template_auto antigo com Funcional / Repasse / Saídas Aluguel', () => {
    assert.equal(
      estruturaControleLegadaGenerica({
        blocos: [
          {
            templateKey: 'entrada_parceiros',
            tipo: 'entrada',
            titulo: 'Entradas Parceiros',
            ordem: 0,
            isDefault: true,
            isCustom: false,
            lockedLevel: 'strong',
            linhas: [
              {
                templateKey: 'ent_parc_funcional',
                label: 'Funcional',
                ordem: 0,
                valor: null,
                valorTexto: null,
                isDefault: true,
                isCustom: false,
                lockedLevel: 'warn',
              },
            ],
          },
          {
            templateKey: 'saida_parceiros',
            tipo: 'saida',
            titulo: 'Total Saídas (Parceiros)',
            ordem: 1,
            isDefault: true,
            isCustom: false,
            lockedLevel: 'strong',
            linhas: [
              {
                templateKey: 'sai_parc_danca',
                label: 'Repasse Dança',
                ordem: 0,
                valor: null,
                valorTexto: null,
                isDefault: true,
                isCustom: false,
                lockedLevel: 'warn',
              },
            ],
          },
          {
            templateKey: 'saida_gastos_fixos',
            tipo: 'saida',
            titulo: 'Gastos Fixos',
            ordem: 2,
            isDefault: true,
            isCustom: false,
            lockedLevel: 'strong',
            linhas: [],
          },
          {
            templateKey: 'saida_aluguel_coworking',
            tipo: 'saida',
            titulo: 'Saídas Aluguel',
            ordem: 3,
            isDefault: true,
            isCustom: false,
            lockedLevel: 'strong',
            linhas: [],
          },
        ],
      }),
      true,
    );
  });

  it('não marca template operacional da planilha', () => {
    assert.equal(estruturaControleLegadaGenerica(buildControleCaixaTemplate()), false);
    assert.equal(precisaRepararEstruturaSistema(buildControleCaixaTemplate()), false);
    assert.equal(periodoUsavelParaHerdar(buildControleCaixaTemplate()), true);
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

  it('ignora período com template genérico legado', async () => {
    const legado: ControleCaixaReadDto = {
      mes: 7,
      ano: 2026,
      modo: 'sistema',
      modosDisponiveis: ['sistema'],
      somenteLeitura: false,
      existe: true,
      abaRef: null,
      origem: 'template_auto',
      updatedAt: null,
      totais: {
        entradaTotal: null,
        saidaTotal: null,
        lucroTotal: null,
        saidaParceirosTotal: null,
        saidaFixasTotal: null,
        saidaSomaSecoesPrincipais: null,
      },
      blocos: [
        {
          id: 'b0',
          tipo: 'entrada',
          titulo: 'Entradas Parceiros',
          ordem: 0,
          templateKey: 'entrada_parceiros',
          isDefault: true,
          isCustom: false,
          lockedLevel: 'strong',
          linhas: [
            {
              id: 'l0',
              label: 'Funcional',
              valor: null,
              valorTexto: null,
              ordem: 0,
              templateKey: 'ent_parc_funcional',
              isDefault: true,
              isCustom: false,
              lockedLevel: 'warn',
            },
          ],
        },
        {
          id: 'b1',
          tipo: 'saida',
          titulo: 'Total Saídas (Parceiros)',
          ordem: 1,
          templateKey: 'saida_parceiros',
          isDefault: true,
          isCustom: false,
          lockedLevel: 'strong',
          linhas: [
            {
              id: 'l1',
              label: 'Repasse Dança',
              valor: null,
              valorTexto: null,
              ordem: 0,
              templateKey: 'sai_parc_danca',
              isDefault: true,
              isCustom: false,
              lockedLevel: 'warn',
            },
          ],
        },
        {
          id: 'b2',
          tipo: 'saida',
          titulo: 'Gastos Fixos',
          ordem: 2,
          templateKey: 'saida_gastos_fixos',
          isDefault: true,
          isCustom: false,
          lockedLevel: 'strong',
          linhas: [],
        },
      ],
    };
    const bomTpl = buildControleCaixaTemplate();
    const bom: ControleCaixaReadDto = {
      ...legado,
      mes: 6,
      origem: 'migracao_planilha',
      blocos: bomTpl.blocos.map((b, i) => ({
        id: `ok${i}`,
        tipo: b.tipo,
        titulo: b.titulo,
        ordem: b.ordem,
        templateKey: b.templateKey,
        isDefault: b.isDefault,
        isCustom: b.isCustom,
        lockedLevel: b.lockedLevel,
        linhas: b.linhas.map((l, j) => ({
          id: `okl${i}-${j}`,
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

    assert.equal(periodoUsavelParaHerdar(legado), false);
    const payload = await buildPayloadFromMesAnterior(8, 2026, async (m, a) => {
      if (m === 7 && a === 2026) return { data: legado };
      if (m === 6 && a === 2026) return { data: bom };
      return { error: 'não encontrado' };
    });
    assert.ok(payload);
    assert.ok(payload!.blocos.some((b) => b.linhas.some((l) => l.label === 'Pilates Mari')));
    assert.equal(payload!.blocos.some((b) => b.linhas.some((l) => l.label === 'Funcional')), false);
  });
});
