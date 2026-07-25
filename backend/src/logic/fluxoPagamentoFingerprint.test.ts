import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  fluxoPagamentoFingerprint,
  planRemapVinculosFluxo,
  planilhaIdFromFluxoUuid,
} from './fluxoPagamentoFingerprint.js';

const base = {
  aba: 'PILATES',
  modalidade: 'Pilates',
  linha_planilha: 12,
  ordem_lancamento: 1,
  aluno_nome: 'Maria Silva',
  data_pagamento: '2026-03-10',
  forma: 'PIX',
  valor: 250,
  mes_competencia: 3,
  ano_competencia: 2026,
};

describe('fluxoPagamentoFingerprint', () => {
  it('é estável para o mesmo pagamento', () => {
    assert.strictEqual(
      fluxoPagamentoFingerprint(base),
      fluxoPagamentoFingerprint({ ...base, valor: 250.0 }),
    );
  });

  it('muda se valor ou data mudam', () => {
    assert.notStrictEqual(
      fluxoPagamentoFingerprint(base),
      fluxoPagamentoFingerprint({ ...base, valor: 251 }),
    );
    assert.notStrictEqual(
      fluxoPagamentoFingerprint(base),
      fluxoPagamentoFingerprint({ ...base, data_pagamento: '2026-03-11' }),
    );
  });
});

describe('planRemapVinculosFluxo', () => {
  it('religa vínculo ao novo UUID com mesma fingerprint', () => {
    const r = planRemapVinculosFluxo({
      oldPayments: [{ id: 'old-1', ...base }],
      newPayments: [{ id: 'new-1', ...base }],
      vinculoPlanilhaIds: [planilhaIdFromFluxoUuid('old-1')],
    });
    assert.strictEqual(r.updates.length, 1);
    assert.strictEqual(r.updates[0].oldPlanilhaId, 'fluxo::old-1');
    assert.strictEqual(r.updates[0].newPlanilhaId, 'fluxo::new-1');
    assert.strictEqual(r.orphaned.length, 0);
  });

  it('marca órfão se pagamento sumiu da planilha', () => {
    const r = planRemapVinculosFluxo({
      oldPayments: [{ id: 'old-1', ...base }],
      newPayments: [{ id: 'new-1', ...base, valor: 999 }],
      vinculoPlanilhaIds: [planilhaIdFromFluxoUuid('old-1')],
    });
    assert.strictEqual(r.updates.length, 0);
    assert.deepStrictEqual(r.orphaned, ['fluxo::old-1']);
  });
});
