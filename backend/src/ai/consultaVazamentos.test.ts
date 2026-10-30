/** fix/consulta-vazamentos: PII, instruções internas, pseudônimos, cota de IA, saídas. Nomes fictícios. */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatarRespostaUsuario, removerNomeDuplicado } from './respostaUsuario.js';
import { instrucaoIa, textoParaLlm } from './instrucaoIa.js';
import { Pseudonimizador, carregarPaginado } from './pseudonimizacao.js';
import { descricaoBanco } from '../services/consultaMovimentosPessoa.js';
import { gerarConsultaReply, AVISO_COTA_IA } from '../services/consultaBylaService.js';
import { rotearConsultaDeterministica } from './consultaRouter.js';
import { textoMaioresSaidas, textoSaidasProfessores } from '../services/consultaSaidas.js';
import { criarCota } from '../middleware/rateLimit.js';
import type { LlmProviderConfig } from './llmProviders.js';

const ctx = { mes: 10, ano: 2026 };

describe('A) PII e nome duplicado em toda resposta', () => {
  test('nome duplicado + CPF colado (caso Q14) some', () => {
    const t = formatarRespostaUsuario('- 03/10 · Fulano Testador Fulano Testador 83055878515 · R$ 100,00');
    assert.equal(t, '- 03/10 · Fulano Testador · R$ 100,00');
  });
  test('CPF formatado e mascarado não aparecem', () => {
    const t = formatarRespostaUsuario('Beltrana Ficticia 123.456.789-00 pagou; outro ***.456.789-** Ciclano');
    assert.doesNotMatch(t, /\d{3}\.\d{3}|\*\*\*|omitido/);
  });
  test('valores e datas ficam intactos', () => {
    const t = formatarRespostaUsuario('Total R$ 12.345,67 em 30/10/2026 (2026-10-30).');
    assert.equal(t, 'Total R$ 12.345,67 em 30/10/2026 (2026-10-30).');
  });
  test('removerNomeDuplicado não mexe em palavras distintas', () => {
    assert.equal(removerNomeDuplicado('Ana Souza pagou Ana'), 'Ana Souza pagou Ana');
  });
  test('descricaoBanco: pessoa já na descrição não repete e documento sai', () => {
    assert.equal(descricaoBanco('FULANO TESTADOR 83055878515', 'PIX RECEBIDO FULANO TESTADOR 83055878515'), 'PIX RECEBIDO FULANO TESTADOR');
    assert.equal(descricaoBanco('FULANO TESTADOR', 'PIX'), 'FULANO TESTADOR PIX');
  });
  test('roteador (sem IA) também sai limpo', async () => {
    const out = await gerarConsultaReply(
      { message: 'Pagamentos do Fulano Testador em outubro', context: { monthYear: '2026-10' } },
      {
        providers: [],
        executeTool: async (tool) => ({ ok: true, tool, factsText: 'Fulano Testador Fulano Testador 83055878515: R$ 50,00' }) as never,
      },
    );
    assert.equal(out.providerUsed, 'deterministic');
    assert.doesNotMatch(out.message, /8305|Fulano Testador Fulano/);
  });
});

describe('B) instruções do LLM não chegam ao usuário', () => {
  const fatos = `Movimentos: nada.\nNENHUM REGISTRO ENCONTRADO no mês.\n${instrucaoIa('Não informe valor zero: diga que não há registro.')}\n${instrucaoIa('Diga claramente a direção (recebido de / pago a).')}`;
  test('formatador remove instruções e humaniza marcador', () => {
    const t = formatarRespostaUsuario(fatos);
    assert.doesNotMatch(t, /Não informe|Diga claramente|NENHUM/);
    assert.match(t, /Nenhum registro encontrado no mês/);
  });
  test('LLM continua recebendo a instrução (sem a marca)', () => {
    const t = textoParaLlm(fatos);
    assert.match(t, /Não informe valor zero/);
    assert.doesNotMatch(t, /⟦IA⟧/);
  });
  test('caminho sem IA (fallback) devolve texto humano', async () => {
    const out = await gerarConsultaReply(
      { message: 'Resumo do mês', context: { monthYear: '2026-10' } },
      { providers: [], executeTool: async (tool) => ({ ok: true, tool, factsText: fatos }) as never },
    );
    assert.doesNotMatch(out.message, /Não informe|Diga claramente|v_resumo/);
  });
});

describe('C) pseudônimos voltam a nome real', () => {
  const p = new Pseudonimizador([{ nome: 'Fulana Testadora', tipo: 'pessoa' }, { nome: 'Ciclano Aluno Demo', tipo: 'aluno' }]);
  const oc = p.ocultar('PIX de Fulana Testadora; aluno Ciclano Aluno Demo');
  test('ocultar gera códigos', () => assert.match(oc, /Pessoa 1.*Aluno 1/));
  for (const v of ['Pessoa 1', 'pessoa 1', 'PESSOA 1', 'Pessoa1', 'Pessoa nº 1', 'Pessoa #1']) {
    test(`revelar "${v}"`, () => assert.equal(p.revelar(`Foi ${v}.`), 'Foi Fulana Testadora.'));
  }
  test('revelar aluno', () => assert.equal(p.revelar('aluno 1'), 'Ciclano Aluno Demo'));
  test('código sem nome é registrado', () => {
    p.revelar('Pessoa 9');
    assert.ok(p.naoResolvidos.has('Pessoa 9'));
  });
  test('carregarPaginado lê além de 1000 linhas', async () => {
    const all = Array.from({ length: 2500 }, (_, i) => ({ i }));
    const r = await carregarPaginado((a, b) => Promise.resolve({ data: all.slice(a, b + 1), error: null }));
    assert.equal(r.length, 2500);
  });
});

describe('D) cota de IA e modo simples útil', () => {
  test('cota: 20 por janela, renova depois', () => {
    let t = 0;
    const c = criarCota({ name: 'teste-cota', max: 20, windowMs: 5 * 60 * 1000, now: () => t });
    for (let i = 0; i < 20; i++) assert.equal(c.consumir('u:1'), true);
    assert.equal(c.consumir('u:1'), false);
    assert.equal(c.consumir('u:2'), true);
    t = 5 * 60 * 1000;
    assert.equal(c.consumir('u:1'), true);
  });
  const groq: LlmProviderConfig[] = [{ provider: 'groq', apiKey: 'x', models: ['m'] }];
  test('pergunta do roteador não consome cota', async () => {
    let n = 0;
    await gerarConsultaReply(
      { message: 'Pra quem foram as maiores saídas de outubro?', context: { monthYear: '2026-10' } },
      { providers: groq, consumirCotaIa: () => (n++, true), executeTool: async (tool) => ({ ok: true, tool, factsText: 'ok' }) as never },
    );
    assert.equal(n, 0);
  });
  test('cota esgotada → modo simples tenta o catálogo', async () => {
    let chamouFetch = false;
    const out = await gerarConsultaReply(
      { message: 'Resumo do mês, por favor, com detalhes de tudo', context: { monthYear: '2026-10' } },
      {
        providers: groq,
        consumirCotaIa: () => false,
        fetchImpl: (async () => { chamouFetch = true; return new Response('{}'); }) as never,
        nomesConhecidos: [],
        executeTool: async (tool) => ({ ok: true, tool, factsText: 'Resumo: R$ 10,00' }) as never,
      },
    );
    assert.equal(chamouFetch, false);
    assert.match(out.message, new RegExp(AVISO_COTA_IA.slice(0, 20)));
  });
  test('roteador cobre alunos ativos', () => {
    const r = rotearConsultaDeterministica('Quantos alunos ativos tem no pilates?', ctx);
    assert.ok(r && r.kind === 'tool' && r.tool === 'alunos_por_modalidade' && r.params.modalidade === 'pilates');
  });
});

describe('E) saídas', () => {
  test('roteia maiores saídas e professores', () => {
    const a = rotearConsultaDeterministica('Pra quem foram as maiores saídas de outubro?', ctx);
    assert.ok(a && a.kind === 'tool' && a.tool === 'maiores_saidas' && a.ctx.mes === 10);
    const b = rotearConsultaDeterministica('Quanto gastei com professores em setembro?', ctx);
    assert.ok(b && b.kind === 'tool' && b.tool === 'saidas_professores' && b.ctx.mes === 9);
  });
  const saidas = [
    { data: '2026-10-05', pessoa: 'LOCADORA FICTICIA 12345678000199', valor: -3000 },
    { data: '2026-10-10', pessoa: 'Professora Demo', valor: -800 },
    { data: '2026-10-20', pessoa: 'Professora Demo', valor: -700 },
    { data: '2026-10-21', pessoa: 'Mercado Exemplo', valor: -50 },
  ];
  test('maiores saídas agrupa e ordena, sem documento', () => {
    const t = textoMaioresSaidas(saidas, 10, 2026);
    assert.match(t, /1\. LOCADORA FICTICIA: R\$\s?3\.000,00/);
    assert.match(t, /2\. Professora Demo: R\$\s?1\.500,00 \(2/);
    assert.doesNotMatch(t, /12345678/);
  });
  test('professores com mapeamento', () => {
    const t = textoSaidasProfessores(saidas, [{ pessoa_normalizada: 'PROFESSORA DEMO', categoria: 'Repasse', subcategoria: 'Professor Yoga' }], 10, 2026);
    assert.match(t, /R\$\s?1\.500,00 em 2 lançamento/);
  });
  test('professores sem mapeamento explica a limitação', () => {
    const t = formatarRespostaUsuario(textoSaidasProfessores(saidas, [], 9, 2026));
    assert.match(t, /não tem categoria "professor"/);
    assert.match(t, /maiores saídas/);
    assert.doesNotMatch(t, /Não invente/);
  });
});
