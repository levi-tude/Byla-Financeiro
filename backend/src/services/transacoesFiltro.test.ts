import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  filtrarTransacoesOficiais,
  metodoPagamentoFinal,
  normalizarMetodoPagamento,
  type TransacaoBase,
} from './transacoesFiltro.js';
import { businessRules } from '../businessRules.js';

describe('normalizarMetodoPagamento', () => {
  it('detecta PIX em textos comuns de extrato e QR', () => {
    assert.strictEqual(normalizarMetodoPagamento('Recebimento Pix - João'), 'PIX');
    assert.strictEqual(normalizarMetodoPagamento('PIX'), 'PIX');
    assert.strictEqual(normalizarMetodoPagamento('Pagamento QR Code'), 'PIX');
    assert.strictEqual(normalizarMetodoPagamento('chave Pix'), 'PIX');
    assert.strictEqual(normalizarMetodoPagamento('Transferência via SPI'), 'PIX');
    assert.strictEqual(normalizarMetodoPagamento('Transferência instantânea'), 'PIX');
    assert.strictEqual(normalizarMetodoPagamento('TRANSFERENCIA INSTANTANEA'), 'PIX');
  });

  it('classifica arranjo EDI (bandeira) como crédito em vez de Outros', () => {
    assert.strictEqual(normalizarMetodoPagamento('VISA'), 'Crédito');
    assert.strictEqual(normalizarMetodoPagamento('MASTERCARD'), 'Crédito');
    assert.strictEqual(normalizarMetodoPagamento('ELO'), 'Crédito');
    assert.strictEqual(normalizarMetodoPagamento('Liquidação AMEX'), 'Crédito');
  });

  it('prioriza débito quando indicado', () => {
    assert.strictEqual(normalizarMetodoPagamento('VISA ELECTRON'), 'Débito');
    assert.strictEqual(normalizarMetodoPagamento('Cartão de débito'), 'Débito');
  });

  it('mantém TED/DOC/transferência tradicional', () => {
    assert.strictEqual(normalizarMetodoPagamento('TED recebida'), 'Transferência');
    assert.strictEqual(normalizarMetodoPagamento('DOC entre bancos'), 'Transferência');
    assert.strictEqual(normalizarMetodoPagamento('Transferência DOC'), 'Transferência');
  });
});

describe('metodoPagamentoFinal', () => {
  it('entrada: Outros vira PIX (domínio só cartão + PIX)', () => {
    assert.strictEqual(metodoPagamentoFinal('Fulano de Tal', 'entrada'), 'PIX');
    assert.strictEqual(metodoPagamentoFinal('', 'entrada'), 'PIX');
    assert.strictEqual(metodoPagamentoFinal('VISA', 'entrada'), 'Crédito');
  });

  it('saída: mantém Outros quando o extrato não bate com regras', () => {
    assert.strictEqual(metodoPagamentoFinal('Fulano de Tal', 'saida'), 'Outros');
  });
});

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

