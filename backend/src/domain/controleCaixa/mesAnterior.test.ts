import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mesAnoAnterior, stripBlocoSaidasAluguel } from './mesAnterior.js';
import { buildControleCaixaTemplate } from './template.js';

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
