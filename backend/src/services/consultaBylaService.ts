/**
 * Orquestrador Consulta Byla: menu/keywords → tools; fatos só das tools.
 */

import {
  CONSULTA_MENU_LABELS,
  mensagemRecusaForaDoCatalogo,
  parseMonthYearContext,
  resolveConsultaIntent,
  type ConsultaToolId,
} from '../ai/consultaCatalog.js';
import { config } from '../config.js';
import { executeConsultaTool } from './consultaBylaTools.js';
import { runConsultaAgent, type AgentDeps, type ChatHistoryItem } from '../ai/consultaGeminiAgent.js';
import { todayIsoLocal } from '../ai/consultaCatalog.js';

export type ConsultaServiceInput = {
  message: string;
  history?: ChatHistoryItem[];
  context?: {
    route?: string;
    role?: 'secretaria' | 'admin' | 'gestor' | null;
    monthYear?: string;
  };
};

export type ConsultaServiceOutput = {
  message: string;
  tool: ConsultaToolId | null;
  confidence: number;
  quickReplies: string[];
  providerUsed: 'deterministic' | 'gemini' | 'groq' | 'openai' | 'fallback';
};

function defaultMesAno(monthYear?: string): { mes: number; ano: number } {
  const parsed = parseMonthYearContext(monthYear);
  if (parsed) return parsed;
  const d = new Date();
  return { mes: d.getMonth() + 1, ano: d.getFullYear() };
}

function sanitize(raw: string): string {
  return raw
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export type ConsultaReplyDeps = {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  executeTool?: AgentDeps['executeTool'];
};

const AVISO_FALLBACK: Record<'rate_limit' | 'error' | 'empty', string> = {
  rate_limit: 'O limite gratuito da IA foi atingido agora; respondi no modo simples (menu).',
  error: 'A IA não respondeu agora; respondi no modo simples (menu).',
  empty: 'A IA não respondeu agora; respondi no modo simples (menu).',
};

export async function gerarConsultaReply(
  input: ConsultaServiceInput,
  deps: ConsultaReplyDeps = {},
): Promise<ConsultaServiceOutput> {
  const apiKey = deps.apiKey ?? config.geminiApiKey;
  const executeTool = deps.executeTool ?? executeConsultaTool;
  let aviso = '';
  if (apiKey) {
    const ctx = defaultMesAno(input.context?.monthYear);
    const r = await runConsultaAgent(input.message, input.history ?? [], ctx, {
      apiKey,
      fetchImpl: deps.fetchImpl,
      executeTool,
      today: todayIsoLocal(),
    });
    if (r.ok) {
      return {
        message: sanitize(r.text),
        tool: r.toolsUsed[0] ?? null,
        confidence: 1,
        quickReplies: CONSULTA_MENU_LABELS.slice(0, 8),
        providerUsed: 'gemini',
      };
    }
    aviso = AVISO_FALLBACK[r.reason];
  }
  const det = await gerarConsultaDeterministica(input, executeTool);
  if (aviso) return { ...det, message: `${aviso}\n\n${det.message}`, providerUsed: 'fallback' };
  return det;
}

async function gerarConsultaDeterministica(
  input: ConsultaServiceInput,
  executeTool: AgentDeps['executeTool'],
): Promise<ConsultaServiceOutput> {
  const quickReplies = CONSULTA_MENU_LABELS.slice(0, 8);
  const intent = resolveConsultaIntent(input.message);

  if (!intent) {
    return {
      message: mensagemRecusaForaDoCatalogo(),
      tool: null,
      confidence: 0,
      quickReplies: CONSULTA_MENU_LABELS,
      providerUsed: 'deterministic',
    };
  }

  const ctx = defaultMesAno(input.context?.monthYear);
  const result = await executeTool(intent.tool, intent.params, ctx);

  if (!result.ok) {
    return {
      message: result.error,
      tool: result.tool,
      confidence: intent.confidence,
      quickReplies: result.needsClarification ? quickReplies : CONSULTA_MENU_LABELS,
      providerUsed: 'deterministic',
    };
  }

  return {
    message: result.factsText,
    tool: result.tool,
    confidence: intent.confidence,
    quickReplies,
    providerUsed: 'deterministic',
  };
}

export function getConsultaProviderStatus(): {
  configured: boolean;
  provider: 'gemini' | 'groq' | 'openai' | null;
} {
  if (config.geminiApiKey) return { configured: true, provider: 'gemini' };
  if (config.groqApiKey) return { configured: true, provider: 'groq' };
  if (config.openaiApiKey) return { configured: true, provider: 'openai' };
  return { configured: false, provider: null };
}
