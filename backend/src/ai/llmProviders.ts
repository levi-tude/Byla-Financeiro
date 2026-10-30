/**
 * Abstração de provedor de LLM (Groq primário, Gemini opcional).
 * Groq: API compatível com OpenAI (chat completions + tools). Docs: https://console.groq.com/docs/tool-use
 * Nenhuma chave é logada; só status HTTP.
 */
import { config } from '../config.js';

export type LlmProviderId = 'groq' | 'gemini';

/** Modelos Groq com tool use (https://console.groq.com/docs/tool-use, tabela "Supported Models"). */
/**
 * Cota grátis Groq é por modelo (ex.: 8K tokens/min cada — console.groq.com/docs/rate-limits).
 * llama-3.3-70b-versatile foi desligado em 16/08/2026 (docs/deprecations) — não usar.
 */
export const GROQ_MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'] as const;
/** Espera máxima (s) para repetir uma vez após 429 com retry-after. */
export const GROQ_MAX_RETRY_AFTER_S = 6;
export const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-flash-latest'] as const;

export type LlmProviderConfig = { provider: LlmProviderId; apiKey: string; models: readonly string[] };

export type LlmToolCall = { id: string; name: string; args: Record<string, unknown> };
export type LlmMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: LlmToolCall[]; raw?: unknown }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

export type LlmToolDecl = { name: string; description: string; parameters: Record<string, unknown> };
export type LlmReply = { text: string; toolCalls: LlmToolCall[]; raw?: unknown };

export class LlmHttpError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Diagnóstico sem segredos: retry-after, tipo de limite, mensagem do provedor. */
    public info: { retryAfterS?: number; limite?: string; detalhe?: string } = {},
  ) {
    super(message);
  }
}

/** Extrai do 429 da Groq o tipo de limite (TPM/RPM/TPD/RPD) e números, sem dados sensíveis. */
export function parseGroqLimitError(bodyText: string): { limite?: string; detalhe?: string } {
  let msg = bodyText;
  try {
    const j = JSON.parse(bodyText) as { error?: { message?: string } };
    if (j.error?.message) msg = j.error.message;
  } catch {
    /* texto puro */
  }
  msg = msg.replace(/org_[A-Za-z0-9]+/g, 'org_***').replace(/\s+/g, ' ').trim().slice(0, 300);
  const m = msg.match(/\((TPM|RPM|TPD|RPD|ITPM|OTPM)\)|on (tokens|requests) per (minute|day)/i);
  let limite: string | undefined;
  if (m?.[1]) limite = m[1].toUpperCase();
  else if (m?.[2]) limite = `${m[2][0]!.toUpperCase()}P${m[3]![0]!.toUpperCase()}`;
  return { limite, detalhe: msg || undefined };
}

/**
 * Ordem de provedores: CONSULTA_AI_PROVIDER (ex.: "groq,gemini" ou "gemini"); padrão groq,gemini.
 * Só entra quem tem chave configurada.
 */
export function resolveLlmProviders(
  keys: { groq?: string; gemini?: string } = { groq: config.groqApiKey, gemini: config.geminiApiKey },
  order: string = process.env.CONSULTA_AI_PROVIDER ?? 'groq,gemini',
): LlmProviderConfig[] {
  const ids = order
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is LlmProviderId => s === 'groq' || s === 'gemini');
  const out: LlmProviderConfig[] = [];
  for (const id of [...new Set(ids)]) {
    const apiKey = keys[id];
    if (!apiKey) continue;
    out.push({ provider: id, apiKey, models: id === 'groq' ? GROQ_MODELS : GEMINI_MODELS });
  }
  return out;
}

type ChatOpts = { maxTokens?: number; fetchImpl?: typeof fetch; timeoutMs?: number; sleep?: (ms: number) => Promise<void> };

export async function llmChat(
  p: LlmProviderConfig,
  model: string,
  messages: LlmMessage[],
  tools: LlmToolDecl[] | undefined,
  opts: ChatOpts = {},
): Promise<LlmReply> {
  return p.provider === 'groq' ? groqChat(p, model, messages, tools, opts) : geminiChat(p, model, messages, tools, opts);
}

async function groqChat(
  p: LlmProviderConfig,
  model: string,
  messages: LlmMessage[],
  tools: LlmToolDecl[] | undefined,
  opts: ChatOpts,
): Promise<LlmReply> {
  const f = opts.fetchImpl ?? fetch;
  const body = {
    model,
    messages: messages.map((m) => {
      if (m.role === 'assistant') {
        return {
          role: 'assistant',
          content: m.content || null,
          ...(m.toolCalls?.length
            ? {
                tool_calls: m.toolCalls.map((c) => ({
                  id: c.id,
                  type: 'function',
                  function: { name: c.name, arguments: JSON.stringify(c.args) },
                })),
              }
            : {}),
        };
      }
      if (m.role === 'tool') return { role: 'tool', tool_call_id: m.toolCallId, name: m.name, content: m.content };
      return { role: m.role, content: m.content };
    }),
    ...(tools?.length ? { tools: tools.map((t) => ({ type: 'function', function: t })), tool_choice: 'auto' } : {}),
    max_completion_tokens: opts.maxTokens ?? 700,
    temperature: 0.2,
  };
  const payload = JSON.stringify(body);
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let res: Response | null = null;
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    res = await f('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey}` },
      body: payload,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 25000),
    });
    if (res.ok) break;
    const bodyText = await res.text().catch(() => '');
    const retryAfterS = Number(res.headers.get('retry-after') ?? NaN);
    const info = {
      ...parseGroqLimitError(bodyText),
      ...(Number.isFinite(retryAfterS) ? { retryAfterS } : {}),
    };
    // 429 de curta duração (TPM/RPM): espera o retry-after e tenta UMA vez.
    if (res.status === 429 && tentativa === 0 && Number.isFinite(retryAfterS) && retryAfterS <= GROQ_MAX_RETRY_AFTER_S) {
      await sleep(Math.max(0, retryAfterS) * 1000 + 250);
      continue;
    }
    throw new LlmHttpError(res.status, `Groq HTTP ${res.status}`, info);
  }
  if (!res?.ok) throw new LlmHttpError(res?.status ?? 0, `Groq HTTP ${res?.status ?? 0}`);
  const json = (await res.json()) as {
    choices?: { message?: { content?: string | null; tool_calls?: { id: string; function: { name: string; arguments?: string } }[] } }[];
  };
  const msg = json.choices?.[0]?.message;
  if (!msg) throw new LlmHttpError(200, 'Groq sem conteúdo');
  const toolCalls = (msg.tool_calls ?? []).map((c) => {
    let args: Record<string, unknown> = {};
    try {
      args = c.function.arguments ? (JSON.parse(c.function.arguments) as Record<string, unknown>) : {};
    } catch {
      args = {};
    }
    return { id: c.id, name: c.function.name, args };
  });
  return { text: msg.content ?? '', toolCalls };
}

type GeminiPart = {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
  thoughtSignature?: string;
};
type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] };

async function geminiChat(
  p: LlmProviderConfig,
  model: string,
  messages: LlmMessage[],
  tools: LlmToolDecl[] | undefined,
  opts: ChatOpts,
): Promise<LlmReply> {
  const f = opts.fetchImpl ?? fetch;
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const contents: GeminiContent[] = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'user') contents.push({ role: 'user', parts: [{ text: m.content }] });
    else if (m.role === 'assistant') {
      // Reenvia as parts originais (preserva thoughtSignature); senão texto.
      const raw = m.raw as GeminiContent | undefined;
      contents.push(raw?.parts ? { role: 'model', parts: raw.parts } : { role: 'model', parts: [{ text: m.content }] });
    } else if (m.role === 'tool') {
      const part: GeminiPart = { functionResponse: { name: m.name, response: JSON.parse(m.content) as Record<string, unknown> } };
      const last = contents.at(-1);
      if (last?.role === 'user' && last.parts.every((x) => x.functionResponse)) last.parts.push(part);
      else contents.push({ role: 'user', parts: [part] });
    }
  }
  const res = await f(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': p.apiKey },
    body: JSON.stringify({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents,
      ...(tools?.length ? { tools: [{ functionDeclarations: tools }] } : {}),
      generationConfig: { maxOutputTokens: opts.maxTokens ?? 1200 },
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 25000),
  });
  if (!res.ok) throw new LlmHttpError(res.status, `Gemini HTTP ${res.status}`);
  const json = (await res.json()) as { candidates?: { content?: GeminiContent }[] };
  const content = json.candidates?.[0]?.content;
  if (!content?.parts?.length) throw new LlmHttpError(200, 'Gemini sem conteúdo');
  const toolCalls = content.parts
    .filter((x) => x.functionCall)
    .map((x, i) => ({ id: `g${i}`, name: x.functionCall!.name, args: x.functionCall!.args ?? {} }));
  return {
    text: content.parts.map((x) => x.text ?? '').join(''),
    toolCalls,
    raw: { role: 'model', parts: content.parts },
  };
}

/** Geração de texto simples (sem tools) com a mesma ordem de provedores e fallback de modelo. */
export async function llmGenerateText(
  messages: LlmMessage[],
  opts: ChatOpts & { providers?: LlmProviderConfig[] } = {},
): Promise<{ ok: true; text: string; provider: LlmProviderId; model: string } | { ok: false; reason: 'rate_limit' | 'error' | 'no_provider'; detail: string }> {
  const providers = opts.providers ?? resolveLlmProviders();
  if (!providers.length) return { ok: false, reason: 'no_provider', detail: 'Nenhum provedor de IA configurado.' };
  let last: Error | null = null;
  for (const p of providers) {
    for (const model of p.models) {
      try {
        const r = await llmChat(p, model, messages, undefined, opts);
        if (r.text.trim()) return { ok: true, text: r.text, provider: p.provider, model };
      } catch (e) {
        last = e as Error;
      }
    }
  }
  if (last instanceof LlmHttpError && last.status === 429) return { ok: false, reason: 'rate_limit', detail: last.message };
  return { ok: false, reason: 'error', detail: last?.message ?? 'Resposta vazia' };
}
