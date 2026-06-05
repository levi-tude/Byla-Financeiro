import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { catalogoSaidasTemplatePadrao } from '../domain/despesas/categoriasSaida.js';
import { mapeamentoClassificaMes, resolveCategoriaFromMapeamento } from './despesasMapeamento.js';
import type { MapeamentoRow } from './despesasMapeamento.js';

function row(partial: Partial<MapeamentoRow>): MapeamentoRow {
  return {
    id: '1',
    pessoa_normalizada: 'luciana costa',
    categoria: 'Salários / Pró-labore',
    subcategoria: null,
    template_key: 'sai_fixo_salarios',
    bloco_template_key: 'saida_gastos_fixos',
    aplica_tipo: 'saida',
    ativo: false,
    updated_at: '2026-03-15T12:00:00Z',
    ...partial,
  };
}

describe('mapeamentoClassificaMes (Opção A)', () => {
  it('regra ativa classifica qualquer mês', () => {
    assert.equal(mapeamentoClassificaMes(row({ ativo: true }), 4, 2026), true);
  });

  it('regra inativa: mês da desativação ainda classifica', () => {
    assert.equal(mapeamentoClassificaMes(row({ ativo: false }), 3, 2026), true);
  });

  it('regra inativa: mês posterior não classifica', () => {
    assert.equal(mapeamentoClassificaMes(row({ ativo: false }), 4, 2026), false);
  });

  it('regra inativa: ano anterior classifica', () => {
    assert.equal(mapeamentoClassificaMes(row({ ativo: false }), 12, 2025), true);
  });
});

describe('resolveCategoriaFromMapeamento + catálogo do mês', () => {
  it('resolve pelo template_key presente no Controle', () => {
    const catalog = catalogoSaidasTemplatePadrao();
    const luciana = catalog.find((c) => c.label === 'Luciana');
    assert.ok(luciana);
    const m = row({ template_key: luciana!.templateKey, categoria: 'Qualquer texto antigo' });
    const cat = resolveCategoriaFromMapeamento(m, catalog);
    assert.ok(cat);
    assert.equal(cat!.label, 'Luciana');
  });

  it('não inventa categoria se a linha não existir no catálogo custom', () => {
    const catalog = catalogoSaidasTemplatePadrao().filter((c) => c.label !== 'Luciana');
    const lucianaKey = catalogoSaidasTemplatePadrao().find((c) => c.label === 'Luciana')!.templateKey;
    const m = row({ template_key: lucianaKey, categoria: 'Luciana' });
    const cat = resolveCategoriaFromMapeamento(m, catalog);
    assert.equal(cat, null);
  });
});
