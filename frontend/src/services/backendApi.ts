/**
 * Cliente para o backend Byla (Supabase + planilhas).
 * Usar nas telas que precisam de dados completos: alunos, modalidades, pendências.
 * Extrato/saldo/entradas continuam direto no Supabase.
 * @see docs/REGRAS_FONTES_SUPABASE_PLANILHAS.md
 */

import type { OrigemDados } from '../domain/OrigemDados';
import { supabase } from './supabase';

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

function requestIdFrom(res: Response): string | null {
  return res.headers.get('x-request-id');
}

/** Monta mensagem amigável: corpo JSON { error } se houver + id de rastreio. */
export async function parseBackendError(res: Response, bodyText: string): Promise<string> {
  const rid = requestIdFrom(res);
  const suffix = rid ? ` (ref: ${rid})` : '';
  let msg = `Erro ${res.status}${suffix}`;
  if (bodyText) {
    try {
      const j = JSON.parse(bodyText) as { error?: string };
      if (j?.error && typeof j.error === 'string') {
        msg = `${j.error}${suffix}`;
      } else {
        msg = `${bodyText.slice(0, 300)}${suffix}`;
      }
    } catch {
      msg = `${bodyText.slice(0, 300)}${suffix}`;
    }
  }
  return msg;
}

async function request<T>(path: string): Promise<T> {
  if (!BASE_URL) {
    throw new Error('VITE_BACKEND_URL não configurado');
  }
  const res = await apiFetch(path);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(await parseBackendError(res, text));
  }
  return res.json();
}

async function requestPost<T>(path: string, body: unknown): Promise<T> {
  if (!BASE_URL) {
    throw new Error('VITE_BACKEND_URL não configurado');
  }
  const res = await apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(await parseBackendError(res, text));
  }
  return res.json();
}

async function requestPut<T>(path: string, body: unknown): Promise<T> {
  if (!BASE_URL) {
    throw new Error('VITE_BACKEND_URL não configurado');
  }
  const res = await apiFetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(await parseBackendError(res, text));
  }
  return res.json();
}

async function requestPatch<T>(path: string, body: unknown): Promise<T> {
  if (!BASE_URL) {
    throw new Error('VITE_BACKEND_URL não configurado');
  }
  const res = await apiFetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(await parseBackendError(res, text));
  }
  return res.json();
}

async function requestDelete<T>(path: string): Promise<T> {
  if (!BASE_URL) {
    throw new Error('VITE_BACKEND_URL não configurado');
  }
  const res = await apiFetch(path, { method: 'DELETE' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(await parseBackendError(res, text));
  }
  return res.json();
}

async function getAuthHeaders(initialHeaders?: HeadersInit): Promise<Headers> {
  const headers = new Headers(initialHeaders ?? {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (!supabase) return headers;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return headers;
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const base = BASE_URL.replace(/\/$/, '');
  const headers = await getAuthHeaders(init.headers);
  return fetch(`${base}${path}`, { ...init, headers });
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

export interface SaidaBlocoPlanilhaResponse {
  titulo: string;
  linhas: { label: string; valor: string; valorNum?: number }[];
}

export interface FluxoCompletoResponse {
  combinado: {
    entradaTotal: number | null;
    saidaTotal: number | null;
    /** Soma só Parceiros + Fixas (detalhes). */
    saidaSomaSecoesPrincipais?: number | null;
    saidaParceirosTotal?: number | null;
    saidaFixasTotal?: number | null;
    lucroTotal: number | null;
    linhas: { label: string; valor: string; valorNum?: number }[];
    /** Por par de colunas (0 = A-B, 1 = C-D…). Cada bloco = uma coluna da planilha. */
    porColuna?: { label: string; valor: string; valorNum?: number }[][];
    /** Parceiros / Gastos fixos / Aluguel — extração por linha + colunas. */
    saidasBlocos?: SaidaBlocoPlanilhaResponse[];
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

export interface ControleCaixaLinha {
  id?: string;
  label: string;
  valor: number | null;
  valorTexto: string | null;
  ordem: number;
  templateKey?: string | null;
  isDefault?: boolean;
  isCustom?: boolean;
  lockedLevel?: 'none' | 'warn' | 'strong';
}

export interface ControleCaixaBloco {
  id?: string;
  tipo: 'entrada' | 'saida';
  titulo: string;
  ordem: number;
  templateKey?: string | null;
  isDefault?: boolean;
  isCustom?: boolean;
  lockedLevel?: 'none' | 'warn' | 'strong';
  linhas: ControleCaixaLinha[];
}

export interface ControleCaixaResponse {
  mes: number;
  ano: number;
  abaRef: string | null;
  origem: string;
  updatedAt?: string | null;
  totais: {
    entradaTotal: number | null;
    saidaTotal: number | null;
    lucroTotal: number | null;
    saidaParceirosTotal: number | null;
    saidaFixasTotal: number | null;
    saidaSomaSecoesPrincipais: number | null;
  };
  blocos: ControleCaixaBloco[];
}

export interface ControleCaixaSavePayload {
  abaRef: string | null;
  totais: ControleCaixaResponse['totais'];
  blocos: ControleCaixaBloco[];
}

export async function getControleCaixa(mes: number, ano: number): Promise<ControleCaixaResponse> {
  const params = new URLSearchParams({ mes: String(mes), ano: String(ano) });
  return request<ControleCaixaResponse>(`/api/controle-caixa?${params.toString()}`);
}

export async function putControleCaixa(
  mes: number,
  ano: number,
  payload: ControleCaixaSavePayload,
): Promise<ControleCaixaResponse> {
  const params = new URLSearchParams({ mes: String(mes), ano: String(ano) });
  return requestPut<ControleCaixaResponse>(`/api/controle-caixa?${params.toString()}`, payload);
}

/** Alinhado ao backend (`camposCadastroFaltantes` / pendências de cadastro). */
export const FLUXO_PENDENCIA_CAMPOS_IGNORAVEIS = [
  'wpp',
  'responsaveis',
  'venc',
  'valor_ref',
  'pagador_pix',
  'plano',
] as const;

export type FluxoPendenciaCampoIgnoravel = (typeof FLUXO_PENDENCIA_CAMPOS_IGNORAVEIS)[number];

export interface FluxoOperacionalAluno {
  id: string;
  aba: string;
  modalidade: string;
  linha_planilha: number;
  aluno_nome: string;
  wpp: string | null;
  responsaveis: string | null;
  plano: string | null;
  matricula: string | null;
  fim: string | null;
  venc: string | null;
  valor_referencia: number | null;
  pagador_pix: string | null;
  observacoes: string | null;
  ativo: boolean;
  /** Campos enriquecidos na listagem (GET /alunos) — não enviar de volta no PUT. */
  venc_exibicao?: string | null;
  responsaveis_exibicao?: string | null;
  pagador_pix_exibicao?: string | null;
  valor_mensal_exibicao?: number | null;
  valor_mensal_origem?: 'cadastro' | 'planilha_bruta' | 'ultimo_pagamento' | null;
  pendencia_campos_ignorados?: FluxoPendenciaCampoIgnoravel[];
  cobranca_tentativas?: { nota: string; registrado_em: string }[];
}

export interface FluxoOperacionalAlunosResponse {
  itens: FluxoOperacionalAluno[];
  filtros: {
    abas: string[];
    modalidades: string[];
  };
}

export interface FluxoOperacionalAlunoPayload {
  aba: string;
  modalidade: string;
  linhaPlanilha?: number;
  alunoNome: string;
  wpp?: string | null;
  responsaveis?: string | null;
  plano?: string | null;
  matricula?: string | null;
  fim?: string | null;
  venc?: string | null;
  valorReferencia?: number | null;
  pagadorPix?: string | null;
  observacoes?: string | null;
  ativo?: boolean;
}

export type FluxoDivergenciasResponse = {
  mes: number;
  ano: number;
  planilhaHabilitada: boolean;
  alunos: {
    totalBanco: number;
    totalPlanilha: number;
    soNoBanco: Array<{ aba: string; modalidade: string; linha: number; aluno: string; origem: string }>;
    soNaPlanilha: Array<{ aba: string; modalidade: string; linha: number; aluno: string; origem: string }>;
  };
  pagamentos: { mes: number; ano: number; totalBanco: number; totalPlanilha: number; delta: number };
  errosPlanilha: string[];
};

export async function getFluxoOperacionalDivergencias(mes: number, ano: number): Promise<FluxoDivergenciasResponse> {
  const params = new URLSearchParams({ mes: String(mes), ano: String(ano) });
  return request<FluxoDivergenciasResponse>(`/api/fluxo-operacional/divergencias?${params.toString()}`);
}

export async function getFluxoOperacionalAlunos(params?: {
  aba?: string;
  modalidade?: string;
  ativo?: boolean;
  q?: string;
  limit?: number;
}): Promise<FluxoOperacionalAlunosResponse> {
  const qs = new URLSearchParams();
  if (params?.aba) qs.set('aba', params.aba);
  if (params?.modalidade) qs.set('modalidade', params.modalidade);
  if (params?.ativo != null) qs.set('ativo', String(params.ativo));
  if (params?.q) qs.set('q', params.q);
  if (params?.limit != null) qs.set('limit', String(params.limit));
  const s = qs.toString();
  return request<FluxoOperacionalAlunosResponse>(`/api/fluxo-operacional/alunos${s ? `?${s}` : ''}`);
}

export async function createFluxoOperacionalAluno(payload: FluxoOperacionalAlunoPayload): Promise<{ item: FluxoOperacionalAluno }> {
  return requestPost<{ item: FluxoOperacionalAluno }>('/api/fluxo-operacional/alunos', payload);
}

export async function updateFluxoOperacionalAluno(
  id: string,
  payload: FluxoOperacionalAlunoPayload,
): Promise<{ item: FluxoOperacionalAluno }> {
  return requestPut<{ item: FluxoOperacionalAluno }>(`/api/fluxo-operacional/alunos/${encodeURIComponent(id)}`, payload);
}

export async function deleteFluxoOperacionalAluno(id: string, force = false): Promise<{ ok: boolean }> {
  if (!BASE_URL) throw new Error('VITE_BACKEND_URL não configurado');
  const res = await apiFetch('/api/fluxo-operacional/alunos', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, force }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(await parseBackendError(res, text));
  }
  return res.json();
}

export async function patchFluxoOperacionalAlunoPendenciasIgnoradas(
  id: string,
  pendenciaCamposIgnorados: FluxoPendenciaCampoIgnoravel[],
): Promise<{ pendenciaCamposIgnorados: FluxoPendenciaCampoIgnoravel[] }> {
  return requestPatch(`/api/fluxo-operacional/alunos/${encodeURIComponent(id)}/pendencias-ignoradas`, {
    pendenciaCamposIgnorados,
  });
}

export async function patchFluxoOperacionalAlunoAtivo(
  id: string,
  ativo: boolean,
): Promise<{ item: FluxoOperacionalAluno }> {
  return requestPatch<{ item: FluxoOperacionalAluno }>(
    `/api/fluxo-operacional/alunos/${encodeURIComponent(id)}/ativo`,
    { ativo },
  );
}

export async function postFluxoOperacionalAlunoCobrancaTentativa(
  id: string,
  nota: string,
): Promise<{ cobrancaTentativas: { nota: string; registrado_em: string }[] }> {
  return requestPost(`/api/fluxo-operacional/alunos/${encodeURIComponent(id)}/cobranca-tentativa`, { nota });
}

export interface FluxoOperacionalPagamento {
  id: string;
  aba: string;
  modalidade: string;
  linha_planilha: number;
  ordem_lancamento: number;
  aluno_nome: string;
  data_pagamento: string;
  forma: string | null;
  valor: number;
  mes_competencia: number;
  ano_competencia: number;
  responsaveis: string | null;
  pagador_pix: string | null;
  /** Preenchido pelo backend a partir do cadastro do aluno (aba + linha + nome). */
  aluno_venc?: string | null;
  aluno_valor_referencia?: number | null;
  aluno_responsaveis?: string | null;
  aluno_pagador_pix?: string | null;
  status_extrato?: 'validado' | 'pendente' | 'divergente' | 'sem_lancamento';
  planilha_id?: string;
  banco_id?: string | null;
  vinculo_id?: string | null;
}

export type FluxoTotaisCompetenciaLinha = {
  aba: string;
  modalidade: string;
  mes_competencia: number;
  ano_competencia: number;
  total: number;
  qtd: number;
  total_validado: number;
  qtd_validado: number;
};

export async function getFluxoOperacionalTotaisCompetencia(
  mes: number,
  ano: number,
  aba?: string,
  modalidade?: string,
): Promise<{
  mes: number;
  ano: number;
  totais: FluxoTotaisCompetenciaLinha[];
  comparativo: { total_fluxo: number; total_validado_extrato: number; delta: number };
}> {
  const qs = new URLSearchParams({ mes: String(mes), ano: String(ano) });
  if (aba) qs.set('aba', aba);
  if (modalidade) qs.set('modalidade', modalidade);
  return request(`/api/fluxo-operacional/totais-competencia?${qs.toString()}`);
}

export interface FluxoOperacionalPagamentosResponse {
  itens: FluxoOperacionalPagamento[];
  filtros: {
    abas: string[];
    modalidades: string[];
  };
}

export interface FluxoOperacionalPagamentoPayload {
  aba: string;
  modalidade: string;
  linhaPlanilha?: number;
  ordemLancamento?: number;
  alunoNome: string;
  dataPagamento: string;
  forma?: string | null;
  valor: number;
  mesCompetencia: number;
  anoCompetencia: number;
  responsaveis?: string | null;
  pagadorPix?: string | null;
}

export async function getFluxoOperacionalPagamentos(params?: {
  ano?: number;
  mes?: number;
  aba?: string;
  modalidade?: string;
  aluno?: string;
  q?: string;
  limit?: number;
}): Promise<FluxoOperacionalPagamentosResponse> {
  const qs = new URLSearchParams();
  if (params?.ano != null) qs.set('ano', String(params.ano));
  if (params?.mes != null) qs.set('mes', String(params.mes));
  if (params?.aba) qs.set('aba', params.aba);
  if (params?.modalidade) qs.set('modalidade', params.modalidade);
  if (params?.aluno) qs.set('aluno', params.aluno);
  if (params?.q) qs.set('q', params.q);
  if (params?.limit != null) qs.set('limit', String(params.limit));
  const s = qs.toString();
  return request<FluxoOperacionalPagamentosResponse>(`/api/fluxo-operacional/pagamentos${s ? `?${s}` : ''}`);
}

export async function createFluxoOperacionalPagamento(
  payload: FluxoOperacionalPagamentoPayload,
): Promise<{ item: FluxoOperacionalPagamento }> {
  return requestPost<{ item: FluxoOperacionalPagamento }>('/api/fluxo-operacional/pagamentos', payload);
}

export async function updateFluxoOperacionalPagamento(
  id: string,
  payload: FluxoOperacionalPagamentoPayload,
): Promise<{ item: FluxoOperacionalPagamento }> {
  return requestPut<{ item: FluxoOperacionalPagamento }>(`/api/fluxo-operacional/pagamentos/${encodeURIComponent(id)}`, payload);
}

export async function deleteFluxoOperacionalPagamento(id: string): Promise<{ ok: boolean }> {
  if (!BASE_URL) throw new Error('VITE_BACKEND_URL não configurado');
  const res = await apiFetch('/api/fluxo-operacional/pagamentos', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(await parseBackendError(res, text));
  }
  return res.json();
}

export interface FluxoOperacionalAuditoriaItem {
  id: string;
  entidade: 'aluno' | 'pagamento';
  acao: 'create' | 'update' | 'delete';
  registro_id: string | null;
  aba: string | null;
  modalidade: string | null;
  aluno_nome: string | null;
  user_email: string | null;
  user_role: string | null;
  created_at: string;
}

export interface FluxoOperacionalResumoMesItem {
  ano: number;
  mes: number;
  key: string;
  valorEsperado: number | null;
  valorPago: number;
  dataPagamento: string | null;
  formaPagamento: string | null;
  status: 'pago' | 'parcial' | 'pendente' | 'sem_dado' | 'futuro';
  status_extrato?: 'validado' | 'pendente' | 'sem_lancamento';
}

export interface FluxoOperacionalResumoAlunoItem {
  id: string;
  aba: string;
  modalidade: string;
  linhaPlanilha: number;
  alunoNome: string;
  whatsapp: string | null;
  responsaveis: string | null;
  plano: string | null;
  vencimento: string | null;
  pagadorPix: string | null;
  valorReferencia: number | null;
  historico: FluxoOperacionalResumoMesItem[];
  mesesEmAberto: number;
  voltouAPagar: boolean;
}

export interface FluxoOperacionalResumoMultiMesResponse {
  referencia: { ano: number; mes: number; janela: number };
  kpis: { pendentesMesAtual: number; atrasados2Mais: number; voltaramAPagar: number };
  meses: { ano: number; mes: number }[];
  itens: FluxoOperacionalResumoAlunoItem[];
  prioridade: { id: string; alunoNome: string; aba: string; modalidade: string; mesesEmAberto: number }[];
}

export async function getFluxoOperacionalResumoMultiMes(params: {
  ano: number;
  mes: number;
  janela?: number;
  aba?: string;
  modalidade?: string;
  q?: string;
  limit?: number;
}): Promise<FluxoOperacionalResumoMultiMesResponse> {
  const qs = new URLSearchParams({
    ano: String(params.ano),
    mes: String(params.mes),
    janela: String(params.janela ?? 3),
  });
  if (params.aba) qs.set('aba', params.aba);
  if (params.modalidade) qs.set('modalidade', params.modalidade);
  if (params.q) qs.set('q', params.q);
  if (params.limit != null) qs.set('limit', String(params.limit));
  return request<FluxoOperacionalResumoMultiMesResponse>(`/api/fluxo-operacional/resumo-multi-mes?${qs.toString()}`);
}

export async function getFluxoOperacionalAuditoria(params?: {
  entidade?: 'aluno' | 'pagamento';
  limit?: number;
}): Promise<{ itens: FluxoOperacionalAuditoriaItem[] }> {
  const qs = new URLSearchParams();
  if (params?.entidade) qs.set('entidade', params.entidade);
  if (params?.limit != null) qs.set('limit', String(params.limit));
  const s = qs.toString();
  return request<{ itens: FluxoOperacionalAuditoriaItem[] }>(
    `/api/fluxo-operacional/auditoria${s ? `?${s}` : ''}`
  );
}

export interface SaidaPainelItem {
  id: string;
  data: string;
  pessoa: string;
  valor: number;
  descricao: string | null;
  tipo: string;
  categoria_sugerida_banco: string | null;
  subcategoria_sugerida_banco: string | null;
  modalidade_banco: string | null;
  origem_categoria_banco: string | null;
  grupo_planilha: string | null;
  linha_planilha_ref: string | null;
  match_confianca: 'alta' | 'media' | 'baixa';
  secao_planilha?: string | null;
  detalhe?: string | null;
  classificacao_regra?:
    | 'nome_na_planilha'
    | 'funcionario'
    | 'pagador_planilha_controle'
    | 'match_controle'
    | 'texto_planilha'
    | 'valor'
    | 'nenhuma'
    | 'manual';
}

export interface SaidasPainelResponse {
  mes: number;
  ano: number;
  itens: SaidaPainelItem[];
  /** Total do extrato após regras globais (EA/Blead, Samuel pareado, faixa ~5k). */
  totais_extrato_filtrado?: { total_saidas: number; qtd: number };
  resumo_por_categoria_banco: { nome: string; total: number; qtd: number }[];
  resumo_por_grupo_planilha: { nome: string; total: number; qtd: number }[];
  resumo_por_linha_planilha: { nome: string; total: number; qtd: number }[];
  planilha_blocos: SaidaBlocoPlanilhaResponse[];
  totais_planilha_por_bloco: { titulo: string; total: number; qtd: number }[];
  fluxo_sheet_error: string | null;
  fluxo_fallback_message: string | null;
  /** Avisos ao ler abas da planilha de pagamentos para match pagador × CONTROLE (opcional). */
  pagador_planilha_errors?: string[] | null;
}

export async function getSaidasPainel(mes: number, ano: number): Promise<SaidasPainelResponse> {
  const params = new URLSearchParams({ mes: String(mes), ano: String(ano) });
  return request<SaidasPainelResponse>(`/api/saidas/painel?${params.toString()}`);
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
  tipo: 'entrada' | 'saida';
  metodo: 'PIX' | 'Crédito' | 'Débito' | 'Transferência' | 'Boleto' | 'Dinheiro' | 'Outros';
  metodoRaw: string | null;
}

export interface TransacoesPorMesResponse {
  itens: TransacaoItem[];
  mes: number;
  ano: number;
  tipo: 'entrada' | 'saida' | 'todos';
  resumo_geral?: {
    total_entradas: number;
    total_saidas: number;
    saldo_liquido: number;
    quantidade_total: number;
  };
  resumo_por_dia?: {
    data: string;
    entradas: number;
    saidas: number;
    saldo: number;
    qtd: number;
    linhas?: {
      pessoa: string;
      valor: number;
      tipo: 'entrada' | 'saida';
      descricao: string | null;
      metodo: TransacaoItem['metodo'];
    }[];
  }[];
  resumo_por_metodo?: {
    metodo: TransacaoItem['metodo'];
    entradas_valor: number;
    entradas_qtd: number;
    saidas_valor: number;
    saidas_qtd: number;
    total_valor: number;
    total_qtd: number;
  }[];
  total_filtrado?: number;
}

export async function getTransacoesPorMes(
  mes: number,
  ano: number,
  tipo: 'entrada' | 'saida' | 'todos',
  extra?: { metodo?: string; q?: string; dia?: string; dia_fim?: string; limit?: number; offset?: number }
): Promise<TransacoesPorMesResponse> {
  const params = new URLSearchParams({ mes: String(mes), ano: String(ano), tipo });
  if (extra?.metodo) params.set('metodo', extra.metodo);
  if (extra?.q) params.set('q', extra.q);
  if (extra?.dia) params.set('dia', extra.dia);
  if (extra?.dia_fim) params.set('dia_fim', extra.dia_fim);
  if (extra?.limit != null) params.set('limit', String(extra.limit));
  if (extra?.offset != null) params.set('offset', String(extra.offset));
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

/** @deprecated Legado (tabela despesas). Use getDespesasResumo. */
export async function getDespesas(mes: number, ano: number): Promise<DespesasResponse> {
  const params = new URLSearchParams({ mes: String(mes), ano: String(ano) });
  return request<DespesasResponse>(`/api/saidas?${params.toString()}`);
}

export type VisaoControle = 'caixa' | 'competencia';

export type TransacaoCompetenciaApi = {
  mes_competencia?: number;
  ano_competencia?: number;
  competencia_confirmada?: boolean;
  competencia_origem?: string;
  competencia_sugerida_mes?: number;
  competencia_sugerida_ano?: number;
  competencia_alinha_data?: boolean;
  alerta_duplicata_competencia?: boolean;
};

export type DespesaCategoriaLinha = {
  templateKey: string;
  label: string;
  blocoTemplateKey: string;
  blocoTitulo: string;
  ordem: number;
  blocoOrdem: number;
  linhaId?: string;
  blocoId?: string;
  isCustom?: boolean;
};

export type DespesasResumoResponse = {
  mes: number;
  ano: number;
  visao?: VisaoControle;
  kpis: {
    total_saidas: number;
    total_classificado: number;
    pct_classificado: number;
    valor_pendente: number;
    qtd_destinatarios_pendentes: number;
    qtd_transacoes: number;
  };
  por_categoria: {
    template_key: string;
    label: string;
    bloco_template_key: string;
    bloco_titulo: string;
    total: number;
    qtd_transacoes: number;
    qtd_destinatarios: number;
  }[];
  pendente: { total: number; qtd_transacoes: number };
  por_bloco?: {
    bloco_titulo: string;
    bloco_ordem: number;
    linhas: DespesasResumoResponse['por_categoria'];
  }[];
};

export type DespesaGrupo = {
  pessoa_normalizada: string;
  pessoa_exibida: string;
  qtd_mes: number;
  total_mes: number;
  datas: string[];
  score_repeticao: number;
  estado: 'pendente' | 'classificado';
  categoria_label: string | null;
  template_key: string | null;
  bloco_template_key: string | null;
  bloco_titulo: string | null;
  origem_categoria: string;
  mapeamento_id: string | null;
  regra_desativada: boolean;
  sugestao_heuristica?: { label: string; confianca: string; regra: string } | null;
};

export type DespesasGruposResponse = {
  mes: number;
  ano: number;
  filtro: 'pendente' | 'classificado';
  total: number;
  offset: number;
  limit: number;
  grupos: DespesaGrupo[];
};

export type DespesaTransacaoClassificada = {
  id: string;
  data: string;
  pessoa: string;
  valor: number;
  descricao: string | null;
  categoria_sugerida: string | null;
  origem_categoria: string | null;
  pessoa_normalizada: string;
  categoria_efetiva: string | null;
  template_key_efetivo: string | null;
  origem_efetiva: string;
} & TransacaoCompetenciaApi;

export async function getDespesasCategorias(
  mes: number,
  ano: number,
): Promise<{ mes: number; ano: number; categorias: DespesaCategoriaLinha[] }> {
  const params = new URLSearchParams({ mes: String(mes), ano: String(ano) });
  return request(`/api/despesas/categorias?${params.toString()}`);
}

export async function getDespesasResumo(
  mes: number,
  ano: number,
  visao: VisaoControle = 'caixa',
): Promise<DespesasResumoResponse> {
  const params = new URLSearchParams({ mes: String(mes), ano: String(ano), visao });
  return request<DespesasResumoResponse>(`/api/despesas/resumo?${params.toString()}`);
}

export async function patchDespesasTransacaoCompetencia(
  mes: number,
  ano: number,
  transacaoId: string,
  body: { mes_competencia: number; ano_competencia: number; confirmada: boolean },
): Promise<{ ok: boolean; transacao_id: string; competencia_confirmada: boolean }> {
  const params = new URLSearchParams({ mes: String(mes), ano: String(ano) });
  return requestPatch(
    `/api/despesas/transacoes/${encodeURIComponent(transacaoId)}/competencia?${params.toString()}`,
    body,
  );
}

export async function getDespesasGrupos(
  mes: number,
  ano: number,
  filtro: 'pendente' | 'classificado',
  offset = 0,
  limit = 50,
): Promise<DespesasGruposResponse> {
  const params = new URLSearchParams({
    mes: String(mes),
    ano: String(ano),
    filtro,
    offset: String(offset),
    limit: String(limit),
  });
  return request<DespesasGruposResponse>(`/api/despesas/grupos?${params.toString()}`);
}

export async function getDespesasGrupoTransacoes(
  pessoaNorm: string,
  mes: number,
  ano: number,
): Promise<{
  mes: number;
  ano: number;
  pessoa_normalizada: string;
  grupo: DespesaGrupo | null;
  transacoes: DespesaTransacaoClassificada[];
}> {
  const params = new URLSearchParams({ mes: String(mes), ano: String(ano) });
  const enc = encodeURIComponent(pessoaNorm);
  return request(`/api/despesas/grupos/${enc}/transacoes?${params.toString()}`);
}

export async function getDespesasCategoriaTransacoes(
  templateKey: string,
  mes: number,
  ano: number,
): Promise<{
  mes: number;
  ano: number;
  template_key: string;
  label: string;
  transacoes: DespesaTransacaoClassificada[];
}> {
  const params = new URLSearchParams({ mes: String(mes), ano: String(ano) });
  const enc = encodeURIComponent(templateKey);
  return request(`/api/despesas/categorias/${enc}/transacoes?${params.toString()}`);
}

export async function putDespesasMapeamento(
  mes: number,
  ano: number,
  body: {
    pessoa_normalizada: string;
    template_key: string;
  },
): Promise<{
  id: string;
  pessoa_normalizada: string;
  categoria: string;
  template_key: string | null;
  ativo: boolean;
}> {
  const params = new URLSearchParams({ mes: String(mes), ano: String(ano) });
  return requestPut(`/api/despesas/mapeamento?${params.toString()}`, { ...body, aplica_tipo: 'saida' });
}

export async function patchDespesasMapeamento(
  mes: number,
  ano: number,
  id: string,
  body: { ativo?: boolean; template_key?: string },
): Promise<{ id: string; ativo: boolean }> {
  const params = new URLSearchParams({ mes: String(mes), ano: String(ano) });
  return requestPatch(`/api/despesas/mapeamento/${encodeURIComponent(id)}?${params.toString()}`, body);
}

export async function deleteDespesasMapeamento(
  mes: number,
  ano: number,
  id: string,
): Promise<{ ok: boolean; id: string; pessoa_normalizada: string }> {
  const params = new URLSearchParams({ mes: String(mes), ano: String(ano) });
  return requestDelete(`/api/despesas/mapeamento/${encodeURIComponent(id)}?${params.toString()}`);
}

export type EntradaCategoriaLinha = {
  templateKey: string;
  label: string;
  blocoTemplateKey: string;
  blocoTitulo: string;
  ordem: number;
  blocoOrdem: number;
  linhaId: string;
  blocoId: string;
  isCustom: boolean;
};

export type EntradasResumoResponse = {
  mes: number;
  ano: number;
  visao?: VisaoControle;
  kpis: {
    total_entradas: number;
    total_classificado: number;
    pct_classificado: number;
    valor_pendente: number;
    qtd_grupos_pendentes: number;
    qtd_transacoes: number;
  };
  por_categoria: Array<{
    template_key: string;
    label: string;
    bloco_template_key: string;
    bloco_titulo: string;
    total: number;
    qtd_transacoes: number;
    qtd_pagadores: number;
    bloco_ordem: number;
    ordem: number;
  }>;
  pendente: { total: number; qtd_transacoes: number };
  por_bloco?: {
    bloco_titulo: string;
    bloco_ordem: number;
    linhas: EntradasResumoResponse['por_categoria'];
  }[];
};

export type EntradaGrupo = {
  grupo_key: string;
  pessoa_normalizada: string;
  pessoa_exibida: string;
  titulo_card: string;
  aluno_nome: string | null;
  modalidade: string | null;
  aba_fluxo: string | null;
  qtd_mes: number;
  total_mes: number;
  datas: string[];
  score_repeticao: number;
  estado: 'pendente' | 'classificado';
  categoria_label: string | null;
  template_key: string | null;
  bloco_template_key: string | null;
  bloco_titulo: string | null;
  origem_categoria: string;
  mapeamento_id: string | null;
  regra_desativada: boolean;
  sugestao_fluxo?: {
    mapeamento_id: string;
    template_key: string;
    label: string;
    detalhe: string | null;
  } | null;
  regra_pendente_confirmacao?: boolean;
  segmento?: 'mensalidades' | 'aluguel_coworking';
  match_aluguel?: {
    template_key: string;
    label: string;
    confianca: 'alta' | 'media' | 'baixa';
    motivo: string;
  } | null;
  origem_grupo?: 'pix' | 'pix_vinculo' | 'cartao_vinculo' | 'cartao_match' | 'cartao_avulso';
  banco_transacao_id?: string | null;
  metodo_pagamento?: string | null;
  fluxo_planilha_id?: string | null;
  cartao_detalhe?: string | null;
  sugestao?: {
    aba: string | null;
    modalidade: string | null;
    aluno_nome: string | null;
    template_key: string | null;
    label: string | null;
    origem: string;
    confianca: string;
  } | null;
};

export type EntradasGruposResponse = {
  mes: number;
  ano: number;
  filtro: 'pendente' | 'classificado';
  total: number;
  offset: number;
  limit: number;
  grupos: EntradaGrupo[];
};

export type EntradaTransacaoClassificada = {
  id: string;
  data: string;
  pessoa: string;
  valor: number;
  descricao: string | null;
  categoria_sugerida: string | null;
  origem_categoria: string | null;
  modalidade: string | null;
  nome_aluno: string | null;
  pessoa_normalizada: string;
  categoria_efetiva: string | null;
  template_key_efetivo: string | null;
  origem_efetiva: string;
} & TransacaoCompetenciaApi;

export async function getEntradasCategorias(
  mes: number,
  ano: number,
): Promise<{ mes: number; ano: number; categorias: EntradaCategoriaLinha[] }> {
  const params = new URLSearchParams({ mes: String(mes), ano: String(ano) });
  return request(`/api/entradas/categorias?${params.toString()}`);
}

export async function getEntradasResumo(
  mes: number,
  ano: number,
  visao: VisaoControle = 'caixa',
): Promise<EntradasResumoResponse> {
  const params = new URLSearchParams({ mes: String(mes), ano: String(ano), visao });
  return request<EntradasResumoResponse>(`/api/entradas/resumo?${params.toString()}`);
}

export async function patchEntradasTransacaoCompetencia(
  mes: number,
  ano: number,
  transacaoId: string,
  body: { mes_competencia: number; ano_competencia: number; confirmada: boolean },
): Promise<{ ok: boolean; transacao_id: string; competencia_confirmada: boolean }> {
  const params = new URLSearchParams({ mes: String(mes), ano: String(ano) });
  return requestPatch(
    `/api/entradas/transacoes/${encodeURIComponent(transacaoId)}/competencia?${params.toString()}`,
    body,
  );
}

export async function getEntradasGrupos(
  mes: number,
  ano: number,
  filtro: 'pendente' | 'classificado',
  offset = 0,
  limit = 50,
): Promise<EntradasGruposResponse> {
  const params = new URLSearchParams({
    mes: String(mes),
    ano: String(ano),
    filtro,
    offset: String(offset),
    limit: String(limit),
  });
  return request<EntradasGruposResponse>(`/api/entradas/grupos?${params.toString()}`);
}

export async function getEntradasGrupoTransacoes(
  grupoKey: string,
  mes: number,
  ano: number,
): Promise<{
  mes: number;
  ano: number;
  grupo_key: string;
  grupo: EntradaGrupo | null;
  transacoes: EntradaTransacaoClassificada[];
}> {
  const params = new URLSearchParams({ mes: String(mes), ano: String(ano) });
  const enc = encodeURIComponent(grupoKey);
  return request(`/api/entradas/grupos/${enc}/transacoes?${params.toString()}`);
}

export async function getEntradasCategoriaTransacoes(
  templateKey: string,
  mes: number,
  ano: number,
): Promise<{
  mes: number;
  ano: number;
  template_key: string;
  label: string;
  transacoes: EntradaTransacaoClassificada[];
}> {
  const params = new URLSearchParams({ mes: String(mes), ano: String(ano) });
  const enc = encodeURIComponent(templateKey);
  return request(`/api/entradas/categorias/${enc}/transacoes?${params.toString()}`);
}

export async function putEntradasMapeamento(
  mes: number,
  ano: number,
  body: { pessoa_normalizada: string; template_key: string; subcategoria?: string },
): Promise<{ id: string; pessoa_normalizada: string; categoria: string; template_key: string | null; ativo: boolean }> {
  const params = new URLSearchParams({ mes: String(mes), ano: String(ano) });
  return requestPut(`/api/entradas/mapeamento?${params.toString()}`, { ...body, aplica_tipo: 'entrada' });
}

export async function patchEntradasMapeamento(
  mes: number,
  ano: number,
  id: string,
  body: { ativo?: boolean; confirmado?: boolean; template_key?: string },
): Promise<{ id: string; ativo: boolean; confirmado?: boolean }> {
  const params = new URLSearchParams({ mes: String(mes), ano: String(ano) });
  return requestPatch(`/api/entradas/mapeamento/${encodeURIComponent(id)}?${params.toString()}`, body);
}

export async function deleteEntradasMapeamento(
  mes: number,
  ano: number,
  id: string,
): Promise<{ ok: boolean; id: string; pessoa_normalizada: string }> {
  const params = new URLSearchParams({ mes: String(mes), ano: String(ano) });
  return requestDelete(`/api/entradas/mapeamento/${encodeURIComponent(id)}?${params.toString()}`);
}

export async function postControleCaixaSincronizarEntradas(
  mes: number,
  ano: number,
  visao: VisaoControle = 'competencia',
): Promise<{ ok: boolean; mes: number; ano: number; visao: VisaoControle; controle: ControleCaixaResponse }> {
  const params = new URLSearchParams({ mes: String(mes), ano: String(ano), visao });
  return requestPost(`/api/controle-caixa/sincronizar-entradas?${params.toString()}`, {});
}

/** Resumo por modalidade/categoria (extrato oficial) e, para saídas, por funcionário (tabela despesas). */
export interface CategoriasBancoBucket {
  nome: string;
  total: number;
  qtd: number;
}

export interface CategoriasBancoResumoResponse {
  mes: number;
  ano: number;
  tipo: 'entrada' | 'saida';
  totais: { total: number; qtd: number };
  por_modalidade: CategoriasBancoBucket[];
  por_categoria: CategoriasBancoBucket[];
  por_funcionario: CategoriasBancoBucket[];
  fonte: string;
}

export async function getCategoriasBancoResumo(
  mes: number,
  ano: number,
  tipo: 'entrada' | 'saida',
): Promise<CategoriasBancoResumoResponse> {
  const params = new URLSearchParams({ mes: String(mes), ano: String(ano), tipo });
  return request<CategoriasBancoResumoResponse>(`/api/categorias-banco/resumo?${params.toString()}`);
}

export interface CategoriaBancoDetalheItem {
  id: string;
  data: string;
  valor: number;
  descricao?: string | null;
  pessoa?: string | null;
  tipo?: string;
  categoria_sugerida?: string | null;
  subcategoria_sugerida?: string | null;
  modalidade?: string | null;
  nome_aluno?: string | null;
  categoria?: string;
  funcionario?: string | null;
  origem: string;
}

export interface CategoriasBancoDetalheResponse {
  mes: number;
  ano: number;
  tipo: 'entrada' | 'saida';
  grupo: 'modalidade' | 'categoria' | 'funcionario';
  chave: string;
  total: number;
  page: number;
  pageSize: number;
  itens: CategoriaBancoDetalheItem[];
}

export async function getCategoriasBancoDetalhe(
  mes: number,
  ano: number,
  tipo: 'entrada' | 'saida',
  grupo: 'modalidade' | 'categoria' | 'funcionario',
  chave: string,
  page = 1,
  pageSize = 50,
): Promise<CategoriasBancoDetalheResponse> {
  const params = new URLSearchParams({
    mes: String(mes),
    ano: String(ano),
    tipo,
    grupo,
    chave,
    page: String(page),
    pageSize: String(pageSize),
  });
  return request<CategoriasBancoDetalheResponse>(`/api/categorias-banco/detalhe?${params.toString()}`);
}

/** Pessoas + subempresa Byla Dança (cadastro do backend). */
export interface EntidadeBylaApi {
  nome: string;
  funcao: string;
  aliases: string[];
  subempresa?: boolean;
  categoriasSugeridas?: string[];
}

export async function getEntidadesByla(): Promise<{ entidades: EntidadeBylaApi[] }> {
  return request<{ entidades: EntidadeBylaApi[] }>('/api/entidades-byla');
}

export interface EntidadeMatchInfo {
  nome: string;
  funcao: string;
  subempresa: boolean;
  via: string;
  categoriasSugeridas: string[] | null;
}

export async function postMatchEntidadesLinhas(linhas: string[]): Promise<{
  resultados: { texto: string; match: EntidadeMatchInfo | null }[];
}> {
  return requestPost<{ resultados: { texto: string; match: EntidadeMatchInfo | null }[] }>(
    '/api/entidades-byla/match-linhas',
    { linhas },
  );
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
    itens_destaque?: { pessoa: string; valor: number; descricao: string }[];
    mais_itens?: number;
    limite_itens?: number;
    truncado?: boolean;
  };
  saidas: {
    total: number;
    quantidade: number;
    itens_resumo: { pessoa: string; valor: number; descricao: string }[];
    itens_destaque?: { pessoa: string; valor: number; descricao: string }[];
    mais_itens?: number;
    limite_itens?: number;
    truncado?: boolean;
  };
  saldo_dia: number;
  origem_dados?: { entradas: string; saidas: string };
  fontes: { origem: string; legenda?: string };
}

/** Linhas da planilha CONTROLE DE CAIXA em formato legível para gestão e para a IA. */
export interface ControleCaixaLeituraGestao {
  titulo: string;
  publico_alvo: string;
  aba_planilha: string | null;
  /** Origem das listas — só planilha CONTROLE; não cadastro de equipe nem extrato. */
  origem_detalhe_listas?: { entradas_e_saidas: string };
  /** Soma entrada/saída/lucro lidos do CONTROLE (mesmos números do resumo do JSON quando disponíveis). */
  totais_planilha?: {
    entradas_reais: number | null;
    saidas_reais: number | null;
    lucro_reais: number | null;
  } | null;
  entradas_linha_a_linha: { secao: string; descricao: string; valor_reais: number }[];
  saidas_por_categoria: { categoria: string; descricao: string; valor_reais: number }[];
  gastos_fixos_linha_a_linha: { descricao: string; valor_reais: number }[];
  instrucao_relatorio: string;
}

export interface RelatorioMensalPayload {
  tipo: 'mensal';
  mes: number;
  ano: number;
  periodo_label: string;
  controle_caixa_leitura_gestao?: ControleCaixaLeituraGestao;
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
  /** Opcional — agregados auxiliares; a UI de relatórios não depende deste bloco. */
  destaques?: { categorias_maior_despesa: { nome: string; total: number }[]; gastos_fixos_itens: { label: string; valor: number }[] };
  /** Diferença relevante entre totais do extrato e da planilha (quando acima da tolerância). */
  alertas_divergencia?: { bloco: string; delta_absoluto: number; fonte_a: string; fonte_b: string }[];
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

/** R2 — Mensal operacional (espaço / modalidades). */
export interface RelatorioMensalOperacionalPayload {
  tipo: 'mensal_operacional';
  mes: number;
  ano: number;
  periodo_label: string;
  controle_caixa_leitura_gestao?: ControleCaixaLeituraGestao;
  resumo_financeiro_oficial: { entradas: number; saidas: number; saldo: number; fonte: string };
  planilha_controle_caixa?: {
    entrada_total: number | null;
    saida_total: number | null;
    lucro_total: number | null;
    aba: string | null;
    fonte: string;
  };
  receita_por_modalidade_competencia?: { modalidade: string; total: number; fonte: string }[];
  indicadores?: Record<string, unknown>;
  fontes?: Record<string, unknown>;
}

/** R4 — Panorama de alunos (planilha FLUXO). */
export interface RelatorioAlunosPanoramaPayload {
  tipo: 'alunos_panorama';
  ano: number;
  mes_ref: number;
  periodo_label: string;
  prompt_version_relatorios?: string;
  competencia?: { mes: number; ano: number; label: string };
  fonte_dados?: { planilha: string; descricao: string };
  totais?: {
    total_alunos_ativos: number;
    total_mensalidade_competencia: number;
    total_abas: number;
    total_alunos_cadastrados_abas: number;
  };
  por_aba?: {
    aba: string;
    total_alunos_ativos: number;
    total_mensalidade_competencia: number;
    por_modalidade: {
      modalidade: string;
      alunos_ativos: number;
      total_mensalidade_competencia: number;
    }[];
  }[];
  aviso?: string;
  regra_ativos?: string;
  fontes?: Record<string, unknown>;
}

/** R5 — Inadimplência na competência. */
export interface RelatorioAlunosInadimplenciaPayload {
  tipo: 'alunos_inadimplencia_mes';
  mes: number;
  ano: number;
  periodo_label: string;
  kpis: Record<string, number> | null;
  itens: unknown[];
  lista_truncada?: boolean;
  aviso?: string;
}

export type RelatorioPayload =
  | RelatorioDiarioPayload
  | RelatorioMensalPayload
  | RelatorioTrimestralPayload
  | RelatorioAnualPayload
  | RelatorioMensalOperacionalPayload
  | RelatorioAlunosPanoramaPayload
  | RelatorioAlunosInadimplenciaPayload;

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

export async function getRelatorioMensalOperacional(mes: number, ano: number): Promise<RelatorioMensalOperacionalPayload> {
  const params = new URLSearchParams({ mes: String(mes), ano: String(ano) });
  return request<RelatorioMensalOperacionalPayload>(`/api/relatorios/mensal-operacional?${params.toString()}`);
}

export async function getRelatorioAlunosPanorama(mes: number, ano: number): Promise<RelatorioAlunosPanoramaPayload> {
  const params = new URLSearchParams({ mes: String(mes), ano: String(ano) });
  return request<RelatorioAlunosPanoramaPayload>(`/api/relatorios/alunos-panorama?${params.toString()}`);
}

export async function getRelatorioAlunosInadimplencia(mes: number, ano: number): Promise<RelatorioAlunosInadimplenciaPayload> {
  const params = new URLSearchParams({ mes: String(mes), ano: String(ano) });
  return request<RelatorioAlunosInadimplenciaPayload>(`/api/relatorios/alunos-inadimplencia?${params.toString()}`);
}

/** Status da IA para relatórios (se chave está configurada no backend). */
export async function getRelatoriosIAStatus(): Promise<{ configured: boolean; provider: 'gemini' | 'openai' | null }> {
  if (!BASE_URL) return { configured: false, provider: null };
  const res = await apiFetch('/api/relatorios/ia-status', { method: 'GET' });
  if (!res.ok) return { configured: false, provider: null };
  return res.json();
}

/** Gera texto do relatório com IA. Envia o payload do relatório e retorna o texto gerado. */
export async function gerarTextoRelatorioIA(payload: RelatorioPayload): Promise<{ texto: string }> {
  if (!BASE_URL) throw new Error('VITE_BACKEND_URL não configurado');
  const res = await apiFetch('/api/relatorios/gerar-texto-ia', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload }),
  });
  const text = await res.text();
  let data: { error?: string; texto?: string };
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(res.ok ? 'Resposta inválida do backend.' : await parseBackendError(res, text));
  }
  if (!res.ok) throw new Error(data?.error ? `${data.error}` : await parseBackendError(res, text));
  return { texto: data.texto ?? '' };
}

export interface AssistantChatRequest {
  message: string;
  conversationId?: string;
  context?: {
    route?: string;
    role?: 'secretaria' | 'admin' | null;
    monthYear?: string;
  };
}

export interface AssistantChatResponse {
  message: string;
  intent: string;
  confidence: number;
  actions: Array<{ type: 'navigate'; label: string; to: string }>;
  needsConfirmation: boolean;
  quickReplies: string[];
}

export async function chatAcessibilidadeIA(payload: AssistantChatRequest): Promise<AssistantChatResponse> {
  return requestPost<AssistantChatResponse>('/api/ai/assistant/chat', payload);
}

export async function getAcessibilidadeIAStatus(): Promise<{ configured: boolean; provider: 'gemini' | 'groq' | 'openai' | null }> {
  if (!BASE_URL) return { configured: false, provider: null };
  const res = await apiFetch('/api/ai/assistant/status', { method: 'GET' });
  if (!res.ok) return { configured: false, provider: null };
  return res.json();
}

// --- Pagamentos planilha (segunda parte das abas) ---

export interface PagamentoPlanilha {
  data: string; // YYYY-MM-DD
  forma: string;
  valor: number;
  mes: number;
  ano: number;
  mesCompetencia: number;
  anoCompetencia: number;
  responsaveis: string[];
  pagadorPix?: string;
}

export interface PagamentosAluno {
  aluno: string;
  modalidade: string;
  linha: number;
  /** Dia do vencimento (1–31) lido da planilha; pode ser ausente em abas antigas. */
  diaVencimento?: number | null;
  pagamentos: PagamentoPlanilha[];
}

export interface PagamentosPorAba {
  aba: string;
  ano: number;
  alunos: PagamentosAluno[];
}

export interface PagamentosTodasAbasResponse {
  ano: number;
  abas: PagamentosPorAba[];
}

export async function getPagamentosPlanilhaTodasAbas(ano: number): Promise<PagamentosTodasAbasResponse> {
  const params = new URLSearchParams({ ano: String(ano) });
  return request<PagamentosTodasAbasResponse>(`/api/planilha-fluxo-byla/pagamentos-todas?${params.toString()}`);
}

export async function getFluxoOperacionalPagamentosMetaAno(ano: number): Promise<PagamentosTodasAbasResponse> {
  const params = new URLSearchParams({ ano: String(ano) });
  return request<PagamentosTodasAbasResponse>(`/api/fluxo-operacional/pagamentos-meta-ano?${params.toString()}`);
}

export interface ValidacaoFluxoIndiceDia {
  data: string;
  quantidade: number;
  total: number;
  mesCompetencia: number;
  anoCompetencia: number;
}

export interface ValidacaoFluxoIndiceAnoResponse {
  ano: number;
  fonte: 'fluxo_operacional' | 'planilha_google';
  erro?: string;
  abas: string[];
  modalidadesPorAba: Record<string, string[]>;
  datas: ValidacaoFluxoIndiceDia[];
}

/** Lista de datas + filtros — mesma fonte Supabase que a validação do dia. */
export async function getValidacaoFluxoIndiceAno(
  ano: number,
  aba: string = 'TODAS',
  modalidade?: string,
): Promise<ValidacaoFluxoIndiceAnoResponse> {
  const params = new URLSearchParams({ ano: String(ano), aba });
  if (modalidade && modalidade !== 'TODAS') params.set('modalidade', modalidade);
  return request<ValidacaoFluxoIndiceAnoResponse>(`/api/fluxo-operacional/validacao-indice-ano?${params.toString()}`);
}

// --- Validação de pagamentos (planilha x banco) ---

export interface ValidacaoDiariaPlanilhaItem {
  id: string;
  aba: string;
  modalidade: string;
  aluno: string;
  linha: number;
  data: string;
  forma: string;
  valor: number;
  mesCompetencia: number;
  anoCompetencia: number;
  responsaveis: string[];
  pagadorPix?: string;
}

export interface ValidacaoDiariaBancoItem {
  id: string;
  data: string;
  pessoa: string;
  descricao: string | null;
  valor: number;
}

export interface ValidacaoPagamentosDiariaResponse {
  meta: {
    data: string;
    ano: number;
    aba: string;
    abas_consideradas?: string[];
    modalidade: string | null;
    fonte_pagamentos?: 'fluxo_operacional' | 'planilha_google';
  };
  planilha: {
    total: number;
    quantidade: number;
    itens: ValidacaoDiariaPlanilhaItem[];
    erro?: string;
  };
  banco: {
    total: number;
    quantidade: number;
    itens: ValidacaoDiariaBancoItem[];
  };
  validacao: {
    status_geral: 'ok' | 'atencao' | 'divergente';
    qtd_confirmados: number;
    qtd_nao_confirmados: number;
    qtd_possivel_match: number;
    delta_total_planilha_menos_banco: number;
    itens_confirmados: { planilha: ValidacaoDiariaPlanilhaItem; banco: ValidacaoDiariaBancoItem }[];
    itens_nao_confirmados: ValidacaoDiariaPlanilhaItem[];
    itens_possivel_match: { planilha: ValidacaoDiariaPlanilhaItem; candidatos: ValidacaoDiariaBancoItem[] }[];
    itens_banco_sem_correspondencia: ValidacaoDiariaBancoItem[];
  };
}

export async function getValidacaoPagamentosDiaria(
  data: string,
  aba: string = 'TODAS',
  modalidade?: string,
): Promise<ValidacaoPagamentosDiariaResponse> {
  const params = new URLSearchParams({ data, aba });
  if (modalidade && modalidade.trim()) params.set('modalidade', modalidade.trim());
  return request<ValidacaoPagamentosDiariaResponse>(`/api/validacao-pagamentos-diaria?${params.toString()}`);
}

// --- Calendário financeiro (banco × planilha por dia) ---

export interface CalendarioFinanceiroDia {
  data: string;
  banco: { total: number; quantidade: number; itens: ValidacaoDiariaBancoItem[] };
  planilha: { total: number; quantidade: number; itens: ValidacaoDiariaPlanilhaItem[] };
  validacao: {
    status_final: 'pendente' | 'ok' | 'atencao' | 'divergente';
    qtd_planilha_vinculada: number;
  };
}

export interface CalendarioFinanceiroResponse {
  mes: number;
  ano: number;
  dias: CalendarioFinanceiroDia[];
  totais_mes: { banco: number; planilha: number };
  status_contagem?: { pendente: number; ok: number; atencao: number; divergente: number };
  planilha_aviso?: string;
  meta?: { fonte_pagamentos?: 'fluxo_operacional' | 'planilha_google' };
}

export async function getCalendarioFinanceiro(mes: number, ano: number): Promise<CalendarioFinanceiroResponse> {
  const params = new URLSearchParams({ mes: String(mes), ano: String(ano) });
  return request<CalendarioFinanceiroResponse>(`/api/calendario-financeiro?${params.toString()}`);
}

export type ValidacaoStatusDiario = 'pendente' | 'ok' | 'atencao' | 'divergente';

export interface ValidacaoVinculoItem {
  id: string;
  data_ref: string;
  mes: number;
  ano: number;
  banco_id: string;
  planilha_id: string;
  observacao: string | null;
}

export async function getValidacaoVinculos(
  data: string,
  mes: number,
  ano: number,
): Promise<{ data: string; mes: number; ano: number; itens: ValidacaoVinculoItem[] }> {
  if (!BASE_URL) throw new Error('VITE_BACKEND_URL não configurado');
  const params = new URLSearchParams({ data, mes: String(mes), ano: String(ano) });
  const res = await apiFetch(`/api/validacao-vinculos?${params.toString()}`, { method: 'GET' });
  const text = await res.text();
  if (!res.ok) throw new Error(await parseBackendError(res, text));
  return text ? (JSON.parse(text) as { data: string; mes: number; ano: number; itens: ValidacaoVinculoItem[] }) : { data, mes, ano, itens: [] };
}

export async function createValidacaoVinculo(
  data: string,
  mes: number,
  ano: number,
  banco_id: string,
  planilha_ids: string[],
  observacao?: string,
): Promise<{ ok: boolean; persisted?: string }> {
  if (!BASE_URL) throw new Error('VITE_BACKEND_URL não configurado');
  const res = await apiFetch('/api/validacao-vinculos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data, mes, ano, banco_id, planilha_ids, observacao }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(await parseBackendError(res, text));
  return text ? (JSON.parse(text) as { ok: boolean; persisted?: string }) : { ok: true };
}

export async function deleteValidacaoVinculo(planilha_id: string): Promise<{ ok: boolean; persisted?: string }> {
  if (!BASE_URL) throw new Error('VITE_BACKEND_URL não configurado');
  const res = await apiFetch('/api/validacao-vinculos', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planilha_id }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(await parseBackendError(res, text));
  return text ? (JSON.parse(text) as { ok: boolean; persisted?: string }) : { ok: true };
}

