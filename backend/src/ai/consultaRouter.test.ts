/** Roteador determinístico (antes da IA) + subconjunto de ferramentas. Nomes 100% fictícios. */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { rotearConsultaDeterministica, selecionarToolsRelevantes } from './consultaRouter.js';
import { gerarConsultaReply } from '../services/consultaBylaService.js';
import type { LlmProviderConfig } from './llmProviders.js';

const ctx = { mes: 10, ano: 2026 };
const now = new Date('2026-10-30T12:00:00');
const rota = (q: string) => rotearConsultaDeterministica(q, ctx, now);
function tool(q: string) {
  const r = rota(q);
  assert.ok(r && r.kind === 'tool', `esperava rota para: ${q}`);
  return r;
}

describe('roteador: perguntas respondidas sem IA', () => {
  for (const q of ['Como tá o balanço desse mês?', 'balanço do mês', 'qual o resultado do mes?', 'Quanto entrou?', 'resumo do mês']) {
    test(`resumo_mes: ${q}`, () => {
      const r = tool(q);
      assert.equal(r.tool, 'resumo_mes');
      assert.deepEqual(r.ctx, ctx);
    });
  }
  test('mês passado', () => assert.deepEqual(tool('Qual foi o resultado do mês passado?').ctx, { mes: 9, ano: 2026 }));
  test('mês citado', () => {
    const r = tool('Quanto entrou em novembro?');
    assert.equal(r.tool, 'resumo_mes');
    assert.equal(r.ctx.mes, 11);
  });
  for (const [q, n] of [['me mostra o balanço dos últimos 4 meses', '4'], ['balanço dos ultimos tres meses', '3'], ['resultado últimos 6 meses', '6']] as const) {
    test(`balanco_meses: ${q}`, () => {
      const r = tool(q);
      assert.equal(r.tool, 'balanco_meses');
      assert.equal(r.params.meses, n);
    });
  }
  test('maio e junho → balanço 2 meses até junho', () => {
    const r = tool('Quanto entrou em maio e junho?');
    assert.equal(r.tool, 'balanco_meses');
    assert.equal(r.params.meses, '2');
    assert.equal(r.ctx.mes, 6);
  });
  for (const q of ['Compara setembro com outubro', 'agosto vs setembro, gastamos mais?']) {
    test(`comparar_meses: ${q}`, () => assert.equal(tool(q).tool, 'comparar_meses'));
  }
  test('comparar params', () => assert.deepEqual(tool('compara setembro com outubro').params, { mes_a: '2026-09', mes_b: '2026-10' }));
  for (const [q, mod, ini, fim] of [
    ['qnt entrou de pilates em set?', 'pilates', '2026-09', '2026-09'],
    ['Quanto o Pilates trouxe de julho a outubro?', 'pilates', '2026-07', '2026-10'],
    ['quanto entrou de pilates de jul a out', 'pilates', '2026-07', '2026-10'],
    ['quanto entrou de yoga em outubro', 'yoga', '2026-10', '2026-10'],
    ['quanto entrou de natação jul-set', 'natacao', '2026-07', '2026-09'],
  ] as const) {
    test(`entradas_modalidade_periodo: ${q}`, () => {
      const r = tool(q);
      assert.equal(r.tool, 'entradas_modalidade_periodo');
      assert.equal(r.params.modalidade, mod);
      assert.equal(r.params.mes_inicio, ini);
      assert.equal(r.params.mes_fim, fim);
    });
  }
  test('entradas por modalidade em outubro', () => assert.equal(tool('Entradas por modalidade em outubro').tool, 'resumo_modalidades'));
  for (const [q, nome, mes] of [
    ['Quanto foi o pagamento do Zé Fictício?', 'Zé Fictício', undefined],
    ['O Beltrano pagou o pilates de outubro?', 'Beltrano', '2026-10'],
    ['Quanto a Ciclana pagou em julho?', 'Ciclana', '2026-07'],
    ['quanto recebemos da Joana Exemplo em agosto', 'Joana Exemplo', '2026-08'],
    ['quanto pagamos ao Professor Fulano?', 'Professor Fulano', undefined],
  ] as const) {
    test(`movimentos_por_pessoa: ${q}`, () => {
      const r = tool(q);
      assert.equal(r.tool, 'movimentos_por_pessoa');
      assert.equal(r.params.nome, nome);
      assert.equal(r.params.mes_inicio, mes);
    });
  }
  test('semana', () => assert.deepEqual(tool('Quanto entrou essa semana?').params, { data_ref: '2026-10-30' }));
  test('dia', () => assert.deepEqual(tool('resumo de hoje').params, { data: '2026-10-30' }));
  test('ontem', () => assert.deepEqual(tool('quanto entrou ontem?').params, { data: '2026-10-29' }));
  test('recusas', () => {
    assert.equal(rota('Me passa o CPF e o telefone da Ciclana')?.kind, 'recusa');
    assert.equal(rota('Apaga o pagamento duplicado do Beltrano de agosto')?.kind, 'recusa');
  });
});

describe('roteador: baixa confiança vai para a IA', () => {
  for (const q of [
    'e de yoga em outubro?',
    'Quanto entrou de GR e de teatro em agosto?',
    'Teve pagamento de aluno em dezembro?',
    'Achei um PIX de 2.500 em outubro, de quem é?',
    'Quanto gastei com professores em setembro?',
    'Pra quem foram as maiores saídas de outubro?',
    'Quantos alunos ativos tem no pilates?',
    'Quem do pilates ainda não pagou outubro?',
    'Os dados tão atualizados?',
    'quanto o fulano deve?',
    'me conta uma piada',
  ]) {
    test(q, () => assert.equal(rota(q), null));
  }
});

describe('subconjunto de ferramentas (3–6)', () => {
  for (const q of ['Quantos alunos ativos tem no pilates?', 'Quanto gastei com professores em setembro?', 'me conta uma piada', 'Achei um PIX de 2.500 em outubro', 'Quem do pilates ainda não pagou outubro?']) {
    test(q, () => {
      const t = selecionarToolsRelevantes(q);
      assert.ok(t.length >= 3 && t.length <= 6, `${t.length}`);
    });
  }
  test('relevância', () => {
    assert.ok(selecionarToolsRelevantes('Quantos alunos ativos tem no pilates?').includes('alunos_por_modalidade'));
    assert.ok(selecionarToolsRelevantes('Achei um PIX de 2.500 em outubro').includes('busca_por_valor'));
    assert.ok(selecionarToolsRelevantes('quem não pagou outubro?').includes('inadimplencia_mes'));
  });
});

const groq: LlmProviderConfig[] = [{ provider: 'groq', apiKey: 'x', models: ['m1', 'm2'] }];
const r429 = (async () => new Response(JSON.stringify({ error: { message: 'rate' } }), { status: 429 })) as unknown as typeof fetch;

describe('serviço', () => {
  test('pergunta roteada não chama a IA', async () => {
    let chamadasIa = 0;
    const out = await gerarConsultaReply(
      { message: 'balanço dos últimos 4 meses', context: { monthYear: '2026-10' } },
      {
        providers: groq,
        nomesConhecidos: [],
        fetchImpl: (async () => { chamadasIa++; throw new Error('não devia'); }) as unknown as typeof fetch,
        executeTool: async (tool, params) => ({ ok: true, tool, factsText: `fatos ${tool} ${params.meses}` }) as never,
      },
    );
    assert.equal(chamadasIa, 0);
    assert.equal(out.providerUsed, 'deterministic');
    assert.equal(out.message, 'fatos balanco_meses 4');
  });

  test('Groq 429 em todos os modelos: nunca "Não consegui consultar", responde com dados + modo simples', async () => {
    const out = await gerarConsultaReply(
      { message: 'situação do aluno Fulano Fictício', context: { monthYear: '2026-10' } },
      { providers: groq, nomesConhecidos: [], fetchImpl: r429, executeTool: async (tool) => ({ ok: true, tool, factsText: 'Fatos demo.' }) as never },
    );
    assert.doesNotMatch(out.message, /Não consegui consultar/);
    assert.match(out.message, /respondi no modo simples/);
    assert.match(out.message, /Fatos demo/);
  });

  test('erro inesperado do agente (exceção) também cai no modo simples', async () => {
    const out = await gerarConsultaReply(
      { message: 'situação do aluno Fulano Fictício', context: { monthYear: '2026-10' } },
      {
        providers: groq,
        nomesConhecidos: [],
        fetchImpl: (async () => { throw new TypeError('rede caiu'); }) as unknown as typeof fetch,
        executeTool: async (tool) => ({ ok: true, tool, factsText: 'Fatos demo.' }) as never,
      },
    );
    assert.match(out.message, /respondi no modo simples/);
  });

  test('forcarModoSimples (limite do backend) não chama a IA', async () => {
    let n = 0;
    const out = await gerarConsultaReply(
      { message: 'situação do aluno Fulano Fictício', context: { monthYear: '2026-10' } },
      {
        providers: groq,
        nomesConhecidos: [],
        forcarModoSimples: true,
        avisoInicial: 'Muitas perguntas seguidas; respondi no modo simples (menu).',
        fetchImpl: (async () => { n++; return new Response('{}'); }) as unknown as typeof fetch,
        executeTool: async (tool) => ({ ok: true, tool, factsText: 'Fatos demo.' }) as never,
      },
    );
    assert.equal(n, 0);
    assert.match(out.message, /modo simples/);
  });

  test('IA recebe só 3–6 ferramentas', async () => {
    let qtd = -1;
    await gerarConsultaReply(
      { message: 'Quantos alunos ativos tem no pilates?', context: { monthYear: '2026-10' } },
      { providers: groq, nomesConhecidos: [], fetchImpl: r429, onTools: (t) => { qtd = t.length; }, executeTool: async (tool) => ({ ok: true, tool, factsText: 'x' }) as never },
    );
    assert.ok(qtd >= 3 && qtd <= 6, String(qtd));
  });
});
