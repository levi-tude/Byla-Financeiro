/**
 * Consulta Byla — agente Gemini com function calling (só leitura).
 * O modelo só escolhe tools declaradas aqui; os números vêm sempre dos resultados das tools.
 * Nenhum SQL vem do modelo: os argumentos são validados e convertidos em parâmetros fixos.
 */

import type { ConsultaToolId } from './consultaCatalog.js';
import type { ConsultaToolContext, ConsultaToolResult } from '../services/consultaBylaTools.js';

/** Modelos em ordem de preferência (verificados em ai.google.dev/gemini-api/docs/models, out/2026). */
export const CONSULTA_GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-flash-latest'] as const;
export const MAX_AGENT_ITERATIONS = 5;

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
  { name: 'resumo_modalidades', description: 'Entradas do banco por modalidade no mês.', params: MES_ANO },
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
    name: 'saidas_planilha_controle',
    description: 'Saídas/despesas por categoria do Controle de caixa (modo Planilha): parceiros, fixas e maiores linhas.',
    params: MES_ANO,
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

/** Remove CPF, telefone e e-mail antes de enviar ao Gemini. */
export function stripPii(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email omitido]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[cpf omitido]')
    .replace(/(\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g, '[telefone omitido]');
}

export function buildSystemPrompt(ctx: ConsultaToolContext, today: string): string {
  return [
    'Você é o Consulta Byla, assistente de consulta (somente leitura) do Espaço Byla, escola de dança, yoga, pilates e teatro em Salvador.',
    `Hoje é ${today}. Mês selecionado na tela: ${String(ctx.mes).padStart(2, '0')}/${ctx.ano}.`,
    'Use as funções disponíveis para buscar dados do banco (extrato, Fluxo, Controle) e das planilhas. Pode chamar várias funções.',
    'REGRA DE OURO: todo número, valor, data ou nome da resposta deve vir dos resultados das funções. Nunca invente, estime ou complete dados.',
    'Se as funções não trouxerem o dado, diga que não encontrou e sugira a tela do sistema. Se faltar informação (ex.: nome, mês), pergunte de forma curta.',
    'Você não pode alterar nada no sistema. Se pedirem para alterar, explique que o chat é só consulta.',
    'Responda em português do Brasil, curto e claro para secretaria/gestão, sem markdown (sem ** nem #). Valores em R$.',
  ].join('\n');
}

type GeminiPart = {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
  thoughtSignature?: string;
};
type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] };

export type AgentDeps = {
  apiKey: string;
  fetchImpl?: typeof fetch;
  executeTool: (tool: ConsultaToolId, params: Record<string, string>, ctx: ConsultaToolContext) => Promise<ConsultaToolResult>;
  models?: readonly string[];
  today: string;
};

export type AgentResult =
  | { ok: true; text: string; toolsUsed: ConsultaToolId[]; model: string }
  | { ok: false; reason: 'rate_limit' | 'error' | 'empty'; detail: string };

export class GeminiHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function callGemini(
  deps: AgentDeps,
  model: string,
  system: string,
  contents: GeminiContent[],
): Promise<GeminiContent> {
  const f = deps.fetchImpl ?? fetch;
  const res = await f(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': deps.apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      tools: [{ functionDeclarations: geminiFunctionDeclarations() }],
      generationConfig: { maxOutputTokens: 1200 },
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new GeminiHttpError(res.status, `Gemini HTTP ${res.status}`);
  const json = (await res.json()) as { candidates?: { content?: GeminiContent }[] };
  const content = json.candidates?.[0]?.content;
  if (!content?.parts?.length) throw new GeminiHttpError(200, 'Gemini sem conteúdo');
  return { role: 'model', parts: content.parts };
}

export async function runConsultaAgent(
  message: string,
  history: ChatHistoryItem[],
  ctx: ConsultaToolContext,
  deps: AgentDeps,
): Promise<AgentResult> {
  const system = buildSystemPrompt(ctx, deps.today);
  const contents: GeminiContent[] = [
    ...history.map<GeminiContent>((h) => ({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: stripPii(h.content) }],
    })),
    { role: 'user', parts: [{ text: stripPii(message) }] },
  ];
  const models = deps.models ?? CONSULTA_GEMINI_MODELS;
  let lastErr: GeminiHttpError | Error | null = null;

  for (const model of models) {
    const convo = [...contents];
    const toolsUsed: ConsultaToolId[] = [];
    try {
      for (let i = 0; i < MAX_AGENT_ITERATIONS; i++) {
        const reply = await callGemini(deps, model, system, convo);
        convo.push(reply);
        const calls = reply.parts.filter((p) => p.functionCall);
        if (calls.length === 0) {
          const text = reply.parts.map((p) => p.text ?? '').join('').replace(/\*\*/g, '').trim();
          if (!text) return { ok: false, reason: 'empty', detail: 'Resposta vazia' };
          return { ok: true, text, toolsUsed, model };
        }
        const responses: GeminiPart[] = [];
        for (const p of calls) {
          const call = p.functionCall!;
          const norm = normalizeToolCall(call.name, call.args, ctx);
          let output: Record<string, unknown>;
          if (!norm) {
            output = { erro: 'Função desconhecida.' };
          } else {
            toolsUsed.push(norm.tool);
            const r = await deps.executeTool(norm.tool, norm.params, norm.ctx);
            output = r.ok ? { fatos: stripPii(r.factsText) } : { erro: stripPii(r.error) };
          }
          responses.push({ functionResponse: { name: call.name, response: output } });
        }
        convo.push({ role: 'user', parts: responses });
      }
      return { ok: false, reason: 'error', detail: 'Limite de iterações atingido' };
    } catch (e) {
      lastErr = e as Error;
      if (e instanceof GeminiHttpError && e.status === 429) {
        return { ok: false, reason: 'rate_limit', detail: e.message };
      }
      // 404/400 de modelo: tenta o próximo da lista.
    }
  }
  return { ok: false, reason: 'error', detail: lastErr?.message ?? 'Falha Gemini' };
}
