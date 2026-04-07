import { describe, it } from 'node:test';
import assert from 'node:assert';
import { filtrarTransacoesOficiais, type TransacaoBase } from './transacoesFiltro.js';
import { businessRules } from '../businessRules.js';

describe('filtrarTransacoesOficiais', () => {
  it('remove entrada externa e saida correspondente do Samuel', () => {
    const externalPrefix = (businessRules.transacoes.externalEntryNames[0] ?? 'EA ').trim();
    const rows: TransacaoBase[] = [
      { id: 'e1', data: '2026-03-10', pessoa: `${externalPrefix} Midia`, valor: 1000, descricao: null, tipo: 'entrada' },
      { id: 's1', data: '2026-03-10', pessoa: `${businessRules.transacoes.samuelNamePrefix} - repasse`, valor: 1000, descricao: null, tipo: 'saida' },
      { id: 'e2', data: '2026-03-10', pessoa: 'Cliente A', valor: 200, descricao: null, tipo: 'entrada' },
    ];
    const out = filtrarTransacoesOficiais(rows);
    assert.strictEqual(out.entradas.length, 1);
    assert.strictEqual(out.entradas[0]?.id, 'e2');
    assert.strictEqual(out.saidas.length, 0);
  });

  it('mantem saida se nao houver entrada externa compativel', () => {
    const rows: TransacaoBase[] = [
      { id: 's1', data: '2026-03-10', pessoa: `${businessRules.transacoes.samuelNamePrefix} - repasse`, valor: 2200, descricao: null, tipo: 'saida' },
      { id: 'e2', data: '2026-03-10', pessoa: 'Cliente A', valor: 200, descricao: null, tipo: 'entrada' },
    ];
    const out = filtrarTransacoesOficiais(rows);
    assert.strictEqual(out.entradas.length, 1);
    assert.strictEqual(out.saidas.length, 1);
  });

  it('ignora saida Samuel na faixa de repasse externo (~5k) mesmo sem par EA', () => {
    const rows: TransacaoBase[] = [
      {
        id: 's1',
        data: '2026-03-10',
        pessoa: businessRules.transacoes.samuelNamePrefix,
        valor: 5234.56,
        descricao: 'repasse',
        tipo: 'saida',
      },
    ];
    const out = filtrarTransacoesOficiais(rows);
    assert.strictEqual(out.saidas.length, 0);
  });
});

