/**
 * Consulta Byla — agente Gemini com function calling (só leitura).
 * O modelo só escolhe tools declaradas aqui; os números vêm sempre dos resultados das tools.
 * Nenhum SQL vem do modelo: os argumentos são validados e convertidos em parâmetros fixos.
 */

import {
  GEMINI_MODELS,
  LlmHttpError,
  llmChat,
  type LlmMessage,
  type LlmProviderConfig,
  type LlmProviderId,
  type LlmToolDecl,
} from './llmProviders.js';
import { Pseudonimizador, type NomeConhecido } from './pseudonimizacao.js';
import { textoParaLlm } from './instrucaoIa.js';
import type { ConsultaToolId } from './consultaCatalog.js';
import type { ConsultaToolContext, ConsultaToolResult } from '../services/consultaBylaTools.js';

/** Modelos em ordem de preferência (verificados em ai.google.dev/gemini-api/docs/models, out/2026). */
export const CONSULTA_GEMINI_MODELS = GEMINI_MODELS;
export const MAX_AGENT_ITERATIONS = 5;
/** Resultado de função enviado ao LLM (chars). Cota grátis Groq ~8K tokens/min por modelo. */
export const MAX_TOOL_RESULT_CHARS = 3500;
/** Histórico enviado ao LLM: últimas N mensagens, cada uma cortada. */
export const MAX_HISTORY_MSGS = 4;
export const MAX_HISTORY_CHARS = 600;

function cortar(t: string, max: number): string {
  return t.length > max ? `${t.slice(0, max)}\n[… resultado cortado; peça um recorte menor se precisar]` : t;
}

export type LlmFalha = { provider: LlmProviderId; model: string; status: number; retryAfterS?: number; limite?: string; detalhe?: string };

export type ChatHistoryItem = { role: 'user' | 'assistant'; content: string };

type ParamSpec = { type: 'string' | 'number'; description: string };
type ToolDecl = { name: ConsultaToolId; description: string; params?: Record<string, ParamSpec>; required?: string[] };

const MES_ANO: Record<string, ParamSpec> = {
  mes: { type: 'number', description: 'Mês 1-12. Se omitido, usa o mês selecionado na tela.' },
  ano: { type: 'number', description: 'Ano com 4 dígitos.' },
};
const DATA: ParamSpec = { type: 'string', description: 'Data no formato YYYY-MM-DD. Se omitida, hoje.' };

export const CONSULTA_TOOL_DECLS: ToolDecl[] = [
  { name: 'resumo_mes', description: 'Entradas, saídas e saldo do mês no extrato bancário oficial.', params: MES_ANO },
  { name: 'resumo_semana', description: 'Entradas/saídas da semana (seg–dom) que contém a data.', params: { data_ref: DATA } },
  { name: 'resumo_dia', description: 'Entradas/saídas do extrato em um dia.', params: { data: DATA } },
  {
    name: 'resumo_periodo',
    description: 'Entradas/saídas do extrato entre duas datas.',
    params: { inicio: DATA, fim: DATA },
    required: ['inicio', 'fim'],
  },
  { name: 'resumo_modalidades', description: 'Entradas por modalidade/aba no mês, dos pagamentos lançados no Fluxo de caixa (fluxo_pagamentos_operacionais).', params: MES_ANO },
  { name: 'controle_oficial_vs_sistema', description: 'Controle de caixa: Planilha × Sistema (entradas, saídas, lucro).', params: MES_ANO },
  { name: 'resumo_categoria_extrato', description: 'Extrato/Movimentações (planilha Entrada/Saída) agrupado por categoria no mês.', params: MES_ANO },
  { name: 'resumo_meio_pagamento', description: 'Entradas por meio de pagamento (PIX, cartão, dinheiro…) no mês.', params: MES_ANO },
  { name: 'pendentes_conciliacao', description: 'Conciliação de pagamentos do mês: em dia, atrasado, pendente.', params: MES_ANO },
  { name: 'pagamentos_fluxo_dia', description: 'Pagamentos lançados no Fluxo de caixa em um dia.', params: { data: DATA } },
  { name: 'movimentos_banco_dia', description: 'Movimentos do banco em um dia.', params: { data: DATA } },
  { name: 'sem_vinculo_validacao', description: 'Entradas do banco sem vínculo na Validação no mês.', params: MES_ANO },
  {
    name: 'busca_aluno',
    description: 'Situação de pagamentos de um aluno no mês.',
    params: { ...MES_ANO, nome: { type: 'string', description: 'Nome (ou parte) do aluno.' } },
    required: ['nome'],
  },
  {
    name: 'busca_por_valor',
    description: 'Procura lançamentos do banco com um valor (R$) no mês ou em uma data.',
    params: { ...MES_ANO, valor: { type: 'number', description: 'Valor em reais, ex.: 250.5' }, data: DATA },
    required: ['valor'],
  },
  {
    name: 'alunos_por_modalidade',
    description: 'Quantidade de alunos ativos/inativos por modalidade; se informar a modalidade, lista os ativos dela.',
    params: { modalidade: { type: 'string', description: 'Modalidade ou aba (ex.: Yoga, Pilates). Opcional.' } },
  },
  {
    name: 'inadimplencia_mes',
    description: 'Quem não pagou na competência do mês (planilha do Fluxo), com situação em aberto / a vencer.',
    params: MES_ANO,
  },
  {
    name: 'comparar_meses',
    description: 'Compara entradas, saídas e saldo de dois meses no extrato oficial.',
    params: {
      mes_a: { type: 'string', description: 'Primeiro mês, formato YYYY-MM.' },
      mes_b: { type: 'string', description: 'Segundo mês, formato YYYY-MM.' },
    },
    required: ['mes_a', 'mes_b'],
  },
  {
    name: 'balanco_meses',
    description: 'Balanço (entradas, saídas, saldo) mês a mês dos últimos N meses até o mês de referência, com total. Use para "últimos 4 meses".',
    params: { ...MES_ANO, meses: { type: 'number', description: 'Quantidade de meses (1-12).' } },
    required: ['meses'],
  },
  {
    name: 'entradas_modalidade_periodo',
    description: 'Quanto entrou de uma modalidade (ex.: Pilates, Yoga) em um mês ou período, mês a mês e total.',
    params: {
      ...MES_ANO,
      modalidade: { type: 'string', description: 'Nome da modalidade.' },
      mes_inicio: { type: 'string', description: 'Início YYYY-MM (opcional; sem ele usa o mês de referência).' },
      mes_fim: { type: 'string', description: 'Fim YYYY-MM (opcional).' },
    },
    required: ['modalidade'],
  },
  {
    name: 'movimentos_por_pessoa',
    description:
      'Movimentos de uma pessoa, professor, parceiro ou apelido (ex.: "Pholha"): o que a Byla RECEBEU dela e o que PAGOU a ela. Busca por nome e pela categoria do mapeamento pessoa→categoria (resolve apelido → pagador real no banco), no extrato (entradas e saídas), no Controle de caixa e na planilha de saídas/repasses. Use para "quanto foi o pagamento do X" e responda a direção (recebido de / pago a).',
    params: {
      ...MES_ANO,
      nome: { type: 'string', description: 'Nome ou parte do nome do beneficiário.' },
      mes_inicio: { type: 'string', description: 'Início YYYY-MM (opcional).' },
      mes_fim: { type: 'string', description: 'Fim YYYY-MM (opcional).' },
    },
    required: ['nome'],
  },
  {
    name: 'saidas_planilha_controle',
    description: 'Saídas/despesas por categoria do Controle de caixa (modo Planilha): parceiros, fixas e maiores linhas.',
    params: MES_ANO,
  },
  {
    name: 'maiores_saidas',
    description: 'Maiores saídas/gastos do mês no extrato bancário, por destinatário e maiores lançamentos ("pra quem foram as maiores saídas").',
    params: MES_ANO,
  },
  {
    name: 'saidas_professores',
    description: 'Gastos/pagamentos a professores no mês (extrato + mapeamento pessoa→categoria). Explica a limitação se não houver categoria.',
    params: MES_ANO,
  },
  {
    name: 'quem_nao_pagou',
    description:
      'Quem não pagou a mensalidade de um mês (por competência), com o mesmo cálculo da tela Fluxo de caixa: pendente, parcial e previsto (plano semestral sem lançamento). Exclui bolsa/exceção. Lista completa paginada.',
    params: {
      ...MES_ANO,
      modalidade: { type: 'string', description: 'Modalidade/aba (ex.: pilates). Opcional.' },
      pagina: { type: 'number', description: 'Página da lista (1, 2…). Opcional.' },
    },
  },
  {
    name: 'saldo_aluno',
    description: 'Quanto um aluno deve: esperado × pago por mês (competência) e total em aberto, mesmo cálculo da tela Fluxo de caixa.',
    params: {
      ...MES_ANO,
      nome: { type: 'string', description: 'Nome do aluno.' },
      meses: { type: 'number', description: 'Quantos meses até o mês informado (padrão 6, máx. 12).' },
    },
    required: ['nome'],
  },
  {
    name: 'precos_planos',
    description: 'Preços dos planos (tabela oficial de planos). Sem preço oficial, mostra o valor praticado pelos alunos ativos (não oficial).',
    params: {
      modalidade: { type: 'string', description: 'Modalidade (ex.: pilates). Opcional.' },
      frequencia: { type: 'string', description: 'Vezes por semana (ex.: 2x). Opcional.' },
      tipo: { type: 'string', description: 'mensal, trimestral ou semestral. Opcional.' },
    },
  },
  {
    name: 'repasses_professores',
    description:
      'Repasses/pagamentos a professores (quem dá aula) no mês: bloco Saídas Parceiros do Controle de caixa e saídas do extrato. Sócios não são professores.',
    params: { ...MES_ANO, professor: { type: 'string', description: 'Apelido do professor ou atividade (opcional).' } },
  },
  {
    name: 'resumo_planilha_fluxo',
    description: 'Planilha FLUXO DE CAIXA: alunos e mensalidades da competência por aba.',
    params: MES_ANO,
  },
];

const TOOL_NAMES = new Set<string>(CONSULTA_TOOL_DECLS.map((t) => t.name));

export function geminiFunctionDeclarations(): unknown[] {
  return CONSULTA_TOOL_DECLS.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(t.params ?? {}).map(([k, v]) => [k, { type: v.type, description: v.description }]),
      ),
      ...(t.required ? { required: t.required } : {}),
    },
  }));
}

/** Converte args do modelo em params fixos e validados. Retorna null se a tool não existe. */
export function normalizeToolCall(
  name: string,
  args: Record<string, unknown> | undefined,
  base: ConsultaToolContext,
): { tool: ConsultaToolId; params: Record<string, string>; ctx: ConsultaToolContext } | null {
  if (!TOOL_NAMES.has(name)) return null;
  const decl = CONSULTA_TOOL_DECLS.find((t) => t.name === name)!;
  const allowed = decl.params ?? {};
  const params: Record<string, string> = {};
  const ctx = { ...base };
  for (const [k, v] of Object.entries(args ?? {})) {
    if (!(k in allowed) || v == null) continue;
    const s = String(v).trim().slice(0, 80);
    if (!s) continue;
    if (k === 'mes') {
      const n = Number(s);
      if (Number.isInteger(n) && n >= 1 && n <= 12) ctx.mes = n;
      continue;
    }
    if (k === 'ano') {
      const n = Number(s);
      if (Number.isInteger(n) && n >= 2000 && n <= 2100) ctx.ano = n;
      continue;
    }
    if (allowed[k]!.type === 'string' && allowed[k] === DATA && !/^\d{4}-\d{2}-\d{2}$/.test(s)) continue;
    if (allowed[k]!.type === 'number' && !Number.isFinite(Number(s))) continue;
    params[k] = s;
  }
  // Mesma semântica do menu: pede o dado se faltar.
  if (decl.required?.some((r) => !params[r])) params.precisa_dado = '1';
  return { tool: name as ConsultaToolId, params, ctx };
}

/** Remove CPF/CNPJ (completos, parciais, mascarados ou colados ao nome), telefone e e-mail antes de enviar ao LLM. */
export function stripPii(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email omitido]')
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[cnpj omitido]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[cpf omitido]')
    // CPF/CNPJ mascarado/parcial (ex.: ***.456.789-**, 12.345.678/****-**).
    .replace(/[*\d]*\*[*\d.\/-]*\d[*\d.\/-]*|\d[\d.\/-]*\*[*\d.\/-]*/g, '[doc omitido]')
    // Dígitos de documento colados a um nome (ex.: "FULANO 12345678", "FULANO12345678").
    .replace(/(\p{L})\s?\d{6,14}\b/gu, '$1 [doc omitido]')
    .replace(/(\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g, '[telefone omitido]');
}

const COBERTURA_RE = /Dados do extrato até (\d{2}\/\d{2}\/\d{4})\.(?: ATENÇÃO: período incompleto[^\n]*)?/g;
const SEM_DADOS_RE = /Sem dados do extrato para esse período[^\n]*/g;

/**
 * Pós-processa a resposta da IA com base nos fatos das tools (texto real, não pseudonimizado):
 * - todas as consultas ao extrato sem lançamento → resposta "sem dados" (nunca R$ 0,00);
 * - falta a data de cobertura ("até DD/MM/AAAA") → anexa a linha de cobertura.
 */
export function garantirCoberturaExtrato(texto: string, fatos: string[]): string {
  const semDados = fatos.flatMap((f) => f.match(SEM_DADOS_RE) ?? []);
  const cobertura = [...new Set(fatos.flatMap((f) => f.match(COBERTURA_RE) ?? []))];
  if (semDados.length && !cobertura.length) {
    if (/R\$\s*0,00|\bzero\b/i.test(texto) || !/sem dados/i.test(texto)) {
      return `Sem dados para esse período. ${[...new Set(semDados)].join(' ')}`;
    }
    return texto;
  }
  const faltando = cobertura.filter((c) => !texto.includes(c.match(/\d{2}\/\d{2}\/\d{4}/)![0]!));
  const incompletoSemAviso = cobertura.some((c) => c.includes('incompleto')) && !/incomplet/i.test(texto);
  if (faltando.length || incompletoSemAviso) return `${texto}\n\n${cobertura.join(' ')}`;
  return texto;
}

const BASE_RE = /Base: (data de pagamento|competência)/;

/** Se os fatos informam a base (data de pagamento × competência) e a resposta não cita, anexa. */
export function garantirBaseValor(texto: string, fatos: string[]): string {
  const bases = [...new Set(fatos.flatMap((f) => (f.match(BASE_RE) ? [f.match(BASE_RE)![1]!] : [])))];
  if (!bases.length) return texto;
  const t = texto.toLowerCase();
  if (bases.every((b) => t.includes(b))) return texto;
  return `${texto}\n\nBase: ${bases.join(' e ')}.`;
}

export function buildSystemPrompt(ctx: ConsultaToolContext, today: string): string {
  return [
    'Você é o Consulta Byla, assistente de consulta (somente leitura) do Espaço Byla, escola de dança, yoga, pilates e teatro em Salvador.',
    `Hoje é ${today}. Mês selecionado na tela: ${String(ctx.mes).padStart(2, '0')}/${ctx.ano}.`,
    'Use as funções disponíveis para buscar dados do banco (extrato, Fluxo, Controle) e das planilhas. Pode chamar várias funções.',
    'REGRA DE OURO: todo número, valor, data ou nome da resposta deve vir dos resultados das funções. Nunca invente, estime ou complete dados.',
    'Se as funções não trouxerem o dado, diga que não encontrou e sugira a tela do sistema. Se faltar informação (ex.: nome, mês), pergunte de forma curta.',
    'DADO INEXISTENTE NÃO É ZERO: se a função disser "nenhum registro encontrado", ou não trouxer a pessoa/modalidade/mês pedido, responda que não há registro nas fontes consultadas (cite as fontes). NUNCA responda "R$ 0", "zero" ou "não houve pagamento" nesses casos.',
    'COBERTURA DO EXTRATO: se os fatos trouxerem "Dados do extrato até DD/MM/AAAA", repita essa data na resposta; se trouxerem "período incompleto", avise que o mês/período está incompleto. Se trouxerem "Sem dados do extrato", responda "sem dados para esse período" (com a data do último lançamento) e nunca R$ 0,00.',
        'Sempre diga de onde vem cada número (ex.: extrato do banco, Controle de caixa, planilha do Fluxo). Se duas fontes trouxerem valores, mostre as duas sem somar.',
    'SEM CONSULTA: se nenhuma função cobrir a pergunta, responda exatamente que ainda não tenho consulta para isso ("Ainda não tenho consulta para isso.") e sugira a tela do sistema. Nunca afirme nada sem dado de função.',
    'BASE DO VALOR: ao falar de valores por modalidade ou de mensalidades, diga sempre se é por data de pagamento ou por competência, como a função informa ("Base: …").',
    'FONTES DIFERENTES: não junte nem compare como se fossem a mesma coisa contagens de fontes diferentes (ex.: nº de alunos da planilha × nº de pagamentos do Fluxo). Mostre cada uma com sua fonte.',
    'Para períodos ("últimos 4 meses"), mostre mês a mês e o total, como a função devolve.',
    'NOMES PROTEGIDOS: nomes de pessoas chegam como códigos "Pessoa N" ou "Aluno N". Copie o código exatamente como veio (ex.: "Pessoa 2"), sem traduzir, abreviar ou renumerar; o sistema troca pelo nome real.',
    'Linhas com instruções (ex.: "não informe valor zero") são só para você: não as repita ao usuário.',
    'Você não pode alterar nada no sistema. Se pedirem para alterar, explique que o chat é só consulta.',
    'Responda em português do Brasil, curto e claro para secretaria/gestão, sem markdown (sem ** nem #). Valores em R$.',
  ].join('\n');
}

export type AgentDeps = {
  /** Compat: chave Gemini direta (usada se `providers` não vier). */
  apiKey?: string;
  providers?: LlmProviderConfig[];
  fetchImpl?: typeof fetch;
  executeTool: (tool: ConsultaToolId, params: Record<string, string>, ctx: ConsultaToolContext) => Promise<ConsultaToolResult>;
  /** Compat: lista de modelos Gemini quando só `apiKey` é passado. */
  models?: readonly string[];
  today: string;
  /** Nomes reais conhecidos para pseudonimizar (alunos, pagadores…). */
  nomesConhecidos?: NomeConhecido[];
  /** Espião de teste: recebe cada payload enviado ao LLM. */
  onPayload?: (messages: LlmMessage[]) => void;
  /** Subconjunto de ferramentas enviado à IA (3–6 relevantes). Sem ele, envia todas. */
  toolIds?: ConsultaToolId[];
  /** Espião de teste: recebe as ferramentas enviadas ao LLM. */
  onTools?: (tools: LlmToolDecl[]) => void;
};

export type AgentResult =
  | { ok: true; text: string; toolsUsed: ConsultaToolId[]; model: string; provider: LlmProviderId }
  | { ok: false; reason: 'rate_limit' | 'error' | 'empty'; detail: string; falhas?: LlmFalha[] };

/** @deprecated use LlmHttpError */
export const GeminiHttpError = LlmHttpError;

export function llmToolDecls(): LlmToolDecl[] {
  return geminiFunctionDeclarations() as LlmToolDecl[];
}

export async function runConsultaAgent(
  message: string,
  history: ChatHistoryItem[],
  ctx: ConsultaToolContext,
  deps: AgentDeps,
): Promise<AgentResult> {
  const providers =
    deps.providers ??
    (deps.apiKey ? [{ provider: 'gemini' as const, apiKey: deps.apiKey, models: deps.models ?? CONSULTA_GEMINI_MODELS }] : []);
  if (!providers.length) return { ok: false, reason: 'error', detail: 'Nenhum provedor de IA configurado' };
  const pseudo = new Pseudonimizador(deps.nomesConhecidos ?? []);
  const proteger = (t: string) => pseudo.ocultar(stripPii(t));

  const base: LlmMessage[] = [
    { role: 'system', content: buildSystemPrompt(ctx, deps.today) },
    ...history.slice(-MAX_HISTORY_MSGS).map<LlmMessage>((h) => ({ role: h.role, content: cortar(proteger(h.content), MAX_HISTORY_CHARS) })),
    { role: 'user', content: proteger(message) },
  ];
  const todas = llmToolDecls();
  const filtradas = deps.toolIds?.length ? todas.filter((t) => deps.toolIds!.includes(t.name as ConsultaToolId)) : todas;
  const tools = filtradas.length ? filtradas : todas;
  deps.onTools?.(tools);
  let lastErr: Error | null = null;
  let rateLimited = false;
  const falhas: LlmFalha[] = [];

  for (const p of providers) {
    for (const model of p.models) {
      const convo = [...base];
      const toolsUsed: ConsultaToolId[] = [];
      const fatosTools: string[] = [];
      try {
        for (let i = 0; i < MAX_AGENT_ITERATIONS; i++) {
          deps.onPayload?.(convo);
          const reply = await llmChat(p, model, convo, tools, { fetchImpl: deps.fetchImpl });
          convo.push({ role: 'assistant', content: reply.text, toolCalls: reply.toolCalls, raw: reply.raw });
          if (reply.toolCalls.length === 0) {
            const bruto = pseudo.revelar(reply.text.replace(/\*\*/g, '').trim());
            if (!bruto) return { ok: false, reason: 'empty', detail: 'Resposta vazia' };
            const text = garantirBaseValor(garantirCoberturaExtrato(bruto, fatosTools), fatosTools);
            return { ok: true, text, toolsUsed, model, provider: p.provider };
          }
          for (const call of reply.toolCalls) {
            // Códigos ("Aluno 1") voltam a nomes reais só aqui, no servidor.
            const norm = normalizeToolCall(call.name, pseudo.revelarArgs(call.args), ctx);
            let output: Record<string, unknown>;
            if (!norm) {
              output = { erro: 'Função desconhecida.' };
            } else {
              toolsUsed.push(norm.tool);
              const r = await deps.executeTool(norm.tool, norm.params, norm.ctx);
              if (r.ok) fatosTools.push(r.factsText);
              output = r.ok ? { fatos: cortar(proteger(textoParaLlm(r.factsText)), MAX_TOOL_RESULT_CHARS) } : { erro: proteger(r.error) };
            }
            convo.push({ role: 'tool', toolCallId: call.id, name: call.name, content: JSON.stringify(output) });
          }
        }
        return { ok: false, reason: 'error', detail: 'Limite de iterações atingido' };
      } catch (e) {
        lastErr = e as Error;
        // 429: tenta o próximo modelo/provedor (cota é por modelo); 4xx/5xx de modelo também.
        if (e instanceof LlmHttpError) {
          if (e.status === 429) rateLimited = true;
          falhas.push({ provider: p.provider, model, status: e.status, ...e.info });
        } else {
          falhas.push({ provider: p.provider, model, status: 0, detalhe: String(lastErr?.message ?? '').slice(0, 200) });
        }
      }
    }
  }
  if (rateLimited) return { ok: false, reason: 'rate_limit', detail: lastErr?.message ?? 'HTTP 429', falhas };
  return { ok: false, reason: 'error', detail: lastErr?.message ?? 'Falha IA', falhas };
}
