import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  filtrarTransacoesOficiais,
  definirPadroesExternos,
  isEntradaExterna,
  likeParaRegExp,
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
    const externalPrefix = 'EA';
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

  const S = businessRules.transacoes.samuelNamePrefix;
  const ids = (o: { entradas: TransacaoBase[]; saidas: TransacaoBase[] }) => [...o.entradas, ...o.saidas].map((r) => r.id).sort();

  it('não exclui saída Samuel ~5k sem entrada externa (regra de faixa removida, igual à view)', () => {
    const rows: TransacaoBase[] = [{ id: 's1', data: '2026-03-10', pessoa: S, valor: 5234.56, descricao: 'repasse', tipo: 'saida' }];
    assert.strictEqual(filtrarTransacoesOficiais(rows).saidas.length, 1);
  });

  it('reconhece novo pagador externo (Rbc Marketing) e o repasse do mesmo dia', () => {
    const rows: TransacaoBase[] = [
      { id: 'e1', data: '2026-10-09', pessoa: 'Rbc Marketing Ltda', valor: 4666.67, descricao: null, tipo: 'entrada' },
      { id: 's1', data: '2026-10-09', pessoa: S, valor: 4666, descricao: null, tipo: 'saida' },
      { id: 's2', data: '2026-10-07', pessoa: S, valor: 1500, descricao: null, tipo: 'saida' },
      { id: 'e2', data: '2026-10-09', pessoa: 'Aluna Fictícia Um', valor: 230, descricao: null, tipo: 'entrada' },
    ];
    assert.deepStrictEqual(ids(filtrarTransacoesOficiais(rows)), ['e2', 's2']);
  });

  it('pareia saída Samuel com a soma de duas entradas externas do dia', () => {
    const rows: TransacaoBase[] = [
      { id: 'e1', data: '2026-09-08', pessoa: 'Ea Entretenimento Ficticia', valor: 5533, descricao: null, tipo: 'entrada' },
      { id: 'e2', data: '2026-09-08', pessoa: 'Blead Ad Tech', valor: 2500, descricao: null, tipo: 'entrada' },
      { id: 's1', data: '2026-09-08', pessoa: S, valor: 8000, descricao: null, tipo: 'saida' },
      { id: 's2', data: '2026-09-08', pessoa: S, valor: 35, descricao: null, tipo: 'saida' },
      { id: 's3', data: '2026-09-08', pessoa: S, valor: 1400, descricao: null, tipo: 'saida' },
    ];
    assert.deepStrictEqual(ids(filtrarTransacoesOficiais(rows)), ['s2', 's3']);
  });

  it('aceita ±1 dia, mas cada entrada externa pareia uma única saída (a mais próxima)', () => {
    const rows: TransacaoBase[] = [
      { id: 'e1', data: '2026-01-21', pessoa: 'Blead Ad Tech', valor: 533, descricao: null, tipo: 'entrada' },
      { id: 's1', data: '2026-01-20', pessoa: S, valor: 500, descricao: null, tipo: 'saida' },
      { id: 's2', data: '2026-01-21', pessoa: S, valor: 533, descricao: null, tipo: 'saida' },
      { id: 'e2', data: '2026-02-07', pessoa: 'Blead Ad Tech', valor: 5000, descricao: null, tipo: 'entrada' },
      { id: 's3', data: '2026-02-08', pessoa: S, valor: 4900, descricao: null, tipo: 'saida' },
    ];
    assert.deepStrictEqual(ids(filtrarTransacoesOficiais(rows)), ['s1']);
  });

  it('não pareia com 2 dias de distância nem acima da tolerância', () => {
    const T = businessRules.transacoes.externalPairTolerance;
    const rows: TransacaoBase[] = [
      { id: 'e1', data: '2026-05-01', pessoa: 'Blead Ad Tech', valor: 3000, descricao: null, tipo: 'entrada' },
      { id: 's1', data: '2026-05-03', pessoa: S, valor: 3000, descricao: null, tipo: 'saida' },
      { id: 's2', data: '2026-05-01', pessoa: S, valor: 3000 + T + 1, descricao: null, tipo: 'saida' },
    ];
    assert.deepStrictEqual(ids(filtrarTransacoesOficiais(rows)), ['s1', 's2']);
  });

  it('usa a lista de regras_externos quando carregada e volta ao fallback com lista vazia', () => {
    const rows: TransacaoBase[] = [{ id: 'e1', data: '2026-05-01', pessoa: 'Empresa Ficticia Sa', valor: 100, descricao: null, tipo: 'entrada' }];
    definirPadroesExternos(['empresa ficticia%']);
    assert.strictEqual(filtrarTransacoesOficiais(rows).entradas.length, 0);
    assert.strictEqual(isEntradaExterna({ pessoa: 'Rbc Marketing Ltda', descricao: null }), false);
    definirPadroesExternos([]);
    assert.strictEqual(filtrarTransacoesOficiais(rows).entradas.length, 1);
    assert.strictEqual(isEntradaExterna({ pessoa: 'x', descricao: 'Pix Blead Ad Tech' }), true);
  });

  it('likeParaRegExp segue LIKE (% e _, resto literal)', () => {
    assert.ok(likeParaRegExp('ea %').test('ea entretenimento'));
    assert.ok(!likeParaRegExp('ea %').test('area x'));
    assert.ok(likeParaRegExp('a.b_').test('a.bc'));
    assert.ok(!likeParaRegExp('a.b_').test('axbc'));
  });
});

