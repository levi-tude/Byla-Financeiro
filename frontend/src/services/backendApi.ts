/**
 * Cliente para o backend Byla (Supabase + planilhas).
 * Usar nas telas que precisam de dados completos: alunos, modalidades, pendências.
 * Extrato/saldo/entradas continuam direto no Supabase.
 * @see docs/REGRAS_FONTES_SUPABASE_PLANILHAS.md
 */

import type { OrigemDados } from '../domain/OrigemDados';

const BASE_URL = (import.meta.env.VITE_BACKEND_URL ?? '').trim();

export interface DadosCompletosResponse {
  supabase: unknown[];
  planilha: Record<string, unknown>[];
  combinado: unknown[];
  regra_usada: string;
  origem: OrigemDados;
  sheet_error?: string;
}

/** Uma aba com linhas, colunas e agrupamento por modalidade */
export interface PorAbaItem {
  rows: Record<string, unknown>[];
  colunas: string[];
  por_modalidade: Record<string, Record<string, unknown>[]>;
}

export interface CombinadoResponse {
  combinado: unknown[];
  origem: OrigemDados;
  regra_usada: string;
  sheet_error?: string;
  abas_lidas?: string[];
  /** Agrupado por aba e por modalidade (para exibição organizada) */
  por_aba?: Record<string, PorAbaItem>;
}

/** Status das fontes (Supabase + planilha 1 FLUXO BYLA + planilha 2 CONTROLE DE CAIXA). */
export interface FontesStatusResponse {
  supabase: { configurado: boolean; ok: boolean; papel: string };
  planilha1: { id: string | null; nome: string; configurado: boolean; ok: boolean; erro?: string; papel: string };
  planilha2: { id: string | null; nome: string; configurado: boolean; ok: boolean; erro?: string; papel: string };
  harmonia: string;
}

async function request<T>(path: string): Promise<T> {
  if (!BASE_URL) {
    throw new Error('VITE_BACKEND_URL não configurado');
  }
  const res = await fetch(`${BASE_URL.replace(/\/$/, '')}${path}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Backend ${res.status}`);
  }
  return res.json();
}

export async function healthCheck(): Promise<{ status: string }> {
  return request<{ status: string }>('/health');
}

export async function getDadosCompletos(): Promise<DadosCompletosResponse> {
  return request<DadosCompletosResponse>('/api/dados-completos');
}

export async function getAlunosCompleto(): Promise<CombinadoResponse> {
  return request<CombinadoResponse>('/api/alunos-completo');
}

export async function getModalidadesCompleto(): Promise<CombinadoResponse> {
  return request<CombinadoResponse>('/api/modalidades-completo');
}

export async function getPendenciasCompleto(): Promise<CombinadoResponse> {
  return request<CombinadoResponse>('/api/pendencias-completo');
}

export interface FluxoCompletoResponse {
  combinado: {
    entradaTotal: number | null;
    saidaTotal: number | null;
    lucroTotal: number | null;
    linhas: { label: string; valor: string; valorNum?: number }[];
    /** Por par de colunas (0 = A-B, 1 = C-D…). Cada bloco = uma coluna da planilha. */
    porColuna?: { label: string; valor: string; valorNum?: number }[][];
    mes?: number | null;
    ano?: number | null;
    aba?: string | null;
  };
  origem: string;
  regra_usada: string;
  sheet_error?: string;
  fallback_message?: string;
}

export async function getFluxoCompleto(mes?: number, ano?: number): Promise<FluxoCompletoResponse> {
  const params = new URLSearchParams();
  if (mes != null && ano != null) {
    params.set('mes', String(mes));
    params.set('ano', String(ano));
  }
  const qs = params.toString();
  return request<FluxoCompletoResponse>(`/api/fluxo-completo${qs ? `?${qs}` : ''}`);
}

/** Verifica se Supabase e as duas planilhas estão configuradas e acessíveis. */
export async function getFontes(): Promise<FontesStatusResponse> {
  return request<FontesStatusResponse>('/api/fontes');
}

export interface TransacaoItem {
  id: string;
  data: string;
  pessoa: string;
  valor: number;
  descricao: string | null;
  tipo: string;
}

export interface TransacoesPorMesResponse {
  itens: TransacaoItem[];
  mes: number;
  ano: number;
  tipo: 'entrada' | 'saida';
}

export async function getTransacoesPorMes(mes: number, ano: number, tipo: 'entrada' | 'saida'): Promise<TransacoesPorMesResponse> {
  const params = new URLSearchParams({ mes: String(mes), ano: String(ano), tipo });
  return request<TransacoesPorMesResponse>(`/api/transacoes?${params.toString()}`);
}

export interface DespesaItem {
  id: string;
  data: string;
  valor: number;
  descricao: string;
  categoria: string;
  subcategoria: string | null;
  centro_custo: string | null;
  funcionario: string | null;
  origem: string;
}

export interface DespesasResponse {
  itens: DespesaItem[];
  resumo: {
    total_geral: number;
    por_funcionario: { funcionario: string; total: number; qtd: number }[];
    por_categoria: { categoria: string; total: number; qtd: number }[];
  };
  mes: number;
  ano: number;
}

export async function getDespesas(mes: number, ano: number): Promise<DespesasResponse> {
  const params = new URLSearchParams({ mes: String(mes), ano: String(ano) });
  return request<DespesasResponse>(`/api/despesas?${params.toString()}`);
}

// --- Relatórios (dados para IA) ---

export interface RelatorioDiarioPayload {
  tipo: 'diario';
  data: string;
  periodo_label: string;
  entradas: {
    total: number;
    quantidade: number;
    itens_resumo: { pessoa: string; valor: number; descricao: string }[];
    mais_itens?: number;
  };
  saidas: {
    total: number;
    quantidade: number;
    itens_resumo: { pessoa: string; valor: number; descricao: string }[];
    mais_itens?: number;
  };
  saldo_dia: number;
  fontes: { origem: string };
}

export interface RelatorioMensalPayload {
  tipo: 'mensal';
  mes: number;
  ano: number;
  periodo_label: string;
  entradas: {
    total_oficial: number;
    total_planilha: number | null;
    por_fonte_planilha?: { label: string; valor: number }[];
    comparacao_mes_anterior: { total_anterior: number; delta_absoluto: number; delta_percentual: number } | null;
  };
  saidas: {
    total_oficial: number;
    total_planilha: number | null;
    por_bloco_planilha?: { nome: string; total: number }[];
    comparacao_mes_anterior: { total_anterior: number; delta_absoluto: number; delta_percentual: number } | null;
  };
  lucro: {
    valor: number;
    valor_planilha: number | null;
    lucro_mes_anterior: number | null;
    delta_absoluto: number | null;
    delta_percentual: number | null;
  };
  destaques: { categorias_maior_despesa: { nome: string; total: number }[]; gastos_fixos_itens: { label: string; valor: number }[] };
  fontes: { resumo_oficial_origem: string; planilha_origem: string; aba_planilha: string | null };
}

export interface RelatorioTrimestralPayload {
  tipo: 'trimestral';
  trimestre: number;
  ano: number;
  periodo_label: string;
  meses: number[];
  entradas: {
    total_oficial: number;
    total_planilha: number | null;
    media_mensal_oficial: number;
    comparacao_trimestre_anterior: { total_anterior: number; delta_absoluto: number; delta_percentual: number };
  };
  saidas: {
    total_oficial: number;
    total_planilha: number | null;
    media_mensal_oficial: number;
    comparacao_trimestre_anterior: { total_anterior: number; delta_absoluto: number; delta_percentual: number };
  };
  lucro: {
    total_oficial: number;
    total_planilha: number | null;
    media_mensal: number;
    comparacao_trimestre_anterior: { total_anterior: number; delta_absoluto: number; delta_percentual: number };
  };
  por_mes: { mes: number; ano: number; total_entradas: number; total_saidas: number; saldo: number }[];
  fontes: { resumo_oficial_origem: string; planilha_origem: string };
}

export interface RelatorioAnualPayload {
  tipo: 'anual';
  ano: number;
  periodo_label: string;
  entradas: {
    total_oficial: number;
    total_planilha: number | null;
    media_mensal_oficial: number;
    comparacao_ano_anterior: { total_anterior: number; delta_absoluto: number; delta_percentual: number };
  };
  saidas: {
    total_oficial: number;
    total_planilha: number | null;
    media_mensal_oficial: number;
    comparacao_ano_anterior: { total_anterior: number; delta_absoluto: number; delta_percentual: number };
  };
  lucro: {
    total_oficial: number;
    total_planilha: number | null;
    media_mensal: number;
    comparacao_ano_anterior: { total_anterior: number; delta_absoluto: number; delta_percentual: number };
  };
  por_mes: { mes: number; ano: number; total_entradas: number; total_saidas: number; saldo: number }[];
  fontes: { resumo_oficial_origem: string; planilha_origem: string };
}

export type RelatorioPayload = RelatorioDiarioPayload | RelatorioMensalPayload | RelatorioTrimestralPayload | RelatorioAnualPayload;

export async function getRelatorioDiario(data: string): Promise<RelatorioDiarioPayload> {
  return request<RelatorioDiarioPayload>(`/api/relatorios/diario?data=${encodeURIComponent(data)}`);
}

export async function getRelatorioMensal(mes: number, ano: number): Promise<RelatorioMensalPayload> {
  const params = new URLSearchParams({ mes: String(mes), ano: String(ano) });
  return request<RelatorioMensalPayload>(`/api/relatorios/mensal?${params.toString()}`);
}

export async function getRelatorioTrimestral(trimestre: number, ano: number): Promise<RelatorioTrimestralPayload> {
  const params = new URLSearchParams({ trimestre: String(trimestre), ano: String(ano) });
  return request<RelatorioTrimestralPayload>(`/api/relatorios/trimestral?${params.toString()}`);
}

export async function getRelatorioAnual(ano: number): Promise<RelatorioAnualPayload> {
  return request<RelatorioAnualPayload>(`/api/relatorios/anual?ano=${ano}`);
}

/** Status da IA para relatórios (se chave está configurada no backend). */
export async function getRelatoriosIAStatus(): Promise<{ configured: boolean; provider: 'gemini' | 'openai' | null }> {
  if (!BASE_URL) return { configured: false, provider: null };
  const base = BASE_URL.replace(/\/$/, '');
  const res = await fetch(`${base}/api/relatorios/ia-status`);
  if (!res.ok) return { configured: false, provider: null };
  return res.json();
}

/** Gera texto do relatório com IA. Envia o payload do relatório e retorna o texto gerado. */
export async function gerarTextoRelatorioIA(payload: RelatorioPayload): Promise<{ texto: string }> {
  if (!BASE_URL) throw new Error('VITE_BACKEND_URL não configurado');
  const base = BASE_URL.replace(/\/$/, '');
  const res = await fetch(`${base}/api/relatorios/gerar-texto-ia`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload }),
  });
  const text = await res.text();
  let data: { error?: string; texto?: string };
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(res.ok ? 'Resposta inválida do backend.' : `Erro ${res.status}. ${text.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(data?.error ?? `Erro ${res.status}`);
  return { texto: data.texto ?? '' };
}
