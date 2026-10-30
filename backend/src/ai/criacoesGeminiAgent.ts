/**
 * Criações da IA — agente de IA (Groq primário / Gemini opcional, function calling só-leitura) que devolve um RASCUNHO JSON de apresentação.
 * O modelo vê datasets agregados (sem PII) e só pode referenciá-los por id/coluna; o servidor valida e preenche.
 */
import { CONSULTA_GEMINI_MODELS, stripPii } from './consultaGeminiAgent.js';
import { LlmHttpError, llmChat, type LlmMessage, type LlmProviderConfig, type LlmProviderId, type LlmToolDecl } from './llmProviders.js';
import { Pseudonimizador, type NomeConhecido } from './pseudonimizacao.js';
import type { Dataset } from './criacoesSpec.js';
import { CRIACAO_TOOL_DECLS, executarCriacaoTool, type CriacaoToolDeps, type MesAno } from '../services/criacoesDatasets.js';

const MAX_ITER = 5;

export function buildCriacoesPrompt(ref: MesAno, today: string): string {
  return [
    'Você monta APRESENTAÇÕES de dados financeiros do Espaço Byla (somente leitura).',
    `Hoje é ${today}. Mês de referência da tela: ${ref.ano}-${String(ref.mes).padStart(2, '0')}.`,
    'Passo 1: chame as funções para obter datasets. Passo 2: responda SOMENTE com um objeto JSON (sem markdown, sem código, sem HTML):',
    '{"titulo": str, "subtitulo": str?, "secoes": [ ... até 8 ... ]}',
    'Tipos de seção permitidos (nenhum outro campo):',
    '- {"type":"kpi_cards","titulo","itens":[{"label","dataset","linha": índice|"ultima"|"total","coluna"}]}',
    '- {"type":"line_chart"|"bar_chart"|"area_chart","titulo","descricao"?,"dataset","x","series":[colunas],"empilhado"?}',
    '- {"type":"donut","titulo","dataset","label","valor"}  - {"type":"ranking","titulo","dataset","label","valor","top"?}',
    '- {"type":"comparison","titulo","dataset","x","a": índice,"b": índice,"colunas":[...]}  - {"type":"table","titulo","dataset","colunas"?}',
    '- {"type":"narrative","titulo"?,"texto"}  (texto curto em pt-BR, SEM números/valores: os números aparecem nos gráficos).',
    '"dataset" é o dataset_id devolvido pelas funções; colunas devem existir nele. Nunca invente números nem datasets.',
    'Comece com kpi_cards, depois gráficos, e termine com uma narrative de leitura/insight.',
  ].join('\n');
}

export type CriacoesAgentDeps = {
  /** Compat: chave Gemini direta (usada se `providers` não vier). */
  apiKey?: string;
  providers?: LlmProviderConfig[];
  fetchImpl?: typeof fetch;
  toolDeps: CriacaoToolDeps;
  models?: readonly string[];
  today: string;
  nomesConhecidos?: NomeConhecido[];
  onPayload?: (messages: LlmMessage[]) => void;
};

export type CriacoesAgentResult =
  | { ok: true; draft: unknown; datasets: Dataset[]; model: string; provider: LlmProviderId }
  | { ok: false; reason: 'rate_limit' | 'error' | 'empty' | 'json'; detail: string };

/** Extrai o primeiro objeto JSON do texto (tolera cercas ```json). */
export function extrairJson(text: string): unknown {
  const t = text.replace(/```(?:json)?/gi, '').trim();
  const i = t.indexOf('{');
  const j = t.lastIndexOf('}');
  if (i < 0 || j <= i) throw new Error('sem JSON');
  return JSON.parse(t.slice(i, j + 1));
}

export async function runCriacoesAgent(prompt: string, ref: MesAno, deps: CriacoesAgentDeps): Promise<CriacoesAgentResult> {
  const providers =
    deps.providers ??
    (deps.apiKey ? [{ provider: 'gemini' as const, apiKey: deps.apiKey, models: deps.models ?? CONSULTA_GEMINI_MODELS }] : []);
  if (!providers.length) return { ok: false, reason: 'error', detail: 'Nenhum provedor de IA configurado' };
  const pseudo = new Pseudonimizador(deps.nomesConhecidos ?? []);
  const proteger = (t: string) => pseudo.ocultar(stripPii(t));
  const tools = CRIACAO_TOOL_DECLS as unknown as LlmToolDecl[];
  let lastErr = 'Falha IA';
  let rateLimited = false;
  for (const p of providers) {
    for (const model of p.models) {
      const convo: LlmMessage[] = [
        { role: 'system', content: buildCriacoesPrompt(ref, deps.today) },
        { role: 'user', content: proteger(prompt) },
      ];
      const datasets = new Map<string, Dataset>();
      try {
        for (let i = 0; i < MAX_ITER; i++) {
          deps.onPayload?.(convo);
          const reply = await llmChat(p, model, convo, tools, { fetchImpl: deps.fetchImpl, maxTokens: 2500, timeoutMs: 30000 });
          convo.push({ role: 'assistant', content: reply.text, toolCalls: reply.toolCalls, raw: reply.raw });
          if (reply.toolCalls.length === 0) {
            if (!reply.text.trim()) return { ok: false, reason: 'empty', detail: 'Resposta vazia' };
            try {
              const draft = pseudo.revelarArgs({ d: extrairJson(reply.text) }).d;
              return { ok: true, draft, datasets: [...datasets.values()], model, provider: p.provider };
            } catch {
              return { ok: false, reason: 'json', detail: 'Resposta não é JSON' };
            }
          }
          for (const c of reply.toolCalls.slice(0, 6)) {
            const out = await executarCriacaoTool(c.name, pseudo.revelarArgs(c.args), ref, deps.toolDeps);
            let content: string;
            if ('erro' in out) content = JSON.stringify({ erro: out.erro });
            else {
              datasets.set(out.id, out);
              content = JSON.stringify({ dataset_id: out.id, titulo: out.titulo, colunas: out.colunas, linhas: out.linhas });
            }
            convo.push({ role: 'tool', toolCallId: c.id, name: c.name, content: proteger(content) });
          }
        }
        return { ok: false, reason: 'error', detail: 'Limite de iterações' };
      } catch (e) {
        lastErr = (e as Error).message;
        if (e instanceof LlmHttpError && e.status === 429) rateLimited = true;
      }
    }
  }
  return { ok: false, reason: rateLimited ? 'rate_limit' : 'error', detail: lastErr };
}
