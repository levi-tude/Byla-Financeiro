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
  const res = await fetch(`${BASE_URL.replace(/\/$/, '')}${path}`);
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
  const res = await fetch(`${BASE_URL.replace(/\/$/, '')}${path}`, {
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
  return request<DespesasResponse>(`/api/saidas?${params.toString()}`);
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
    throw new Error(res.ok ? 'Resposta inválida do backend.' : await parseBackendError(res, text));
  }
  if (!res.ok) throw new Error(data?.error ? `${data.error}` : await parseBackendError(res, text));
  return { texto: data.texto ?? '' };
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
    abas_consideradas: string[];
    modalidade: string | null;
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
  const base = BASE_URL.replace(/\/$/, '');
  const params = new URLSearchParams({ data, mes: String(mes), ano: String(ano) });
  const res = await fetch(`${base}/api/validacao-vinculos?${params.toString()}`);
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
  const base = BASE_URL.replace(/\/$/, '');
  const res = await fetch(`${base}/api/validacao-vinculos`, {
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
  const base = BASE_URL.replace(/\/$/, '');
  const res = await fetch(`${base}/api/validacao-vinculos`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planilha_id }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(await parseBackendError(res, text));
  return text ? (JSON.parse(text) as { ok: boolean; persisted?: string }) : { ok: true };
}

// --- Conciliação por vencimento (planilha x competência do mês) ---

export type ConciliacaoVencimentoSituacao = 'ok' | 'atrasado' | 'em_aberto' | 'a_vencer' | 'sem_vencimento';

export type ConciliacaoVencimentoBancoStatus = 'ok' | 'possivel' | 'nao' | 'nao_aplicavel';

export interface ConciliacaoVencimentoItem {
  aba: string;
  modalidade: string;
  aluno: string;
  linha: number;
  dia_vencimento: number | null;
  data_vencimento_mes: string | null;
  pago_na_planilha: boolean;
  data_pagamento_planilha: string | null;
  valor_pagamento_planilha: number | null;
  situacao: ConciliacaoVencimentoSituacao;
  dias_apos_vencimento_quando_pago: number | null;
  dias_em_atraso_hoje: number | null;
  dias_para_vencimento: number | null;
  mensagem: string;
  /** true = todos os lançamentos da competência batem no banco (mesma regra da Validação). */
  banco_confirmado: boolean | null;
  banco_status: ConciliacaoVencimentoBancoStatus;
  data_banco: string | null;
  pessoa_banco: string | null;
  transacao_banco_id: string | null;
  banco_mensagem: string;
}

export interface ConciliacaoVencimentosResponse {
  mes: number;
  ano: number;
  tolerancia_dias: number;
  hoje: string;
  kpis: {
    total: number;
    ok: number;
    atrasado: number;
    em_aberto: number;
    a_vencer: number;
    sem_vencimento: number;
    banco_ok?: number;
    banco_pendente?: number;
    banco_ambiguo?: number;
  };
  itens: ConciliacaoVencimentoItem[];
  aviso?: string;
}

export async function getConciliacaoVencimentos(mes: number, ano: number): Promise<ConciliacaoVencimentosResponse> {
  const params = new URLSearchParams({ mes: String(mes), ano: String(ano) });
  return request<ConciliacaoVencimentosResponse>(`/api/conciliacao-vencimentos?${params.toString()}`);
}
