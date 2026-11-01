import { log } from './logger.js';
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
import { formatarRespostaUsuario } from '../ai/respostaUsuario.js';
import { runConsultaAgent, type AgentDeps, type ChatHistoryItem } from '../ai/consultaGeminiAgent.js';
import { todayIsoLocal } from '../ai/consultaCatalog.js';
import { GEMINI_MODELS, resolveLlmProviders, type LlmProviderConfig } from '../ai/llmProviders.js';
import { rotearConsultaDeterministica, selecionarToolsRelevantes, type RotaDeterministica } from '../ai/consultaRouter.js';
import { carregarNomesConhecidos, type NomeConhecido } from '../ai/pseudonimizacao.js';
import type { CriacaoSpec } from '../ai/criacoesSpec.js';
import { dicaVisualParaIa, extrairVisualDaIa, specDaConsulta, specPropostoPelaIa, type VisualDeps } from '../ai/consultaVisual.js';
import { realDeps } from './criacoesDatasets.js';
import { loadSaidasMes } from './consultaBylaTools.js';

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
  /** Cartão visual (spec JSON das Criações da IA, já validado/hidratado). Ausente = só texto. */
  visual?: CriacaoSpec | null;
};

const realVisualDeps: VisualDeps = {
  ...realDeps,
  saidasMes: (mes, ano) => loadSaidasMes({ mes, ano }),
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
  /** Compat/teste: chave Gemini direta. */
  apiKey?: string;
  providers?: LlmProviderConfig[];
  nomesConhecidos?: NomeConhecido[];
  fetchImpl?: typeof fetch;
  executeTool?: AgentDeps['executeTool'];
  /** Pula a IA (ex.: limite de requisições do backend) e responde no modo simples. */
  forcarModoSimples?: boolean;
  /** Aviso prefixado quando cair no modo simples. */
  avisoInicial?: string;
  onTools?: AgentDeps['onTools'];
  /**
   * Cota de IA: chamado só quando a pergunta realmente vai para a IA (o roteador não gasta cota).
   * Retorna false → modo simples com aviso.
   */
  consumirCotaIa?: () => boolean;
  /** Fontes dos cartões visuais. Padrão: reais quando executeTool não é injetado; `null` desliga. */
  visualDeps?: VisualDeps | null;
};

export const AVISO_COTA_IA = 'Muitas perguntas seguidas; respondi no modo simples (menu).';

/** Executa a rota do roteador determinístico. `null` = a ferramenta pediu esclarecimento → segue para a IA. */
async function responderRota(
  rota: RotaDeterministica,
  executeTool: AgentDeps['executeTool'],
): Promise<ConsultaServiceOutput | null> {
  if (rota.kind === 'recusa') {
    return { message: rota.message, tool: null, confidence: 1, quickReplies: CONSULTA_MENU_LABELS.slice(0, 8), providerUsed: 'deterministic' };
  }
  try {
    const result = await executeTool(rota.tool, rota.params, rota.ctx);
    if (!result.ok && result.needsClarification) return null;
    return {
      message: result.ok ? result.factsText : result.error,
      tool: result.tool,
      confidence: 0.95,
      quickReplies: CONSULTA_MENU_LABELS.slice(0, 8),
      providerUsed: 'deterministic',
    };
  } catch {
    return null;
  }
}

const AVISO_FALLBACK: Record<'rate_limit' | 'error' | 'empty', string> = {
  rate_limit: 'O limite gratuito da IA foi atingido agora; respondi no modo simples (menu).',
  error: 'A IA não respondeu agora; respondi no modo simples (menu).',
  empty: 'A IA não respondeu agora; respondi no modo simples (menu).',
};

/**
 * Toda resposta ao usuário (roteador, IA, fallback, erro) passa pelo saneamento final:
 * sem instruções internas do LLM, sem CPF/CNPJ/telefone/e-mail e sem nome duplicado.
 */
export async function gerarConsultaReply(
  input: ConsultaServiceInput,
  deps: ConsultaReplyDeps = {},
): Promise<ConsultaServiceOutput> {
  const out = await gerarConsultaReplyBruto(input, deps);
  return { ...out, message: formatarRespostaUsuario(out.message), visual: out.visual ?? null };
}

async function gerarConsultaReplyBruto(
  input: ConsultaServiceInput,
  deps: ConsultaReplyDeps,
): Promise<ConsultaServiceOutput> {
  const providers =
    deps.providers ??
    (deps.apiKey !== undefined
      ? deps.apiKey
        ? [{ provider: 'gemini' as const, apiKey: deps.apiKey, models: GEMINI_MODELS }]
        : []
      : resolveLlmProviders());
  const executeToolBase = deps.executeTool ?? executeConsultaTool;
  const ctx = defaultMesAno(input.context?.monthYear);
  const visualDeps = deps.visualDeps !== undefined ? deps.visualDeps : deps.executeTool ? null : realVisualDeps;

  // Registra a última chamada bem-sucedida para montar o cartão visual (sem IA).
  let ultimoVisual: CriacaoSpec | null = null;
  let comDica = false;
  const executeTool: AgentDeps['executeTool'] = async (tool, params, c) => {
    const r = await executeToolBase(tool, params, c);
    if (r.ok && visualDeps) {
      const spec = await specDaConsulta(r.tool, params, c, r.factsText, visualDeps);
      if (spec) {
        ultimoVisual = spec;
        if (comDica) return { ...r, factsText: `${r.factsText}\n${dicaVisualParaIa(spec)}` };
      }
    }
    return r;
  };

  // 1) Roteador determinístico ANTES da IA: perguntas comuns com alta confiança não gastam LLM.
  let rota: RotaDeterministica | null = null;
  try {
    rota = rotearConsultaDeterministica(input.message, ctx);
  } catch {
    rota = null;
  }
  if (rota) {
    const det = await responderRota(rota, executeTool);
    if (det) return { ...det, visual: ultimoVisual };
  }

  let aviso = deps.avisoInicial ?? '';
  let modoSimples = !!deps.forcarModoSimples;
  if (providers.length && !modoSimples && deps.consumirCotaIa && !deps.consumirCotaIa()) {
    modoSimples = true;
    aviso = aviso || AVISO_COTA_IA;
  }
  if (providers.length && !modoSimples) {
    let nomesConhecidos = deps.nomesConhecidos;
    if (!nomesConhecidos) {
      try {
        nomesConhecidos = await carregarNomesConhecidos();
      } catch {
        nomesConhecidos = [];
      }
    }
    let r: Awaited<ReturnType<typeof runConsultaAgent>>;
    comDica = true;
    try {
      r = await runConsultaAgent(input.message, input.history ?? [], ctx, {
        providers,
        nomesConhecidos,
        fetchImpl: deps.fetchImpl,
        executeTool,
        today: todayIsoLocal(),
        toolIds: selecionarToolsRelevantes(
          input.message,
          (input.history ?? []).filter((h) => h.role === 'user').map((h) => h.content),
        ),
        onTools: deps.onTools,
      });
    } catch (e) {
      r = { ok: false, reason: 'error', detail: e instanceof Error ? e.message : String(e) };
    }
    comDica = false;
    if (r.ok) {
      const { texto, draft } = extrairVisualDaIa(r.text);
      const base = ultimoVisual as CriacaoSpec | null;
      const proposto = base ? specPropostoPelaIa(draft, base.datasets, r.provider === 'groq' ? 'groq' : 'gemini') : null;
      return {
        visual: proposto ?? base,
        message: sanitize(texto),
        tool: r.toolsUsed[0] ?? null,
        confidence: 1,
        quickReplies: CONSULTA_MENU_LABELS.slice(0, 8),
        providerUsed: r.provider,
      };
    }
    // Sem segredos: só provedor, modelo, status HTTP, retry-after e tipo de limite (TPM/RPM/TPD).
    log('warn', { msg: 'ai_consulta_llm_falha', reason: r.reason, falhas: r.falhas ?? [] });
    aviso = AVISO_FALLBACK[r.reason];
  }
  let det: ConsultaServiceOutput;
  try {
    det = await gerarConsultaDeterministica(input, executeTool);
  } catch (e) {
    log('warn', { msg: 'ai_consulta_deterministica_falha', detail: e instanceof Error ? e.message : String(e) });
    det = {
      message: mensagemRecusaForaDoCatalogo(),
      tool: null,
      confidence: 0,
      quickReplies: CONSULTA_MENU_LABELS,
      providerUsed: 'deterministic',
    };
  }
  det = { ...det, visual: ultimoVisual };
  if (aviso) return { ...det, message: `${aviso}\n\n${det.message}`, providerUsed: 'fallback' };
  return det;
}

async function gerarConsultaDeterministica(
  input: ConsultaServiceInput,
  executeTool: AgentDeps['executeTool'],
): Promise<ConsultaServiceOutput> {
  const quickReplies = CONSULTA_MENU_LABELS.slice(0, 8);
  const intent = resolveConsultaIntent(input.message);
  const ctx = defaultMesAno(input.context?.monthYear);

  if (!intent) {
    return {
      message: mensagemRecusaForaDoCatalogo(),
      tool: null,
      confidence: 0,
      quickReplies: CONSULTA_MENU_LABELS,
      providerUsed: 'deterministic',
    };
  }

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
  const p = resolveLlmProviders()[0];
  if (p) return { configured: true, provider: p.provider };
  return { configured: false, provider: null };
}
