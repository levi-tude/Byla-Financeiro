/**
 * Testes de aceitação com mock (dados fictícios) para perguntas reais dos gestores.
 * O Gemini é simulado: verificamos qual ferramenta/params ele chama e que a ferramenta
 * devolve os números com a fonte, ou "nenhum registro" (nunca R$ 0).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt, normalizeToolCall, runConsultaAgent } from './consultaGeminiAgent.js';
import { buscarSaidasPorBeneficiario, type SaidasBeneficiarioDeps } from '../services/consultaSaidasBeneficiario.js';
import { mesesAte } from '../services/consultaBylaTools.js';
import type { ConsultaToolId } from './consultaCatalog.js';

const ctx = { mes: 10, ano: 2026 };
const res = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const call = (name: string, args: Record<string, unknown>) =>
  res({ candidates: [{ content: { role: 'model', parts: [{ functionCall: { name, args } }] } }] });
const text = (t: string) => res({ candidates: [{ content: { role: 'model', parts: [{ text: t }] } }] });

async function perguntar(pergunta: string, tool: string, args: Record<string, unknown>) {
  const chamadas: Array<{ tool: ConsultaToolId; params: Record<string, string>; ctx: typeof ctx }> = [];
  let n = 0;
  const fetchImpl = (async () => (++n === 1 ? call(tool, args) : text('ok'))) as unknown as typeof fetch;
  const r = await runConsultaAgent(pergunta, [], ctx, {
    apiKey: 'teste',
    fetchImpl,
    today: '2026-10-30',
    executeTool: async (t, params, c) => {
      chamadas.push({ tool: t, params, ctx: c });
      return { ok: true, tool: t, factsText: 'fictício' };
    },
  });
  assert.equal(r.ok, true);
  return chamadas;
}

test('1) "qual o balanço do mês?" → resumo_mes no mês da tela', async () => {
  const c = await perguntar('qual o balanço do mês?', 'resumo_mes', {});
  assert.deepEqual(c.map((x) => [x.tool, x.ctx.mes, x.ctx.ano]), [['resumo_mes', 10, 2026]]);
});

test('2) "balanço dos últimos 4 meses" → balanco_meses meses=4 (jul–out)', async () => {
  const c = await perguntar('qual o balanço dos últimos 4 meses?', 'balanco_meses', { meses: 4 });
  assert.equal(c[0]!.tool, 'balanco_meses');
  assert.equal(c[0]!.params.meses, '4');
  assert.deepEqual(mesesAte(10, 2026, 4).map((m) => m.mes), [7, 8, 9, 10]);
  assert.deepEqual(mesesAte(2, 2026, 4).map((m) => `${m.mes}/${m.ano}`), ['11/2025', '12/2025', '1/2026', '2/2026']);
});

test('3) "quanto entrou de Pilates?" → entradas_modalidade_periodo com período', async () => {
  const c = await perguntar('quanto entrou de Pilates?', 'entradas_modalidade_periodo', {
    modalidade: 'Pilates', mes_inicio: '2026-01', mes_fim: '2026-03',
  });
  assert.equal(c[0]!.params.modalidade, 'Pilates');
  assert.equal(c[0]!.params.mes_inicio, '2026-01');
});

test('4) "pagamento do Pholha (professor)" → saidas_por_beneficiario', async () => {
  const c = await perguntar('quanto foi o pagamento do Pholha (professor)?', 'saidas_por_beneficiario', { nome: 'Pholha' });
  assert.equal(c[0]!.tool, 'saidas_por_beneficiario');
  assert.equal(c[0]!.params.nome, 'Pholha');
  assert.equal(normalizeToolCall('saidas_por_beneficiario', {}, ctx)!.params.precisa_dado, '1');
});

const vazio: SaidasBeneficiarioDeps = { banco: async () => [], controle: async () => [], planilha: async () => [] };

test('saídas por pessoa: sem registro → "nenhum registro encontrado" com fontes, nunca R$ 0', async () => {
  const out = await buscarSaidasPorBeneficiario('Pholha', [{ mes: 9, ano: 2026 }], {
    ...vazio,
    banco: async () => [{ data: '2026-09-05', descricao: 'Professor Demo Dois', valor: -300 }],
    controle: async () => [{ descricao: 'Professor Demo Pholha', valor: 0, secao: 'Parceiros' }], // linha zerada não conta
  });
  assert.match(out, /NENHUM REGISTRO ENCONTRADO/);
  assert.match(out, /Extrato bancário/);
  assert.match(out, /Controle de caixa/);
  assert.match(out, /Planilha FLUXO DE CAIXA/);
  assert.doesNotMatch(out, /R\$\s*0,00/);
});

test('saídas por pessoa: acha na planilha e informa a fonte de cada número', async () => {
  const out = await buscarSaidasPorBeneficiario('Professor Demo', [{ mes: 9, ano: 2026 }], {
    ...vazio,
    planilha: async () => [{ descricao: 'Professor Demo Um', valor: 850, secao: 'Repasses parceiros' }],
    controle: async () => { throw new Error('fora do ar'); },
  });
  assert.match(out, /Fonte: Planilha FLUXO DE CAIXA.*Total R\$\s*850,00/);
  assert.match(out, /Sem registro nas fontes: Extrato bancário/);
  assert.match(out, /indisponíveis agora: Controle de caixa/);
});

test('system prompt proíbe responder zero quando o dado não existe', () => {
  const p = buildSystemPrompt(ctx, '2026-10-30');
  assert.match(p, /NUNCA responda "R\$ 0"/);
  assert.match(p, /de onde vem cada número/);
});
