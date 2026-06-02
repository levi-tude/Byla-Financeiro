import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMonthYear } from '../context/MonthYearContext';
import {
  createFluxoOperacionalAluno,
  createFluxoOperacionalPagamento,
  deleteFluxoOperacionalAluno,
  deleteFluxoOperacionalPagamento,
  getFluxoOperacionalAuditoria,
  getFluxoOperacionalAlunos,
  getFluxoOperacionalPagamentos,
  getFluxoOperacionalResumoMultiMes,
  patchFluxoOperacionalAlunoPendenciasIgnoradas,
  postFluxoOperacionalAlunoCobrancaTentativa,
  updateFluxoOperacionalAluno,
  updateFluxoOperacionalPagamento,
  type FluxoOperacionalAluno,
  type FluxoOperacionalAlunoPayload,
  type FluxoOperacionalPagamento,
  type FluxoOperacionalPagamentoPayload,
  type FluxoOperacionalResumoAlunoItem,
  type FluxoOperacionalResumoMesItem,
  type FluxoPendenciaCampoIgnoravel,
} from '../services/backendApi';
import { useToast } from '../context/ToastContext';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ApiErrorPanel } from '../components/ui/ApiErrorPanel';
import { TableSkeleton } from '../components/ui/TableSkeleton';
import { normalizarAbaMulti, ordenarAbasPresentes } from '../fluxo/fluxoAbaHierarchy';
import { getFluxoAbaTabStyle, getFluxoModalidadeTabStyle } from '../fluxo/fluxoPlanilhaCores';
import { Link } from 'react-router-dom';
import { PeriodoMesCalendarioPopover } from '../components/transacoes/PeriodoMesCalendarioPopover';
import { FilterBar } from '../components/finance/FilterBar';

function formatBrl(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n));
}

function parseCurrencyNumber(raw: string): number | null {
  const normalized = raw
    .trim()
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  if (!normalized) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function toEditableCurrency(raw: string): string {
  const n = parseCurrencyNumber(raw);
  if (n == null) return '';
  return n.toFixed(2).replace('.', ',');
}

function toFormattedCurrency(raw: string): string {
  const n = parseCurrencyNumber(raw);
  if (n == null) return '';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function formatDataBr(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR');
}

function mesReferenciaLegivel(mes: number, ano: number): string {
  const d = new Date(ano, mes - 1, 1);
  const s = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function mesAnoCurto(mes: number, ano: number): string {
  const d = new Date(ano, mes - 1, 1);
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
}

function ordenarDatasIso(a: string, b: string): { min: string; max: string } {
  return a <= b ? { min: a, max: b } : { min: b, max: a };
}

function statusMesClasse(status: FluxoOperacionalResumoMesItem['status']): string {
  if (status === 'pago') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200';
  if (status === 'parcial') return 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200';
  if (status === 'pendente') return 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200';
  if (status === 'futuro') return 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
}

function statusMesLabel(status: FluxoOperacionalResumoMesItem['status']): string {
  if (status === 'pago') return 'Pago';
  if (status === 'parcial') return 'Parcial';
  if (status === 'pendente') return 'Pendente';
  if (status === 'futuro') return 'Aguardando mês';
  return 'Sem dado';
}

const PLANO_OPTIONS = ['Mensal', 'Trimestral', 'Semestral'] as const;
const FORMA_OPTIONS = ['PIX', 'Crédito', 'Débito', 'Dinheiro', 'Transferência', 'Boleto'] as const;
const FORMAS_RESUMO_ORDEM = [...FORMA_OPTIONS, 'Outros'] as const;

function normalizarFormaPagamentoFluxo(raw: string | null | undefined): (typeof FORMAS_RESUMO_ORDEM)[number] {
  const text = String(raw ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
  if (!text) return 'Outros';

  // PIX (inclui variações comuns e erros de digitação simples)
  if (text.includes('pix') || text.includes('pi x') || text.includes('p ix')) return 'PIX';

  // Cartão crédito
  if (text.includes('credito') || text.includes('credit') || text.includes('cartao credito') || text.includes('cartao de credito')) {
    return 'Crédito';
  }

  // Cartão débito
  if (text.includes('debito') || text.includes('debit') || text.includes('cartao debito') || text.includes('cartao de debito')) {
    return 'Débito';
  }

  if (text.includes('dinheiro') || text.includes('especie') || text === 'cash') return 'Dinheiro';
  if (text.includes('transferencia') || text.includes('ted') || text.includes('doc')) return 'Transferência';
  if (text.includes('boleto')) return 'Boleto';

  return 'Outros';
}

function textoPagamentoResponsavel(p: FluxoOperacionalPagamento): string {
  const a = p.responsaveis?.trim();
  const b = p.aluno_responsaveis?.trim();
  return a || b || '—';
}

function textoPagamentoPagador(p: FluxoOperacionalPagamento): string {
  const a = p.pagador_pix?.trim();
  const b = p.aluno_pagador_pix?.trim();
  return a || b || '—';
}

function legendaOrigemValor(origem: FluxoOperacionalAluno['valor_mensal_origem']): string {
  if (origem === 'cadastro') return 'Valor salvo no cadastro';
  if (origem === 'planilha_bruta') return 'Lido da planilha (campo bruto); salve no cadastro para fixar';
  if (origem === 'ultimo_pagamento') return 'Estimado pelo último pagamento registrado';
  return '';
}

function normKeyFluxo(aba: string, modalidade: string, linha: number, nome: string): string {
  return `${aba.trim()}\0${modalidade.trim()}\0${linha}\0${nome.trim().toLowerCase()}`;
}

function chaveAlunoLinhaFluxo(l: LinhaUnificadaFluxo): string {
  if (l.kind === 'com_pagamento') {
    const p = l.pagamento;
    return normKeyFluxo(p.aba, p.modalidade, p.linha_planilha, p.aluno_nome);
  }
  const a = l.aluno;
  return normKeyFluxo(a.aba, a.modalidade, a.linha_planilha, a.aluno_nome);
}

function contarAlunosUnicos(linhas: LinhaUnificadaFluxo[]): number {
  return new Set(linhas.map(chaveAlunoLinhaFluxo)).size;
}

type LinhaUnificadaFluxo =
  | { kind: 'com_pagamento'; aluno: FluxoOperacionalAluno | null; pagamento: FluxoOperacionalPagamento }
  | { kind: 'sem_pagamento_no_mes'; aluno: FluxoOperacionalAluno };

function grupoOrdenacao(l: LinhaUnificadaFluxo): string {
  if (l.kind === 'com_pagamento') {
    const p = l.pagamento;
    return `${p.aba}\0${p.modalidade}\0${p.linha_planilha}\0${p.aluno_nome}`;
  }
  const a = l.aluno;
  return `${a.aba}\0${a.modalidade}\0${a.linha_planilha}\0${a.aluno_nome}`;
}

function textoVencCadastro(aluno: FluxoOperacionalAluno | null, p?: FluxoOperacionalPagamento): string {
  if (aluno?.venc_exibicao?.trim()) return aluno.venc_exibicao;
  if (aluno?.venc?.trim()) return aluno.venc;
  if (p?.aluno_venc?.trim()) return p.aluno_venc;
  return '—';
}

function responsaveisUnificado(aluno: FluxoOperacionalAluno | null, p?: FluxoOperacionalPagamento): string {
  if (aluno?.responsaveis_exibicao?.trim() || aluno?.responsaveis?.trim()) {
    return (aluno.responsaveis_exibicao ?? aluno.responsaveis ?? '').trim();
  }
  if (p) return textoPagamentoResponsavel(p);
  return '—';
}

function pagadorUnificado(aluno: FluxoOperacionalAluno | null, p?: FluxoOperacionalPagamento): string {
  if (aluno?.pagador_pix_exibicao?.trim() || aluno?.pagador_pix?.trim()) {
    return (aluno.pagador_pix_exibicao ?? aluno.pagador_pix ?? '').trim();
  }
  if (p) return textoPagamentoPagador(p);
  return '—';
}

function isPlanoBolsa(plano: string | null | undefined): boolean {
  const normalized = String(plano ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase();
  return normalized === 'bolsa' || normalized.includes('bolsa');
}

function ignoradosPendenciaDoAluno(a: FluxoOperacionalAluno): Set<FluxoPendenciaCampoIgnoravel> {
  const raw = a.pendencia_campos_ignorados;
  const allow = new Set<string>(['wpp', 'responsaveis', 'venc', 'valor_ref', 'pagador_pix', 'plano']);
  const s = new Set<FluxoPendenciaCampoIgnoravel>();
  if (!Array.isArray(raw)) return s;
  for (const x of raw) {
    const k = String(x).trim();
    if (allow.has(k)) s.add(k as FluxoPendenciaCampoIgnoravel);
  }
  return s;
}

/** Campos do cadastro que costumam precisar estar preenchidos para a secretaria. */
function camposCadastroFaltantes(a: FluxoOperacionalAluno): string[] {
  const ign = ignoradosPendenciaDoAluno(a);
  const r: string[] = [];
  if (!ign.has('wpp') && !String(a.wpp ?? '').trim()) r.push('WhatsApp');
  if (!ign.has('responsaveis') && !(a.responsaveis_exibicao?.trim() || a.responsaveis?.trim())) r.push('Responsáveis');
  if (!ign.has('venc') && !(a.venc_exibicao?.trim() || a.venc?.trim())) r.push('Vencimento');
  const planoBolsa = isPlanoBolsa(a.plano);
  if (!ign.has('valor_ref') && !planoBolsa) {
    if (a.valor_mensal_origem === 'planilha_bruta' || a.valor_mensal_origem === 'ultimo_pagamento') {
      r.push('Valor ref. (confirmar no cadastro)');
    } else if (a.valor_referencia == null && a.valor_mensal_exibicao == null) {
      r.push('Valor ref.');
    }
  }
  if (!ign.has('pagador_pix') && !(a.pagador_pix_exibicao?.trim() || a.pagador_pix?.trim())) r.push('Pagador PIX');
  if (!ign.has('plano') && !String(a.plano ?? '').trim()) r.push('Plano');
  return r;
}

function pendenciasParaExibir(l: LinhaUnificadaFluxo): string[] {
  if (l.kind === 'sem_pagamento_no_mes') {
    return [...camposCadastroFaltantes(l.aluno), 'Pagamento do mês não lançado'];
  }
  if (!l.aluno) return ['Cadastro do aluno ausente — criar vínculo'];
  return camposCadastroFaltantes(l.aluno);
}

function temPendenciaTrabalho(l: LinhaUnificadaFluxo): boolean {
  if (l.kind === 'sem_pagamento_no_mes') return true;
  if (l.kind === 'com_pagamento' && !l.aluno) return true;
  if (l.kind === 'com_pagamento' && l.aluno) return camposCadastroFaltantes(l.aluno).length > 0;
  return false;
}

type GrupoModalidadeFluxo = { modalidade: string; linhas: LinhaUnificadaFluxo[] };
type GrupoAbaFluxo = { aba: string; modalidades: GrupoModalidadeFluxo[] };

function agruparLinhasFluxo(linhas: LinhaUnificadaFluxo[]): GrupoAbaFluxo[] {
  const porAba = new Map<string, Map<string, LinhaUnificadaFluxo[]>>();
  for (const linha of linhas) {
    const aba = (linha.kind === 'com_pagamento' ? linha.pagamento.aba : linha.aluno.aba).trim() || '—';
    const modalidade = (linha.kind === 'com_pagamento' ? linha.pagamento.modalidade : linha.aluno.modalidade).trim() || '—';
    if (!porAba.has(aba)) porAba.set(aba, new Map());
    const porMod = porAba.get(aba)!;
    if (!porMod.has(modalidade)) porMod.set(modalidade, []);
    porMod.get(modalidade)!.push(linha);
  }
  const abas = [...porAba.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return abas.map((aba) => {
    const porMod = porAba.get(aba)!;
    const mods = [...porMod.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return {
      aba,
      modalidades: mods.map((modalidade) => ({
        modalidade,
        linhas: porMod.get(modalidade)!,
      })),
    };
  });
}

type FormState = {
  aba: string;
  modalidade: string;
  linhaPlanilha: string;
  alunoNome: string;
  wpp: string;
  responsaveis: string;
  plano: string;
  matricula: string;
  venc: string;
  valorReferencia: string;
  pagadorPix: string;
  observacoes: string;
  ativo: boolean;
};

function initialForm(): FormState {
  return {
    aba: '',
    modalidade: '',
    linhaPlanilha: '',
    alunoNome: '',
    wpp: '',
    responsaveis: '',
    plano: '',
    matricula: '',
    venc: '',
    valorReferencia: '',
    pagadorPix: '',
    observacoes: '',
    ativo: true,
  };
}

/** Mescla o formulário do modal sobre o registro atual para recalcular pendências em tempo real. */
function alunoMescladoFormComBase(base: FluxoOperacionalAluno, form: FormState): FluxoOperacionalAluno {
  const parsedValor = parseCurrencyNumber(form.valorReferencia);
  return {
    ...base,
    wpp: form.wpp.trim() || null,
    responsaveis: form.responsaveis.trim() || null,
    responsaveis_exibicao: null,
    venc: form.venc.trim() || null,
    venc_exibicao: null,
    pagador_pix: form.pagadorPix.trim() || null,
    pagador_pix_exibicao: null,
    plano: form.plano.trim() || null,
    valor_referencia: Number.isFinite(parsedValor as number) ? (parsedValor as number) : null,
  };
}

type PendenciaFormCampo = 'wpp' | 'responsaveis' | 'venc' | 'valorReferencia' | 'pagadorPix' | 'plano';

function camposFormMarcadosPeloRotulo(faltas: string[]): Set<PendenciaFormCampo> {
  const s = new Set<PendenciaFormCampo>();
  for (const f of faltas) {
    if (f === 'WhatsApp') s.add('wpp');
    else if (f === 'Responsáveis') s.add('responsaveis');
    else if (f === 'Vencimento') s.add('venc');
    else if (f === 'Valor ref.' || f.startsWith('Valor ref.')) s.add('valorReferencia');
    else if (f === 'Pagador PIX') s.add('pagadorPix');
    else if (f === 'Plano') s.add('plano');
  }
  return s;
}

function rotuloComAsteriscoPendencia(texto: string, pendente: boolean): ReactNode {
  return (
    <>
      {pendente ? (
        <span className="text-rose-600 font-semibold dark:text-rose-400" aria-hidden="true">
          *{' '}
        </span>
      ) : null}
      {texto}
      {pendente ? <span className="sr-only"> — pendência no cadastro</span> : null}
    </>
  );
}

function toPayload(form: FormState): FluxoOperacionalAlunoPayload {
  const valor = parseCurrencyNumber(form.valorReferencia);
  const linha = Number(form.linhaPlanilha);
  return {
    aba: form.aba.trim(),
    modalidade: form.modalidade.trim(),
    linhaPlanilha: Number.isInteger(linha) && linha > 0 ? linha : undefined,
    alunoNome: form.alunoNome.trim(),
    wpp: form.wpp.trim() || null,
    responsaveis: form.responsaveis.trim() || null,
    plano: form.plano.trim() || null,
    matricula: form.matricula.trim() || null,
    venc: form.venc.trim() || null,
    valorReferencia: Number.isFinite(valor as number) ? valor : null,
    pagadorPix: form.pagadorPix.trim() || null,
    observacoes: form.observacoes.trim() || null,
    ativo: form.ativo,
  };
}

function toForm(item: FluxoOperacionalAluno): FormState {
  return {
    aba: item.aba,
    modalidade: item.modalidade,
    linhaPlanilha: String(item.linha_planilha),
    alunoNome: item.aluno_nome,
    wpp: item.wpp ?? '',
    responsaveis: item.responsaveis ?? '',
    plano: item.plano ?? '',
    matricula: item.matricula ?? '',
    venc: item.venc ?? '',
    valorReferencia: item.valor_referencia != null ? formatBrl(item.valor_referencia) : '',
    pagadorPix: item.pagador_pix ?? '',
    observacoes: item.observacoes ?? '',
    ativo: item.ativo,
  };
}

function itemWithPatchToPayload(
  item: FluxoOperacionalAluno,
  patch: Partial<Pick<FormState, 'venc' | 'valorReferencia'>>,
): FluxoOperacionalAlunoPayload {
  return toPayload({ ...toForm(item), ...patch });
}

type PagamentoFormState = {
  aba: string;
  modalidade: string;
  linhaPlanilha: string;
  ordemLancamento: string;
  alunoNome: string;
  dataPagamento: string;
  forma: string;
  valor: string;
  mesCompetencia: string;
  anoCompetencia: string;
  responsaveis: string;
  pagadorPix: string;
};

function initialPagamentoForm(mes: number, ano: number): PagamentoFormState {
  return {
    aba: '',
    modalidade: '',
    linhaPlanilha: '',
    ordemLancamento: '1',
    alunoNome: '',
    dataPagamento: '',
    forma: '',
    valor: '',
    mesCompetencia: String(mes),
    anoCompetencia: String(ano),
    responsaveis: '',
    pagadorPix: '',
  };
}

function toPagamentoPayload(form: PagamentoFormState): FluxoOperacionalPagamentoPayload {
  const valor = parseCurrencyNumber(form.valor);
  const linha = Number(form.linhaPlanilha);
  return {
    aba: form.aba.trim(),
    modalidade: form.modalidade.trim(),
    linhaPlanilha: Number.isInteger(linha) && linha > 0 ? linha : undefined,
    ordemLancamento: Number(form.ordemLancamento || '1'),
    alunoNome: form.alunoNome.trim(),
    dataPagamento: form.dataPagamento,
    forma: form.forma.trim() || null,
    valor: valor != null && Number.isFinite(valor) ? valor : NaN,
    mesCompetencia: Number(form.mesCompetencia),
    anoCompetencia: Number(form.anoCompetencia),
    responsaveis: form.responsaveis.trim() || null,
    pagadorPix: form.pagadorPix.trim() || null,
  };
}

function toPagamentoForm(item: FluxoOperacionalPagamento): PagamentoFormState {
  return {
    aba: item.aba,
    modalidade: item.modalidade,
    linhaPlanilha: String(item.linha_planilha),
    ordemLancamento: String(item.ordem_lancamento),
    alunoNome: item.aluno_nome,
    dataPagamento: item.data_pagamento,
    forma: item.forma ?? '',
    valor: formatBrl(item.valor),
    mesCompetencia: String(item.mes_competencia),
    anoCompetencia: String(item.ano_competencia),
    responsaveis: item.responsaveis ?? '',
    pagadorPix: item.pagador_pix ?? '',
  };
}

type ConfirmState =
  | null
  | { kind: 'aluno'; id: string; name: string }
  | { kind: 'pagamento'; id: string; name: string };

type InlineAlunoEdit = { id: string; field: 'venc' | 'valor'; value: string };
type BuscaEscopo = 'todos' | 'aluno' | 'responsavel' | 'pagador';
type FiltroRapido = 'nenhum' | 'sem_pagamento_mes' | 'sem_cadastro_vinculado' | 'com_pendencias' | 'so_ativos';
type OrdemListaCampo = 'aluno' | 'data_pagamento' | 'valor_pago' | 'vencimento';
type OrdemListaDirecao = 'asc' | 'desc';
type PresetFluxo = 'cobranca' | 'pendencias' | 'fechamento';

const FLUXO_FILTROS_STORAGE_KEY = 'byla:fluxo-operacional:filtros-v2';

function PresetsFluxoBar({
  presetAtivo,
  onPreset,
}: {
  presetAtivo: PresetFluxo | null;
  onPreset: (preset: PresetFluxo) => void;
}) {
  const btn = (id: PresetFluxo, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => onPreset(id)}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
        presetAtivo === id
          ? 'bg-indigo-600 text-white'
          : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Presets</span>
      {btn('cobranca', 'Cobrança')}
      {btn('pendencias', 'Pendências')}
      {btn('fechamento', 'Fechamento do mês')}
    </div>
  );
}

export function FluxoCaixaOperacionalPage() {
  const { monthYear } = useMonthYear();
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [activeTopTab, setActiveTopTab] = useState<'atividades' | 'resumo_meio_pagamento' | 'pendencias_cobrancas'>(
    'atividades'
  );
  const [abaDetalheAberta, setAbaDetalheAberta] = useState<string | null>(null);
  const [modalidadesAbertasPorAba, setModalidadesAbertasPorAba] = useState<Record<string, string | null>>({});
  const [form, setForm] = useState<FormState>(initialForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [alunoModalDestacarPendencias, setAlunoModalDestacarPendencias] = useState(false);
  const [alunoUiSnapshot, setAlunoUiSnapshot] = useState<FluxoOperacionalAluno | null>(null);
  const [cobrancaModalAluno, setCobrancaModalAluno] = useState<FluxoOperacionalAluno | null>(null);
  const [cobrancaNotaDraft, setCobrancaNotaDraft] = useState('');
  /** Pendências de cadastro a ignorar para este aluno — gravado ao clicar em Salvar alterações. */
  const [ignorarChavesDraft, setIgnorarChavesDraft] = useState<FluxoPendenciaCampoIgnoravel[]>([]);
  const [isSavingAlunoModal, setIsSavingAlunoModal] = useState(false);
  const [abaFiltro, setAbaFiltro] = useState('');
  const [modalidadeFiltro, setModalidadeFiltro] = useState('');
  const [ativoFiltro, setAtivoFiltro] = useState<'todos' | 'ativos' | 'inativos'>('ativos');
  const [busca, setBusca] = useState('');
  const [buscaDebounced, setBuscaDebounced] = useState('');
  const [buscaEscopo, setBuscaEscopo] = useState<BuscaEscopo>('todos');
  const [filtroRapido, setFiltroRapido] = useState<FiltroRapido>('nenhum');
  const [ordemCampo, setOrdemCampo] = useState<OrdemListaCampo>('aluno');
  const [ordemDirecao, setOrdemDirecao] = useState<OrdemListaDirecao>('asc');
  const [mensalColunasExtras, setMensalColunasExtras] = useState(false);
  const [soPendencias, setSoPendencias] = useState(false);
  const [modoVisao, setModoVisao] = useState<'mensal' | 'multi'>('multi');
  const [multiAbaAtiva, setMultiAbaAtiva] = useState<string>('BYLA DANÇA');
  const [pendenciasAtividadeFiltro, setPendenciasAtividadeFiltro] = useState<string>('todas');
  const [multiModalidadeAbertaPorAba, setMultiModalidadeAbertaPorAba] = useState<Record<string, string | null>>({});
  const [formaResumoSelecionada, setFormaResumoSelecionada] = useState<string>('Todas');
  const [resumoFiltroPeriodoModo, setResumoFiltroPeriodoModo] = useState<'mes' | 'periodo'>('mes');
  const [resumoPeriodoInicio, setResumoPeriodoInicio] = useState('');
  const [resumoPeriodoFim, setResumoPeriodoFim] = useState('');
  const [resumoPeriodoCliquePendente, setResumoPeriodoCliquePendente] = useState<string | null>(null);
  const [resumoCalendarioAberto, setResumoCalendarioAberto] = useState(false);
  const resumoCalendarioPopoverRef = useRef<HTMLDivElement>(null);
  const resumoCalendarioTriggerRef = useRef<HTMLDivElement>(null);
  const [pagForm, setPagForm] = useState<PagamentoFormState>(initialPagamentoForm(monthYear.mes, monthYear.ano));
  const [pagEditId, setPagEditId] = useState<string | null>(null);
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [alunoModalOpen, setAlunoModalOpen] = useState(false);
  const [pagModalOpen, setPagModalOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [inlineAluno, setInlineAluno] = useState<InlineAlunoEdit | null>(null);
  const alunoModalTitleRef = useRef<HTMLHeadingElement>(null);
  const cobrancaModalTitleRef = useRef<HTMLHeadingElement>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const alunoUpdateSourceRef = useRef<'inline' | 'modal'>('modal');
  const listaMesRef = useRef<HTMLElement | null>(null);

  const alunosQuery = useQuery({
    queryKey: ['fluxo-operacional-alunos', abaFiltro, modalidadeFiltro, ativoFiltro, buscaDebounced, buscaEscopo],
    queryFn: () =>
      getFluxoOperacionalAlunos({
        aba: abaFiltro || undefined,
        modalidade: modalidadeFiltro || undefined,
        ativo: ativoFiltro === 'todos' ? undefined : ativoFiltro === 'ativos',
        q: buscaEscopo === 'responsavel' || buscaEscopo === 'pagador' ? undefined : buscaDebounced || undefined,
        limit: 2500,
      }),
  });

  const pagamentosQuery = useQuery({
    queryKey: ['fluxo-operacional-pagamentos', monthYear.mes, monthYear.ano, abaFiltro, modalidadeFiltro, buscaDebounced, buscaEscopo],
    queryFn: () =>
      getFluxoOperacionalPagamentos({
        ano: monthYear.ano,
        mes: monthYear.mes,
        aba: abaFiltro || undefined,
        modalidade: modalidadeFiltro || undefined,
        q: buscaEscopo === 'responsavel' || buscaEscopo === 'pagador' ? undefined : buscaDebounced || undefined,
      }),
  });

  const alunosPainelQuery = useQuery({
    queryKey: ['fluxo-operacional-alunos-painel', 'todos-ativos'],
    queryFn: () => getFluxoOperacionalAlunos({ ativo: true, limit: 2500 }),
    enabled: activeTopTab === 'pendencias_cobrancas',
  });

  const pagamentosPainelQuery = useQuery({
    queryKey: ['fluxo-operacional-pagamentos-painel', new Date().getFullYear()],
    queryFn: () => getFluxoOperacionalPagamentos({ ano: new Date().getFullYear(), limit: 1000 }),
    enabled: activeTopTab === 'pendencias_cobrancas',
  });

  const pagamentosResumoQuery = useQuery({
    queryKey: ['fluxo-operacional-pagamentos-resumo', monthYear.ano],
    queryFn: () =>
      getFluxoOperacionalPagamentos({
        ano: monthYear.ano,
        limit: 1000,
      }),
    enabled: activeTopTab === 'resumo_meio_pagamento',
  });

  const pagamentosAnoMultiQuery = useQuery({
    queryKey: ['fluxo-operacional-pagamentos-ano-multi', 2026],
    queryFn: () => getFluxoOperacionalPagamentos({ ano: 2026, limit: 1000 }),
    enabled: modoVisao === 'multi',
  });

  const auditoriaQuery = useQuery({
    queryKey: ['fluxo-operacional-auditoria'],
    queryFn: () => getFluxoOperacionalAuditoria({ limit: 30 }),
    enabled: historicoAberto,
  });

  const resumoMultiMesQuery = useQuery({
    queryKey: ['fluxo-operacional-resumo-multi', '2026'],
    queryFn: () =>
      getFluxoOperacionalResumoMultiMes({
        ano: 2026,
        mes: 12,
        janela: 12,
      }),
    enabled: modoVisao === 'multi',
  });

  const createMut = useMutation({
    mutationFn: (payload: FluxoOperacionalAlunoPayload) => createFluxoOperacionalAluno(payload),
    onSuccess: async () => {
      showToast('Aluno salvo no fluxo operacional.', 'success');
      setForm(initialForm());
      setAlunoModalOpen(false);
      setEditId(null);
      setAlunoModalDestacarPendencias(false);
      setAlunoUiSnapshot(null);
      setIgnorarChavesDraft([]);
      await qc.invalidateQueries({ queryKey: ['fluxo-operacional-alunos'] });
      await qc.invalidateQueries({ queryKey: ['fluxo-operacional-alunos-painel'] });
      await qc.invalidateQueries({ queryKey: ['fluxo-operacional-resumo-multi'] });
      await qc.invalidateQueries({ queryKey: ['fluxo-operacional-auditoria'] });
    },
    onError: (e) => {
      showToast(e instanceof Error ? e.message : String(e), 'error');
    },
  });

  const updateMut = useMutation({
    mutationFn: (args: { id: string; payload: FluxoOperacionalAlunoPayload }) =>
      updateFluxoOperacionalAluno(args.id, args.payload),
    onSuccess: async () => {
      const fromInline = alunoUpdateSourceRef.current === 'inline';
      setInlineAluno(null);
      showToast(
        fromInline ? 'Salvo — valor ou vencimento atualizado no cadastro.' : 'Salvo — cadastro do aluno atualizado.',
        'success',
      );
      setForm(initialForm());
      setEditId(null);
      setAlunoModalOpen(false);
      setAlunoModalDestacarPendencias(false);
      setAlunoUiSnapshot(null);
      setIgnorarChavesDraft([]);
      await qc.invalidateQueries({ queryKey: ['fluxo-operacional-alunos'] });
      await qc.invalidateQueries({ queryKey: ['fluxo-operacional-alunos-painel'] });
      await qc.invalidateQueries({ queryKey: ['fluxo-operacional-resumo-multi'] });
      await qc.invalidateQueries({ queryKey: ['fluxo-operacional-auditoria'] });
    },
    onError: (e) => {
      showToast(e instanceof Error ? e.message : String(e), 'error');
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      try {
        return await deleteFluxoOperacionalAluno(id, false);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('pagamento(s) vinculado(s)')) {
          const force = window.confirm(
            'Esse aluno tem pagamentos vinculados. Deseja excluir aluno e pagamentos juntos?'
          );
          if (!force) throw e;
          return deleteFluxoOperacionalAluno(id, true);
        }
        throw e;
      }
    },
    onSuccess: async (_, id) => {
      showToast('Aluno removido do fluxo operacional.', 'success');
      setConfirm(null);
      if (editId === id) {
        setAlunoModalOpen(false);
        setEditId(null);
        setForm(initialForm());
        setAlunoModalDestacarPendencias(false);
        setAlunoUiSnapshot(null);
        setIgnorarChavesDraft([]);
      }
      await qc.invalidateQueries({ queryKey: ['fluxo-operacional-alunos'] });
      await qc.invalidateQueries({ queryKey: ['fluxo-operacional-alunos-painel'] });
      await qc.invalidateQueries({ queryKey: ['fluxo-operacional-pagamentos'] });
      await qc.invalidateQueries({ queryKey: ['fluxo-operacional-pagamentos-painel'] });
      await qc.invalidateQueries({ queryKey: ['fluxo-operacional-pagamentos-ano-multi'] });
      await qc.invalidateQueries({ queryKey: ['fluxo-operacional-resumo-multi'] });
      await qc.invalidateQueries({ queryKey: ['fluxo-operacional-auditoria'] });
    },
    onError: (e) => {
      showToast(e instanceof Error ? e.message : String(e), 'error');
    },
  });

  const createPagMut = useMutation({
    mutationFn: (payload: FluxoOperacionalPagamentoPayload) => createFluxoOperacionalPagamento(payload),
    onSuccess: async () => {
      showToast('Pagamento salvo no fluxo operacional.', 'success');
      setPagForm(initialPagamentoForm(monthYear.mes, monthYear.ano));
      setPagModalOpen(false);
      setPagEditId(null);
      await qc.invalidateQueries({ queryKey: ['fluxo-operacional-pagamentos'] });
      await qc.invalidateQueries({ queryKey: ['fluxo-operacional-pagamentos-painel'] });
      await qc.invalidateQueries({ queryKey: ['fluxo-operacional-pagamentos-ano-multi'] });
      await qc.invalidateQueries({ queryKey: ['fluxo-operacional-resumo-multi'] });
      await qc.invalidateQueries({ queryKey: ['fluxo-operacional-auditoria'] });
    },
    onError: (e) => {
      showToast(e instanceof Error ? e.message : String(e), 'error');
    },
  });

  const updatePagMut = useMutation({
    mutationFn: (args: { id: string; payload: FluxoOperacionalPagamentoPayload }) =>
      updateFluxoOperacionalPagamento(args.id, args.payload),
    onSuccess: async () => {
      showToast('Pagamento atualizado no fluxo operacional.', 'success');
      setPagForm(initialPagamentoForm(monthYear.mes, monthYear.ano));
      setPagEditId(null);
      setPagModalOpen(false);
      await qc.invalidateQueries({ queryKey: ['fluxo-operacional-pagamentos'] });
      await qc.invalidateQueries({ queryKey: ['fluxo-operacional-pagamentos-painel'] });
      await qc.invalidateQueries({ queryKey: ['fluxo-operacional-pagamentos-ano-multi'] });
      await qc.invalidateQueries({ queryKey: ['fluxo-operacional-resumo-multi'] });
      await qc.invalidateQueries({ queryKey: ['fluxo-operacional-auditoria'] });
    },
    onError: (e) => {
      showToast(e instanceof Error ? e.message : String(e), 'error');
    },
  });

  const deletePagMut = useMutation({
    mutationFn: (id: string) => deleteFluxoOperacionalPagamento(id),
    onSuccess: async () => {
      showToast('Pagamento removido do fluxo operacional.', 'success');
      setConfirm(null);
      setPagModalOpen(false);
      setPagEditId(null);
      setPagForm(initialPagamentoForm(monthYear.mes, monthYear.ano));
      await qc.invalidateQueries({ queryKey: ['fluxo-operacional-pagamentos'] });
      await qc.invalidateQueries({ queryKey: ['fluxo-operacional-pagamentos-painel'] });
      await qc.invalidateQueries({ queryKey: ['fluxo-operacional-pagamentos-ano-multi'] });
      await qc.invalidateQueries({ queryKey: ['fluxo-operacional-resumo-multi'] });
      await qc.invalidateQueries({ queryKey: ['fluxo-operacional-auditoria'] });
    },
    onError: (e) => {
      showToast(e instanceof Error ? e.message : String(e), 'error');
    },
  });

  const postCobrancaTentativaMut = useMutation({
    mutationFn: (args: { alunoId: string; nota: string }) =>
      postFluxoOperacionalAlunoCobrancaTentativa(args.alunoId, args.nota),
    onSuccess: async (data, args) => {
      showToast('Tentativa de contato registrada.', 'success');
      setCobrancaNotaDraft('');
      setCobrancaModalAluno((prev) =>
        prev && prev.id === args.alunoId ? { ...prev, cobranca_tentativas: data.cobrancaTentativas } : prev,
      );
      await qc.invalidateQueries({ queryKey: ['fluxo-operacional-alunos'] });
      await qc.invalidateQueries({ queryKey: ['fluxo-operacional-alunos-painel'] });
    },
    onError: (e) => {
      showToast(e instanceof Error ? e.message : String(e), 'error');
    },
  });

  const submitting = createMut.isPending || updateMut.isPending || isSavingAlunoModal;
  const submittingPagamento = createPagMut.isPending || updatePagMut.isPending;

  const totalVisivel = alunosQuery.data?.itens.length ?? 0;
  const totalAtivos = useMemo(
    () => (alunosQuery.data?.itens ?? []).filter((x) => x.ativo).length,
    [alunosQuery.data?.itens]
  );
  const totalPagamentosMes = pagamentosQuery.data?.itens.length ?? 0;

  const alunoEdicaoBase = useMemo(() => {
    if (!editId) return null;
    const fromList = (alunosQuery.data?.itens ?? []).find((x) => x.id === editId);
    if (fromList) return fromList;
    if (alunoUiSnapshot?.id === editId) return alunoUiSnapshot;
    return null;
  }, [alunosQuery.data?.itens, editId, alunoUiSnapshot]);

  const cobrancaAlunoEfetivo = useMemo(() => {
    if (!cobrancaModalAluno) return null;
    const fresh = (alunosQuery.data?.itens ?? []).find((x) => x.id === cobrancaModalAluno.id);
    return fresh ?? cobrancaModalAluno;
  }, [cobrancaModalAluno, alunosQuery.data?.itens]);

  const rotulosPendenciaNoModalCadastro = useMemo(() => {
    if (!alunoModalOpen || !alunoModalDestacarPendencias || !editId || !alunoEdicaoBase) {
      return new Set<PendenciaFormCampo>();
    }
    const merged = alunoMescladoFormComBase(alunoEdicaoBase, form);
    return camposFormMarcadosPeloRotulo(camposCadastroFaltantes(merged));
  }, [alunoModalOpen, alunoModalDestacarPendencias, editId, alunoEdicaoBase, form]);

  const pagamentosResumoFiltrados = useMemo(() => {
    const all = pagamentosResumoQuery.data?.itens ?? [];
    const byMonth = all.filter(
      (p) => p.ano_competencia === monthYear.ano && p.mes_competencia === monthYear.mes
    );
    if (resumoFiltroPeriodoModo === 'mes') return byMonth;
    if (!resumoPeriodoInicio || !resumoPeriodoFim) return byMonth;
    const { min, max } = ordenarDatasIso(resumoPeriodoInicio, resumoPeriodoFim);
    return all.filter((p) => p.data_pagamento >= min && p.data_pagamento <= max);
  }, [
    pagamentosResumoQuery.data?.itens,
    monthYear.ano,
    monthYear.mes,
    resumoFiltroPeriodoModo,
    resumoPeriodoInicio,
    resumoPeriodoFim,
  ]);

  const resumoPagamentosPorForma = useMemo(() => {
    const base = pagamentosResumoFiltrados;
    const map = new Map<string, { forma: string; quantidade: number; total: number; itens: FluxoOperacionalPagamento[] }>();
    for (const forma of FORMAS_RESUMO_ORDEM) {
      map.set(forma, { forma, quantidade: 0, total: 0, itens: [] });
    }
    for (const p of base) {
      const bucket = normalizarFormaPagamentoFluxo(p.forma);
      const current = map.get(bucket)!;
      current.quantidade += 1;
      current.total += Number(p.valor || 0);
      current.itens.push(p);
    }
    return [...map.values()].filter((x) => x.quantidade > 0);
  }, [pagamentosResumoFiltrados]);

  const itensResumoFormaSelecionada = useMemo(() => {
    if (formaResumoSelecionada === 'Todas') {
      return pagamentosResumoFiltrados.slice().sort((a, b) => b.data_pagamento.localeCompare(a.data_pagamento));
    }
    const found = resumoPagamentosPorForma.find((x) => x.forma === formaResumoSelecionada);
    return (found?.itens ?? []).slice().sort((a, b) => b.data_pagamento.localeCompare(a.data_pagamento));
  }, [formaResumoSelecionada, pagamentosResumoFiltrados, resumoPagamentosPorForma]);

  const painelOperacional = useMemo(() => {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth() + 1;
    const pagamentosMes = new Set(
      (pagamentosPainelQuery.data?.itens ?? [])
        .filter((p) => p.ano_competencia === ano && p.mes_competencia === mes)
        .map((p) => `${normalizarAbaMulti(p.aba)}\u0000${p.modalidade}\u0000${p.linha_planilha}\u0000${p.aluno_nome.toLowerCase()}`),
    );

    const cadastroPendencias: FluxoOperacionalAluno[] = [];
    const pagamentoPendencias: FluxoOperacionalAluno[] = [];
    const cobrancaVenceAmanha: FluxoOperacionalAluno[] = [];
    const cobrancaHoje: FluxoOperacionalAluno[] = [];
    const cobrancaVencidos: FluxoOperacionalAluno[] = [];
    const cobrancaPlanos: FluxoOperacionalAluno[] = [];

    for (const a of alunosPainelQuery.data?.itens ?? []) {
      if (!a.ativo) continue;
      if (camposCadastroFaltantes(a).length > 0) cadastroPendencias.push(a);

      const key = `${normalizarAbaMulti(a.aba)}\u0000${a.modalidade}\u0000${a.linha_planilha}\u0000${a.aluno_nome.toLowerCase()}`;
      const venceuDia = Number(String(a.venc_exibicao ?? a.venc ?? '').replace(/\D/g, ''));
      const temPagamentoMes = pagamentosMes.has(key);
      const planoBolsa = isPlanoBolsa(a.plano);
      if (!planoBolsa && !temPagamentoMes && Number.isFinite(venceuDia) && venceuDia >= 1 && venceuDia <= 31) {
        if (hoje.getDate() > venceuDia) pagamentoPendencias.push(a);
        if (hoje.getDate() === venceuDia) cobrancaHoje.push(a);
        if (hoje.getDate() + 1 === venceuDia) cobrancaVenceAmanha.push(a);
        if (hoje.getDate() > venceuDia) cobrancaVencidos.push(a);
      }

      const plano = String(a.plano ?? '').toLowerCase();
      if (plano.includes('trimes') || plano.includes('semes')) {
        const pagamentosAluno = (pagamentosAnoMultiQuery.data?.itens ?? []).filter(
          (p) =>
            normalizarAbaMulti(p.aba) === normalizarAbaMulti(a.aba) &&
            p.modalidade === a.modalidade &&
            p.linha_planilha === a.linha_planilha &&
            p.aluno_nome.toLowerCase() === a.aluno_nome.toLowerCase(),
        );
        const ultimo = pagamentosAluno.sort((x, y) => y.data_pagamento.localeCompare(x.data_pagamento))[0];
        if (ultimo) {
          const dt = new Date(ultimo.data_pagamento);
          dt.setMonth(dt.getMonth() + (plano.includes('semes') ? 6 : 3));
          const diffDias = Math.ceil((dt.getTime() - hoje.getTime()) / 86400000);
          if (diffDias <= 7) cobrancaPlanos.push(a);
        }
      }
    }

    return {
      pendenciasGeral: new Set([...cadastroPendencias, ...pagamentoPendencias].map((a) => a.id)).size,
      cadastroPendencias,
      pagamentoPendencias,
      cobrancaVenceAmanha,
      cobrancaHoje,
      cobrancaVencidos,
      cobrancaPlanos,
      referencia: { ano, mes },
    };
  }, [alunosPainelQuery.data?.itens, pagamentosPainelQuery.data?.itens, pagamentosAnoMultiQuery.data?.itens]);

  const pendenciasInternasCards = useMemo(() => {
    const byId = new Map<
      string,
      {
        aluno: FluxoOperacionalAluno;
        motivos: string[];
        recomendada: 'resolver' | 'cobrar';
      }
    >();

    for (const aluno of painelOperacional.cadastroPendencias) {
      const motivos = camposCadastroFaltantes(aluno);
      byId.set(aluno.id, {
        aluno,
        motivos: motivos.length > 0 ? motivos : ['Cadastro incompleto'],
        recomendada: 'resolver',
      });
    }

    for (const aluno of painelOperacional.pagamentoPendencias) {
      const found = byId.get(aluno.id);
      const motivos = [...(found?.motivos ?? []), 'Pagamento do mês não lançado'];
      byId.set(aluno.id, {
        aluno,
        motivos: [...new Set(motivos)],
        recomendada: camposCadastroFaltantes(aluno).length > 0 ? 'resolver' : 'cobrar',
      });
    }

    return [...byId.values()];
  }, [painelOperacional]);

  const cobrancasCards = useMemo(() => {
    const rows: Array<{
      aluno: FluxoOperacionalAluno;
      status: 'Vence hoje' | 'Vence amanhã' | 'Vencido' | 'Plano próximo';
      recomendada: 'resolver' | 'cobrar';
      motivo: string;
    }> = [];

    for (const aluno of painelOperacional.cobrancaHoje) {
      rows.push({
        aluno,
        status: 'Vence hoje',
        recomendada: camposCadastroFaltantes(aluno).length > 0 ? 'resolver' : 'cobrar',
        motivo: 'Cobrança com vencimento hoje.',
      });
    }
    for (const aluno of painelOperacional.cobrancaVenceAmanha) {
      rows.push({
        aluno,
        status: 'Vence amanhã',
        recomendada: camposCadastroFaltantes(aluno).length > 0 ? 'resolver' : 'cobrar',
        motivo: 'Cobrança com vencimento amanhã.',
      });
    }
    for (const aluno of painelOperacional.cobrancaVencidos) {
      rows.push({
        aluno,
        status: 'Vencido',
        recomendada: camposCadastroFaltantes(aluno).length > 0 ? 'resolver' : 'cobrar',
        motivo: 'Pagamento vencido sem baixa no mês.',
      });
    }
    for (const aluno of painelOperacional.cobrancaPlanos) {
      rows.push({
        aluno,
        status: 'Plano próximo',
        recomendada: camposCadastroFaltantes(aluno).length > 0 ? 'resolver' : 'cobrar',
        motivo: 'Plano trimestral/semestral próximo de nova cobrança.',
      });
    }

    const unique = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const current = unique.get(row.aluno.id);
      if (!current) {
        unique.set(row.aluno.id, row);
        continue;
      }
      if (current.status !== 'Vencido' && row.status === 'Vencido') {
        unique.set(row.aluno.id, row);
      }
    }
    return [...unique.values()];
  }, [painelOperacional]);

  const agrupadoPendenciasCobrancas = useMemo(() => {
    type PendenciaItem = (typeof pendenciasInternasCards)[number];
    type CobrancaItem = (typeof cobrancasCards)[number];
    type Bucket = { pendencias: PendenciaItem[]; cobrancas: CobrancaItem[] };

    const byAtividade = new Map<string, Map<string, Bucket>>();
    const ensureBucket = (atividade: string, modalidade: string): Bucket => {
      if (!byAtividade.has(atividade)) byAtividade.set(atividade, new Map());
      const porModalidade = byAtividade.get(atividade)!;
      if (!porModalidade.has(modalidade)) porModalidade.set(modalidade, { pendencias: [], cobrancas: [] });
      return porModalidade.get(modalidade)!;
    };

    for (const p of pendenciasInternasCards) {
      const bucket = ensureBucket(p.aluno.aba, p.aluno.modalidade);
      bucket.pendencias.push(p);
    }
    for (const c of cobrancasCards) {
      const bucket = ensureBucket(c.aluno.aba, c.aluno.modalidade);
      bucket.cobrancas.push(c);
    }

    return [...byAtividade.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
      .map(([atividade, porModalidade]) => ({
        atividade,
        modalidades: [...porModalidade.entries()]
          .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
          .map(([modalidade, bucket]) => ({
            modalidade,
            pendencias: bucket.pendencias,
            cobrancas: bucket.cobrancas,
          })),
      }));
  }, [pendenciasInternasCards, cobrancasCards]);

  const atividadesPendenciasDisponiveis = useMemo(
    () => agrupadoPendenciasCobrancas.map((x) => x.atividade),
    [agrupadoPendenciasCobrancas],
  );

  const agrupadoPendenciasCobrancasFiltrado = useMemo(() => {
    if (pendenciasAtividadeFiltro === 'todas') return agrupadoPendenciasCobrancas;
    return agrupadoPendenciasCobrancas.filter((x) => x.atividade === pendenciasAtividadeFiltro);
  }, [agrupadoPendenciasCobrancas, pendenciasAtividadeFiltro]);

  useEffect(() => {
    if (pendenciasAtividadeFiltro === 'todas') return;
    if (!atividadesPendenciasDisponiveis.includes(pendenciasAtividadeFiltro)) {
      setPendenciasAtividadeFiltro('todas');
    }
  }, [atividadesPendenciasDisponiveis, pendenciasAtividadeFiltro]);

  const alunoPorChave = useMemo(() => {
    const m = new Map<string, FluxoOperacionalAluno>();
    for (const a of alunosQuery.data?.itens ?? []) {
      m.set(normKeyFluxo(a.aba, a.modalidade, a.linha_planilha, a.aluno_nome), a);
    }
    return m;
  }, [alunosQuery.data?.itens]);

  const alunoPorId = useMemo(() => {
    const m = new Map<string, FluxoOperacionalAluno>();
    for (const a of alunosQuery.data?.itens ?? []) m.set(a.id, a);
    return m;
  }, [alunosQuery.data?.itens]);

  const pagamentosPorAlunoMesMulti = useMemo(() => {
    const map = new Map<string, FluxoOperacionalPagamento>();
    const itens = pagamentosAnoMultiQuery.data?.itens ?? [];
    for (const p of itens) {
      const aba = normalizarAbaMulti(p.aba);
      const key = `${aba}\u0000${p.modalidade}\u0000${p.linha_planilha}\u0000${p.aluno_nome.toLowerCase()}\u0000${p.ano_competencia}-${String(p.mes_competencia).padStart(2, '0')}`;
      const prev = map.get(key);
      if (!prev || prev.data_pagamento < p.data_pagamento) map.set(key, p);
    }
    return map;
  }, [pagamentosAnoMultiQuery.data?.itens]);

  const multiAgrupadoPorAba = useMemo(() => {
    const m = new Map<string, Map<string, FluxoOperacionalResumoAlunoItem[]>>();
    const itens = resumoMultiMesQuery.data?.itens ?? [];
    for (const item of itens) {
      const aba = normalizarAbaMulti(item.aba);
      if (!m.has(aba)) m.set(aba, new Map());
      const porModalidade = m.get(aba)!;
      const modalidade = item.modalidade?.trim() || 'Sem modalidade';
      if (!porModalidade.has(modalidade)) porModalidade.set(modalidade, []);
      porModalidade.get(modalidade)!.push(item);
    }
    return m;
  }, [resumoMultiMesQuery.data?.itens]);

  const multiAbasComDados = useMemo(
    () => ordenarAbasPresentes(multiAgrupadoPorAba.keys()),
    [multiAgrupadoPorAba],
  );

  useEffect(() => {
    if (modoVisao !== 'multi') return;
    if (multiAbasComDados.length === 0) return;
    if (!multiAbasComDados.includes(multiAbaAtiva)) setMultiAbaAtiva(multiAbasComDados[0]);
  }, [modoVisao, multiAbasComDados, multiAbaAtiva]);

  useEffect(() => {
    const t = window.setTimeout(() => setBuscaDebounced(busca.trim()), 280);
    return () => window.clearTimeout(t);
  }, [busca]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FLUXO_FILTROS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<{
        abaFiltro: string;
        modalidadeFiltro: string;
        ativoFiltro: 'todos' | 'ativos' | 'inativos';
        buscaEscopo: BuscaEscopo;
        ordemCampo: OrdemListaCampo;
        ordemDirecao: OrdemListaDirecao;
      }>;
      if (typeof parsed.abaFiltro === 'string') setAbaFiltro(parsed.abaFiltro);
      if (typeof parsed.modalidadeFiltro === 'string') setModalidadeFiltro(parsed.modalidadeFiltro);
      if (parsed.ativoFiltro === 'todos' || parsed.ativoFiltro === 'ativos' || parsed.ativoFiltro === 'inativos') {
        setAtivoFiltro(parsed.ativoFiltro);
      }
      if (
        parsed.buscaEscopo === 'todos' ||
        parsed.buscaEscopo === 'aluno' ||
        parsed.buscaEscopo === 'responsavel' ||
        parsed.buscaEscopo === 'pagador'
      ) {
        setBuscaEscopo(parsed.buscaEscopo);
      }
      if (
        parsed.ordemCampo === 'aluno' ||
        parsed.ordemCampo === 'data_pagamento' ||
        parsed.ordemCampo === 'valor_pago' ||
        parsed.ordemCampo === 'vencimento'
      ) {
        setOrdemCampo(parsed.ordemCampo);
      }
      if (parsed.ordemDirecao === 'asc' || parsed.ordemDirecao === 'desc') {
        setOrdemDirecao(parsed.ordemDirecao);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const payload = {
      abaFiltro,
      modalidadeFiltro,
      ativoFiltro,
      buscaEscopo,
      ordemCampo,
      ordemDirecao,
    };
    window.localStorage.setItem(FLUXO_FILTROS_STORAGE_KEY, JSON.stringify(payload));
  }, [abaFiltro, modalidadeFiltro, ativoFiltro, buscaEscopo, ordemCampo, ordemDirecao]);

  useEffect(() => {
    if (modoVisao !== 'multi') return;
    const entries = multiAgrupadoPorAba.get(multiAbaAtiva);
    if (!entries) return;
    const modalidades = [...entries.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    setMultiModalidadeAbertaPorAba((prev) => {
      const atual = prev[multiAbaAtiva];
      if (modalidades.length === 1 && atual !== modalidades[0]) {
        return { ...prev, [multiAbaAtiva]: modalidades[0] };
      }
      if (modalidades.length > 1 && atual && !modalidades.includes(atual)) {
        return { ...prev, [multiAbaAtiva]: null };
      }
      return prev;
    });
  }, [modoVisao, multiAbaAtiva, multiAgrupadoPorAba]);

  useEffect(() => {
    setResumoFiltroPeriodoModo('mes');
    setResumoPeriodoInicio('');
    setResumoPeriodoFim('');
    setResumoPeriodoCliquePendente(null);
    setResumoCalendarioAberto(false);
  }, [monthYear.mes, monthYear.ano]);

  useEffect(() => {
    if (!resumoCalendarioAberto) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (resumoCalendarioPopoverRef.current?.contains(target)) return;
      if (resumoCalendarioTriggerRef.current?.contains(target)) return;
      setResumoCalendarioAberto(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [resumoCalendarioAberto]);

  const linhasUnificadas = useMemo((): LinhaUnificadaFluxo[] => {
    const pagamentos = pagamentosQuery.data?.itens ?? [];
    const alunos = alunosQuery.data?.itens ?? [];
    const keysComPagamento = new Set(
      pagamentos.map((p) => normKeyFluxo(p.aba, p.modalidade, p.linha_planilha, p.aluno_nome)),
    );

    const comPag: LinhaUnificadaFluxo[] = pagamentos.map((pagamento) => ({
      kind: 'com_pagamento',
      aluno:
        alunoPorChave.get(
          normKeyFluxo(pagamento.aba, pagamento.modalidade, pagamento.linha_planilha, pagamento.aluno_nome),
        ) ?? null,
      pagamento,
    }));

    const semPag: LinhaUnificadaFluxo[] = alunos
      .filter((a) => !keysComPagamento.has(normKeyFluxo(a.aba, a.modalidade, a.linha_planilha, a.aluno_nome)))
      .map((aluno) => ({ kind: 'sem_pagamento_no_mes', aluno }));

    const todas = [...comPag, ...semPag];
    todas.sort((a, b) => {
      const ga = grupoOrdenacao(a);
      const gb = grupoOrdenacao(b);
      const c = ga.localeCompare(gb, 'pt-BR');
      if (c !== 0) return c;
      const da = a.kind === 'com_pagamento' ? a.pagamento.data_pagamento : '';
      const db = b.kind === 'com_pagamento' ? b.pagamento.data_pagamento : '';
      if (da === '' && db !== '') return 1;
      if (db === '' && da !== '') return -1;
      return db.localeCompare(da);
    });
    return todas;
  }, [pagamentosQuery.data?.itens, alunosQuery.data?.itens, alunoPorChave]);

  function valorTextoEscopoLinha(linha: LinhaUnificadaFluxo, escopo: BuscaEscopo): string {
    const alunoNome =
      linha.kind === 'com_pagamento' ? linha.pagamento.aluno_nome : linha.aluno.aluno_nome;
    const responsavel =
      linha.kind === 'com_pagamento'
        ? responsaveisUnificado(linha.aluno, linha.pagamento)
        : linha.aluno.responsaveis_exibicao?.trim() || linha.aluno.responsaveis?.trim() || '';
    const pagador =
      linha.kind === 'com_pagamento'
        ? pagadorUnificado(linha.aluno, linha.pagamento)
        : linha.aluno.pagador_pix_exibicao?.trim() || linha.aluno.pagador_pix?.trim() || '';

    if (escopo === 'aluno') return alunoNome;
    if (escopo === 'responsavel') return responsavel;
    if (escopo === 'pagador') return pagador;
    return `${alunoNome} ${responsavel} ${pagador}`;
  }

  const linhasParaLista = useMemo(() => {
    const term = buscaDebounced.toLowerCase();
    const pendenciasAtivo = soPendencias || filtroRapido === 'com_pendencias';
    let out = linhasUnificadas.filter((linha) => {
      if (pendenciasAtivo && !temPendenciaTrabalho(linha)) return false;
      if (filtroRapido === 'sem_pagamento_mes' && linha.kind !== 'sem_pagamento_no_mes') return false;
      if (filtroRapido === 'sem_cadastro_vinculado' && !(linha.kind === 'com_pagamento' && !linha.aluno)) return false;
      if (filtroRapido === 'so_ativos') {
        if (linha.kind === 'com_pagamento') {
          if (linha.aluno && !linha.aluno.ativo) return false;
        } else if (!linha.aluno.ativo) return false;
      }
      if (term) {
        const hay = valorTextoEscopoLinha(linha, buscaEscopo).toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });

    const direction = ordemDirecao === 'asc' ? 1 : -1;
    out = out.slice().sort((a, b) => {
      if (ordemCampo === 'aluno') {
        const av = (a.kind === 'com_pagamento' ? a.pagamento.aluno_nome : a.aluno.aluno_nome).toLowerCase();
        const bv = (b.kind === 'com_pagamento' ? b.pagamento.aluno_nome : b.aluno.aluno_nome).toLowerCase();
        return av.localeCompare(bv, 'pt-BR') * direction;
      }
      if (ordemCampo === 'data_pagamento') {
        const av = a.kind === 'com_pagamento' ? a.pagamento.data_pagamento : '';
        const bv = b.kind === 'com_pagamento' ? b.pagamento.data_pagamento : '';
        return av.localeCompare(bv) * direction;
      }
      if (ordemCampo === 'valor_pago') {
        const av = a.kind === 'com_pagamento' ? Number(a.pagamento.valor || 0) : -1;
        const bv = b.kind === 'com_pagamento' ? Number(b.pagamento.valor || 0) : -1;
        return (av - bv) * direction;
      }
      const av = textoVencCadastro(a.kind === 'com_pagamento' ? a.aluno : a.aluno, a.kind === 'com_pagamento' ? a.pagamento : undefined);
      const bv = textoVencCadastro(b.kind === 'com_pagamento' ? b.aluno : b.aluno, b.kind === 'com_pagamento' ? b.pagamento : undefined);
      return av.localeCompare(bv, 'pt-BR') * direction;
    });
    return out;
  }, [linhasUnificadas, soPendencias, filtroRapido, buscaDebounced, buscaEscopo, ordemCampo, ordemDirecao]);

  const gruposFluxo = useMemo(() => agruparLinhasFluxo(linhasParaLista), [linhasParaLista]);

  useEffect(() => {
    if (activeTopTab !== 'atividades' || modoVisao !== 'mensal') return;
    if (gruposFluxo.length === 0) return;
    setAbaDetalheAberta((atual) => {
      if (atual && gruposFluxo.some((g) => g.aba === atual)) return atual;
      return gruposFluxo[0].aba;
    });
  }, [activeTopTab, modoVisao, gruposFluxo]);

  const opcoesAbasFiltro = useMemo(() => {
    const s = new Set<string>();
    (alunosQuery.data?.filtros.abas ?? []).forEach((x) => s.add(x));
    (pagamentosQuery.data?.filtros.abas ?? []).forEach((x) => s.add(x));
    if (abaFiltro.trim()) s.add(abaFiltro.trim());
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [alunosQuery.data?.filtros.abas, pagamentosQuery.data?.filtros.abas, abaFiltro]);

  const opcoesModalidadesFiltro = useMemo(() => {
    const s = new Set<string>();
    (alunosQuery.data?.filtros.modalidades ?? []).forEach((x) => s.add(x));
    (pagamentosQuery.data?.filtros.modalidades ?? []).forEach((x) => s.add(x));
    if (modalidadeFiltro.trim()) s.add(modalidadeFiltro.trim());
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [alunosQuery.data?.filtros.modalidades, pagamentosQuery.data?.filtros.modalidades, modalidadeFiltro]);

  const abasSugestao = useMemo(() => {
    const set = new Set<string>();
    (alunosQuery.data?.filtros.abas ?? []).forEach((x) => set.add(x));
    (pagamentosQuery.data?.filtros.abas ?? []).forEach((x) => set.add(x));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [alunosQuery.data?.filtros.abas, pagamentosQuery.data?.filtros.abas]);

  const modalidadesSugestao = useMemo(() => {
    const set = new Set<string>();
    (alunosQuery.data?.filtros.modalidades ?? []).forEach((x) => set.add(x));
    (pagamentosQuery.data?.filtros.modalidades ?? []).forEach((x) => set.add(x));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [alunosQuery.data?.filtros.modalidades, pagamentosQuery.data?.filtros.modalidades]);

  const alunosAtivosVisiveis = useMemo(
    () => (alunosQuery.data?.itens ?? []).filter((a) => a.ativo),
    [alunosQuery.data?.itens]
  );

  function validarAluno(formState: FormState): string | null {
    if (!formState.aba.trim()) return 'Informe a aba.';
    if (!formState.modalidade.trim()) return 'Informe a modalidade.';
    if (!formState.alunoNome.trim()) return 'Informe o nome do aluno.';
    return null;
  }

  function validarPagamento(formState: PagamentoFormState): string | null {
    if (!formState.aba.trim()) return 'Informe a aba do pagamento.';
    if (!formState.modalidade.trim()) return 'Informe a modalidade do pagamento.';
    if (!formState.alunoNome.trim()) return 'Informe o aluno do pagamento.';
    if (!formState.dataPagamento.trim()) return 'Informe a data do pagamento.';
    const valor = parseCurrencyNumber(formState.valor);
    if (valor == null || !Number.isFinite(valor) || valor <= 0) return 'Valor do pagamento deve ser maior que zero.';
    const mesComp = Number(formState.mesCompetencia);
    if (!Number.isInteger(mesComp) || mesComp < 1 || mesComp > 12) return 'Mês de competência inválido.';
    const anoComp = Number(formState.anoCompetencia);
    if (!Number.isInteger(anoComp) || anoComp < 2000 || anoComp > 2100) return 'Ano de competência inválido.';
    return null;
  }

  useEffect(() => {
    if (!alunoModalOpen && !pagModalOpen && !cobrancaModalAluno) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (cobrancaModalAluno) {
        setCobrancaModalAluno(null);
        setCobrancaNotaDraft('');
        return;
      }
      setAlunoModalOpen(false);
      setPagModalOpen(false);
      setEditId(null);
      setPagEditId(null);
      setForm(initialForm());
      setPagForm(initialPagamentoForm(monthYear.mes, monthYear.ano));
      setAlunoModalDestacarPendencias(false);
      setAlunoUiSnapshot(null);
      setIgnorarChavesDraft([]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [alunoModalOpen, pagModalOpen, cobrancaModalAluno, monthYear.mes, monthYear.ano]);

  useEffect(() => {
    if (alunoModalOpen) {
      const t = window.setTimeout(() => alunoModalTitleRef.current?.focus(), 80);
      return () => window.clearTimeout(t);
    }
  }, [alunoModalOpen]);

  useEffect(() => {
    if (cobrancaModalAluno) {
      const t = window.setTimeout(() => cobrancaModalTitleRef.current?.focus(), 80);
      return () => window.clearTimeout(t);
    }
  }, [cobrancaModalAluno]);

  useEffect(() => {
    if (!inlineAluno) return;
    const t = window.setTimeout(() => {
      inlineInputRef.current?.focus();
      inlineInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, [inlineAluno]);

  useEffect(() => {
    if (!inlineAluno) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setInlineAluno(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inlineAluno]);

  const aplicarPreset = useCallback((preset: PresetFluxo) => {
    setAbaFiltro('');
    setModalidadeFiltro('');
    setBusca('');
    setBuscaEscopo('todos');
    setOrdemCampo('aluno');
    setOrdemDirecao('asc');
    setAtivoFiltro('ativos');
    if (preset === 'cobranca') {
      setFiltroRapido('sem_pagamento_mes');
      setSoPendencias(false);
      return;
    }
    if (preset === 'pendencias') {
      setFiltroRapido('com_pendencias');
      setSoPendencias(true);
      return;
    }
    setFiltroRapido('nenhum');
    setSoPendencias(false);
  }, []);

  const presetAtivo = useMemo((): PresetFluxo | null => {
    if (
      filtroRapido === 'sem_pagamento_mes' &&
      !soPendencias &&
      ativoFiltro === 'ativos' &&
      !abaFiltro &&
      !modalidadeFiltro &&
      !busca
    ) {
      return 'cobranca';
    }
    if ((filtroRapido === 'com_pendencias' || soPendencias) && ativoFiltro === 'ativos' && !abaFiltro && !modalidadeFiltro) {
      return 'pendencias';
    }
    if (
      filtroRapido === 'nenhum' &&
      !soPendencias &&
      ativoFiltro === 'ativos' &&
      !abaFiltro &&
      !modalidadeFiltro &&
      !busca &&
      ordemCampo === 'aluno' &&
      ordemDirecao === 'asc'
    ) {
      return 'fechamento';
    }
    return null;
  }, [filtroRapido, soPendencias, ativoFiltro, abaFiltro, modalidadeFiltro, busca, ordemCampo, ordemDirecao]);

  const filtrosAtivos = useMemo(() => {
    const chips: Array<{ id: string; label: string; onRemove?: () => void }> = [];
    if (presetAtivo) {
      const labels: Record<PresetFluxo, string> = {
        cobranca: 'Preset: Cobrança',
        pendencias: 'Preset: Pendências',
        fechamento: 'Preset: Fechamento do mês',
      };
      chips.push({ id: 'preset', label: labels[presetAtivo] });
    }
    if (abaFiltro) chips.push({ id: 'aba', label: `Aba: ${abaFiltro}`, onRemove: () => setAbaFiltro('') });
    if (modalidadeFiltro) {
      chips.push({ id: 'mod', label: `Modalidade: ${modalidadeFiltro}`, onRemove: () => setModalidadeFiltro('') });
    }
    if (ativoFiltro !== 'ativos') {
      chips.push({
        id: 'ativo',
        label: `Cadastro: ${ativoFiltro === 'inativos' ? 'Inativos' : 'Todos'}`,
        onRemove: () => setAtivoFiltro('ativos'),
      });
    }
    if (busca.trim()) chips.push({ id: 'busca', label: `Busca: ${busca.trim()}`, onRemove: () => setBusca('') });
    if (filtroRapido === 'sem_pagamento_mes' && presetAtivo !== 'cobranca') {
      chips.push({ id: 'fr', label: 'Sem pagamento no mês', onRemove: () => setFiltroRapido('nenhum') });
    }
    if ((filtroRapido === 'com_pendencias' || soPendencias) && presetAtivo !== 'pendencias') {
      chips.push({
        id: 'pend',
        label: 'Com pendências',
        onRemove: () => {
          setFiltroRapido('nenhum');
          setSoPendencias(false);
        },
      });
    }
    return chips;
  }, [presetAtivo, abaFiltro, modalidadeFiltro, ativoFiltro, busca, filtroRapido, soPendencias]);

  function limparFiltros() {
    setAbaFiltro('');
    setModalidadeFiltro('');
    setAtivoFiltro('ativos');
    setBusca('');
    setBuscaEscopo('todos');
    setFiltroRapido('nenhum');
    setOrdemCampo('aluno');
    setOrdemDirecao('asc');
    setSoPendencias(false);
    setFormaResumoSelecionada('Todas');
  }

  const resumoPeriodoLegivel = useMemo(() => {
    if (!resumoPeriodoInicio || !resumoPeriodoFim) return null;
    const { min, max } = ordenarDatasIso(resumoPeriodoInicio, resumoPeriodoFim);
    if (min === max) return formatDataBr(min);
    return `${formatDataBr(min)} — ${formatDataBr(max)}`;
  }, [resumoPeriodoInicio, resumoPeriodoFim]);

  const handleResumoDiaCalendario = useCallback((dataIso: string) => {
    setResumoPeriodoCliquePendente((pend) => {
      if (!pend) return dataIso;
      const { min, max } = ordenarDatasIso(pend, dataIso);
      setResumoPeriodoInicio(min);
      setResumoPeriodoFim(max);
      window.setTimeout(() => setResumoCalendarioAberto(false), 0);
      return null;
    });
  }, []);

  const getResumoDiaCalendarioClasse = useCallback(
    (iso: string) => {
      const base =
        'border border-transparent text-slate-800 hover:border-indigo-300 hover:bg-indigo-50/90 dark:text-slate-100 dark:hover:border-indigo-600 dark:hover:bg-indigo-950/40';
      if (resumoPeriodoCliquePendente === iso) {
        return `${base} border-indigo-500 bg-indigo-100 text-indigo-950 ring-2 ring-indigo-400 dark:border-indigo-400 dark:bg-indigo-900/70 dark:text-indigo-50`;
      }
      if (resumoPeriodoInicio && resumoPeriodoFim) {
        const { min, max } = ordenarDatasIso(resumoPeriodoInicio, resumoPeriodoFim);
        if (iso >= min && iso <= max) {
          return `${base} border-indigo-200 bg-indigo-50 text-indigo-950 dark:border-indigo-700 dark:bg-indigo-950/45 dark:text-indigo-100`;
        }
      }
      return base;
    },
    [resumoPeriodoCliquePendente, resumoPeriodoInicio, resumoPeriodoFim]
  );

  function abrirNovoPagamentoParaAluno(aluno: FluxoOperacionalAluno) {
    setPagEditId(null);
    setPagForm({
      ...initialPagamentoForm(monthYear.mes, monthYear.ano),
      aba: aluno.aba,
      modalidade: aluno.modalidade,
      linhaPlanilha: String(aluno.linha_planilha),
      alunoNome: aluno.aluno_nome,
      responsaveis: aluno.responsaveis ?? '',
      pagadorPix: aluno.pagador_pix ?? '',
    });
    setPagModalOpen(true);
  }

  function abrirPagamentoProximoMes(aluno: FluxoOperacionalAluno) {
    const proximo = new Date(monthYear.ano, monthYear.mes, 1);
    setPagEditId(null);
    setPagForm({
      ...initialPagamentoForm(proximo.getMonth() + 1, proximo.getFullYear()),
      aba: aluno.aba,
      modalidade: aluno.modalidade,
      linhaPlanilha: String(aluno.linha_planilha),
      alunoNome: aluno.aluno_nome,
      valor: aluno.valor_referencia != null ? formatBrl(aluno.valor_referencia) : '',
      responsaveis: aluno.responsaveis ?? '',
      pagadorPix: aluno.pagador_pix ?? '',
    });
    setPagModalOpen(true);
  }

  function abrirEditarCadastroMulti(item: FluxoOperacionalResumoAlunoItem) {
    const aluno = alunoPorId.get(item.id);
    if (aluno) {
      abrirEditarAluno(aluno);
      return;
    }
    setEditId(null);
    setForm({
      ...initialForm(),
      aba: item.aba,
      modalidade: item.modalidade,
      linhaPlanilha: String(item.linhaPlanilha),
      alunoNome: item.alunoNome,
      wpp: item.whatsapp ?? '',
      responsaveis: item.responsaveis ?? '',
      plano: item.plano ?? '',
      venc: item.vencimento ?? '',
      valorReferencia: item.valorReferencia != null ? formatBrl(item.valorReferencia) : '',
      pagadorPix: item.pagadorPix ?? '',
      ativo: true,
    });
    setAlunoModalDestacarPendencias(false);
    setAlunoUiSnapshot(null);
    setAlunoModalOpen(true);
  }

  function abrirPagamentoPorMesMulti(item: FluxoOperacionalResumoAlunoItem, mesItem: FluxoOperacionalResumoMesItem) {
    const key = `${normalizarAbaMulti(item.aba)}\u0000${item.modalidade}\u0000${item.linhaPlanilha}\u0000${item.alunoNome.toLowerCase()}\u0000${mesItem.key}`;
    const existente = pagamentosPorAlunoMesMulti.get(key);
    if (existente) {
      abrirEditarPagamento(existente);
      return;
    }
    const aluno = alunoPorId.get(item.id);
    if (aluno) {
      setPagEditId(null);
      setPagForm({
        ...initialPagamentoForm(mesItem.mes, mesItem.ano),
        aba: aluno.aba,
        modalidade: aluno.modalidade,
        linhaPlanilha: String(aluno.linha_planilha),
        alunoNome: aluno.aluno_nome,
        valor: aluno.valor_referencia != null ? formatBrl(aluno.valor_referencia) : '',
        responsaveis: aluno.responsaveis ?? '',
        pagadorPix: aluno.pagador_pix ?? '',
      });
      setPagModalOpen(true);
      return;
    }
    setPagEditId(null);
    setPagForm({
      ...initialPagamentoForm(mesItem.mes, mesItem.ano),
      aba: item.aba,
      modalidade: item.modalidade,
      linhaPlanilha: String(item.linhaPlanilha),
      alunoNome: item.alunoNome,
      valor: item.valorReferencia != null ? formatBrl(item.valorReferencia) : '',
      responsaveis: item.responsaveis ?? '',
      pagadorPix: item.pagadorPix ?? '',
    });
    setPagModalOpen(true);
  }

  function abrirCadastroAPartirDoPagamento(p: FluxoOperacionalPagamento) {
    setEditId(null);
    setForm({
      ...initialForm(),
      aba: p.aba,
      modalidade: p.modalidade,
      linhaPlanilha: String(p.linha_planilha),
      alunoNome: p.aluno_nome,
      responsaveis: p.responsaveis ?? p.aluno_responsaveis ?? '',
      pagadorPix: p.pagador_pix ?? p.aluno_pagador_pix ?? '',
      venc: p.aluno_venc ?? '',
      valorReferencia: p.aluno_valor_referencia != null ? formatBrl(p.aluno_valor_referencia) : '',
    });
    setAlunoModalDestacarPendencias(false);
    setAlunoUiSnapshot(null);
    setAlunoModalOpen(true);
  }

  function iniciarEdicaoInline(item: FluxoOperacionalAluno, field: 'venc' | 'valor') {
    if (alunoModalOpen || updateMut.isPending) return;
    setInlineAluno({
      id: item.id,
      field,
      value:
        field === 'venc'
          ? item.venc_exibicao?.trim() || item.venc?.trim() || ''
          : item.valor_referencia != null
            ? String(item.valor_referencia).replace('.', ',')
            : '',
    });
  }

  function commitInlineAluno() {
    if (!inlineAluno) return;
    const item = (alunosQuery.data?.itens ?? []).find((x) => x.id === inlineAluno.id);
    if (!item) {
      setInlineAluno(null);
      return;
    }
    const origVenc = item.venc_exibicao?.trim() || item.venc?.trim() || '';
    const origValorStr = item.valor_referencia != null ? String(item.valor_referencia).replace('.', ',') : '';
    if (inlineAluno.field === 'venc') {
      if (inlineAluno.value.trim() === origVenc) {
        setInlineAluno(null);
        return;
      }
      alunoUpdateSourceRef.current = 'inline';
      updateMut.mutate({
        id: item.id,
        payload: itemWithPatchToPayload(item, { venc: inlineAluno.value.trim() }),
      });
      return;
    }
    const trimmed = inlineAluno.value.trim();
    if (trimmed === origValorStr) {
      setInlineAluno(null);
      return;
    }
    alunoUpdateSourceRef.current = 'inline';
    updateMut.mutate({
      id: item.id,
      payload: itemWithPatchToPayload(item, { valorReferencia: trimmed }),
    });
  }

  function abrirNovoAluno() {
    setEditId(null);
    setForm(initialForm());
    setAlunoModalDestacarPendencias(false);
    setAlunoUiSnapshot(null);
    setIgnorarChavesDraft([]);
    setAlunoModalOpen(true);
  }

  function abrirEditarAluno(item: FluxoOperacionalAluno) {
    setAlunoModalDestacarPendencias(false);
    setEditId(item.id);
    setForm(toForm(item));
    setAlunoUiSnapshot(item);
    setIgnorarChavesDraft(item.pendencia_campos_ignorados ?? []);
    setAlunoModalOpen(true);
  }

  function abrirResolverPendencia(aluno: FluxoOperacionalAluno) {
    setAlunoModalDestacarPendencias(true);
    setEditId(aluno.id);
    setForm(toForm(aluno));
    setAlunoUiSnapshot(aluno);
    setIgnorarChavesDraft(aluno.pendencia_campos_ignorados ?? []);
    setAlunoModalOpen(true);
  }

  function fecharModalAluno() {
    setAlunoModalOpen(false);
    setEditId(null);
    setForm(initialForm());
    setAlunoModalDestacarPendencias(false);
    setAlunoUiSnapshot(null);
    setIgnorarChavesDraft([]);
  }

  function setIgnorarChaveMarcada(chave: FluxoPendenciaCampoIgnoravel, marcado: boolean) {
    setIgnorarChavesDraft((prev) => {
      const s = new Set(prev);
      if (marcado) s.add(chave);
      else s.delete(chave);
      return [...s];
    });
  }

  function fecharModalCobranca() {
    setCobrancaModalAluno(null);
    setCobrancaNotaDraft('');
  }

  function abrirModalCobranca(aluno: FluxoOperacionalAluno) {
    setCobrancaModalAluno(aluno);
    setCobrancaNotaDraft('');
  }

  function lancarPagamentoDesdeCobranca(aluno: FluxoOperacionalAluno) {
    fecharModalCobranca();
    abrirNovoPagamentoParaAluno(aluno);
  }

  function abrirCadastroDesdeCobranca(aluno: FluxoOperacionalAluno) {
    fecharModalCobranca();
    abrirEditarAluno(aluno);
  }

  function abrirNovoPagamento() {
    setPagEditId(null);
    setPagForm(initialPagamentoForm(monthYear.mes, monthYear.ano));
    setPagModalOpen(true);
  }

  function abrirEditarPagamento(item: FluxoOperacionalPagamento) {
    setPagEditId(item.id);
    setPagForm(toPagamentoForm(item));
    setPagModalOpen(true);
  }

  function fecharModalPagamento() {
    setPagModalOpen(false);
    setPagEditId(null);
    setPagForm(initialPagamentoForm(monthYear.mes, monthYear.ano));
  }

  const listagemCarregando = alunosQuery.isLoading || pagamentosQuery.isLoading;

  const alternarOrdenacaoAluno = useCallback(() => {
    if (ordemCampo === 'aluno') {
      setOrdemDirecao((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setOrdemCampo('aluno');
      setOrdemDirecao('asc');
    }
  }, [ordemCampo]);

  const thAlunoSticky =
    'sticky left-0 z-[2] bg-slate-100/95 shadow-[2px_0_6px_-2px_rgba(15,23,42,0.08)] dark:bg-slate-800/95';
  const tdAlunoSticky = 'sticky left-0 z-[1] bg-white shadow-[2px_0_6px_-2px_rgba(15,23,42,0.06)] dark:bg-slate-900';

  function renderLinhaFluxo(linha: LinhaUnificadaFluxo): ReactElement {
    const pends = pendenciasParaExibir(linha);
    const alertaPend = pends.length > 0 ? 'ring-1 ring-inset ring-rose-200/80 dark:ring-rose-800/50' : '';

    if (linha.kind === 'com_pagamento') {
      const p = linha.pagamento;
      const aluno = linha.aluno;
      const rowHighlight =
        pagModalOpen && pagEditId === p.id
          ? 'bg-emerald-50/90 dark:bg-emerald-950/40'
          : !aluno
            ? 'border-l-4 border-violet-400/90 bg-violet-50/20 dark:border-violet-500 dark:bg-violet-950/30'
            : '';
      return (
        <tr key={`p-${p.id}`} className={`${rowHighlight} ${alertaPend}`}>
          <td className={`px-3 py-2.5 font-medium text-slate-900 dark:text-slate-100 ${tdAlunoSticky}`}>{p.aluno_nome}</td>
          {mensalColunasExtras ? (
            <td
              className={`px-3 py-2.5 ${aluno ? 'cursor-pointer select-none' : ''}`}
              onDoubleClick={aluno ? () => iniciarEdicaoInline(aluno, 'venc') : undefined}
              title={aluno ? 'Duplo clique para editar vencimento (cadastro)' : undefined}
            >
              {aluno && inlineAluno?.id === aluno.id && inlineAluno.field === 'venc' ? (
                <input
                  ref={inlineInputRef}
                  className="w-full min-w-[5rem] rounded-lg border border-violet-400 bg-white px-1.5 py-0.5 text-sm dark:bg-slate-900"
                  value={inlineAluno.value}
                  onChange={(e) =>
                    setInlineAluno((prev) => (prev && prev.id === aluno.id ? { ...prev, value: e.target.value } : prev))
                  }
                  onBlur={commitInlineAluno}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitInlineAluno();
                    }
                  }}
                  aria-label="Vencimento"
                />
              ) : (
                textoVencCadastro(aluno, p)
              )}
            </td>
          ) : null}
          <td
            className={`px-3 py-2.5 whitespace-nowrap ${aluno ? 'cursor-pointer select-none' : ''}`}
            onDoubleClick={aluno ? () => iniciarEdicaoInline(aluno, 'valor') : undefined}
            title={aluno ? 'Duplo clique para editar valor de referência (cadastro)' : undefined}
          >
            {aluno && inlineAluno?.id === aluno.id && inlineAluno.field === 'valor' ? (
              <input
                ref={inlineInputRef}
                className="w-full min-w-[6rem] rounded-lg border border-violet-400 bg-white px-1.5 py-0.5 text-sm dark:bg-slate-900"
                value={inlineAluno.value}
                onChange={(e) =>
                  setInlineAluno((prev) => (prev && prev.id === aluno.id ? { ...prev, value: e.target.value } : prev))
                }
                onBlur={commitInlineAluno}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitInlineAluno();
                  }
                }}
                placeholder="ex: 150,50"
                aria-label="Valor mensal de referência"
              />
            ) : aluno ? (
              <>
                <span className="font-medium">{formatBrl(aluno.valor_mensal_exibicao ?? aluno.valor_referencia)}</span>
                {aluno.valor_mensal_origem && aluno.valor_mensal_origem !== 'cadastro' ? (
                  <span className="ml-1 cursor-help text-amber-600 dark:text-amber-400" title={legendaOrigemValor(aluno.valor_mensal_origem)}>
                    ◆
                  </span>
                ) : null}
              </>
            ) : (
              formatBrl(p.aluno_valor_referencia)
            )}
          </td>
          {mensalColunasExtras ? (
            <td className="whitespace-nowrap px-3 py-2.5 text-slate-700 dark:text-slate-300">
              {mesReferenciaLegivel(p.mes_competencia, p.ano_competencia)}
            </td>
          ) : null}
          <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-800 dark:text-slate-200">{formatDataBr(p.data_pagamento)}</td>
          <td className="whitespace-nowrap px-3 py-2.5 font-medium tabular-nums text-slate-900 dark:text-slate-50">{formatBrl(p.valor)}</td>
          {mensalColunasExtras ? (
            <>
              <td className="max-w-[90px] truncate px-3 py-2.5 text-slate-700 dark:text-slate-300" title={p.forma?.trim() || ''}>
                {p.forma?.trim() || '—'}
              </td>
              <td className="max-w-[120px] truncate px-3 py-2.5 text-slate-600 dark:text-slate-400" title={responsaveisUnificado(aluno, p)}>
                {responsaveisUnificado(aluno, p)}
              </td>
              <td className="max-w-[110px] truncate px-3 py-2.5 text-slate-600 dark:text-slate-400" title={pagadorUnificado(aluno, p)}>
                {pagadorUnificado(aluno, p)}
              </td>
              <td className="max-w-[100px] truncate px-3 py-2.5 text-slate-600 dark:text-slate-400" title={aluno?.plano?.trim() || ''}>
                {aluno?.plano?.trim() || '—'}
              </td>
            </>
          ) : null}
          <td className="max-w-[220px] px-3 py-2 align-top text-xs text-slate-600 dark:text-slate-400">
            {pends.length === 0 ? (
              <span className="font-medium text-emerald-700 dark:text-emerald-400">Ok</span>
            ) : (
              <ul className="list-inside list-disc space-y-0.5">
                {pends.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
          </td>
          <td className="px-3 py-2.5">
            <div className="flex flex-wrap gap-1">
              {!aluno ? (
                <button
                  type="button"
                  onClick={() => abrirCadastroAPartirDoPagamento(p)}
                  className="rounded-lg border border-violet-300 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-800 dark:border-violet-600 dark:bg-violet-950 dark:text-violet-200"
                >
                  Cadastro
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => abrirEditarAluno(aluno)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                >
                  Cadastro
                </button>
              )}
              <button
                type="button"
                onClick={() => abrirEditarPagamento(p)}
                className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200"
              >
                Pagamento
              </button>
              {aluno ? (
                <button
                  type="button"
                  onClick={() => abrirPagamentoProximoMes(aluno)}
                  className="rounded-lg border border-indigo-300 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200"
                >
                  Próximo mês
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setConfirm({ kind: 'pagamento', id: p.id, name: p.aluno_nome })}
                className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
              >
                Excluir
              </button>
            </div>
          </td>
          <td className="px-3 py-2.5">
            {aluno ? (
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                  aluno.ativo
                    ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-800'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {aluno.ativo ? 'Ativo' : 'Inativo'}
              </span>
            ) : (
              <span className="inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-900 dark:bg-violet-950 dark:text-violet-200">
                Sem cadastro
              </span>
            )}
          </td>
        </tr>
      );
    }

    const item = linha.aluno;
    const rowHighlight =
      alunoModalOpen && editId === item.id
        ? 'bg-amber-50/90 dark:bg-amber-950/30'
        : 'border-l-4 border-amber-400/80 bg-amber-50/25 dark:border-amber-500 dark:bg-amber-950/20';
    return (
      <tr key={`s-${item.id}`} className={`${rowHighlight} ${alertaPend}`}>
        <td className={`px-3 py-2.5 font-medium text-slate-900 dark:text-slate-100 ${tdAlunoSticky}`}>{item.aluno_nome}</td>
        {mensalColunasExtras ? (
          <td
            className="cursor-pointer select-none px-3 py-2.5"
            onDoubleClick={() => iniciarEdicaoInline(item, 'venc')}
            title="Duplo clique para editar vencimento"
          >
            {inlineAluno?.id === item.id && inlineAluno.field === 'venc' ? (
              <input
                ref={inlineInputRef}
                className="w-full min-w-[5rem] rounded-lg border border-violet-400 bg-white px-1.5 py-0.5 text-sm dark:bg-slate-900"
                value={inlineAluno.value}
                onChange={(e) =>
                  setInlineAluno((prev) => (prev && prev.id === item.id ? { ...prev, value: e.target.value } : prev))
                }
                onBlur={commitInlineAluno}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitInlineAluno();
                  }
                }}
                aria-label="Vencimento"
              />
            ) : (
              item.venc_exibicao?.trim() || item.venc?.trim() || '—'
            )}
          </td>
        ) : null}
        <td
          className="cursor-pointer select-none whitespace-nowrap px-3 py-2.5"
          onDoubleClick={() => iniciarEdicaoInline(item, 'valor')}
          title="Duplo clique para editar valor de referência"
        >
          {inlineAluno?.id === item.id && inlineAluno.field === 'valor' ? (
            <input
              ref={inlineInputRef}
              className="w-full min-w-[6rem] rounded-lg border border-violet-400 bg-white px-1.5 py-0.5 text-sm dark:bg-slate-900"
              value={inlineAluno.value}
              onChange={(e) =>
                setInlineAluno((prev) => (prev && prev.id === item.id ? { ...prev, value: e.target.value } : prev))
              }
              onBlur={commitInlineAluno}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitInlineAluno();
                }
              }}
              placeholder="ex: 150,50"
              aria-label="Valor mensal de referência"
            />
          ) : (
            <>
              <span className="font-medium">{formatBrl(item.valor_mensal_exibicao ?? item.valor_referencia)}</span>
              {item.valor_mensal_origem && item.valor_mensal_origem !== 'cadastro' ? (
                <span className="ml-1 cursor-help text-amber-600 dark:text-amber-400" title={legendaOrigemValor(item.valor_mensal_origem)}>
                  ◆
                </span>
              ) : null}
            </>
          )}
        </td>
        {mensalColunasExtras ? <td className="px-3 py-2.5 text-slate-400 dark:text-slate-500">—</td> : null}
        <td className="px-3 py-2.5 text-slate-400 dark:text-slate-500">—</td>
        <td className="px-3 py-2.5 text-slate-400 dark:text-slate-500">—</td>
        {mensalColunasExtras ? (
          <>
            <td className="px-3 py-2.5 text-slate-400 dark:text-slate-500">—</td>
            <td className="max-w-[120px] truncate px-3 py-2.5 text-slate-600 dark:text-slate-400" title={item.responsaveis_exibicao ?? item.responsaveis ?? ''}>
              {item.responsaveis_exibicao?.trim() || item.responsaveis?.trim() || '—'}
            </td>
            <td className="max-w-[110px] truncate px-3 py-2.5 text-slate-600 dark:text-slate-400" title={item.pagador_pix_exibicao ?? item.pagador_pix ?? ''}>
              {item.pagador_pix_exibicao?.trim() || item.pagador_pix?.trim() || '—'}
            </td>
            <td className="max-w-[100px] truncate px-3 py-2.5 text-slate-600 dark:text-slate-400" title={item.plano ?? ''}>
              {item.plano ?? '—'}
            </td>
          </>
        ) : null}
        <td className="max-w-[220px] px-3 py-2 align-top text-xs text-slate-600 dark:text-slate-400">
          <ul className="list-inside list-disc space-y-0.5">
            {pends.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </td>
        <td className="px-3 py-2.5">
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => abrirEditarAluno(item)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            >
              Cadastro
            </button>
            <button
              type="button"
              onClick={() => abrirNovoPagamentoParaAluno(item)}
              className="rounded-lg border border-emerald-400 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200"
            >
              + Pagamento
            </button>
            <button
              type="button"
              onClick={() => abrirPagamentoProximoMes(item)}
              className="rounded-lg border border-indigo-300 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200"
            >
              Próximo mês
            </button>
            <button
              type="button"
              onClick={() => setConfirm({ kind: 'aluno', id: item.id, name: item.aluno_nome })}
              className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
            >
              Excluir
            </button>
          </div>
        </td>
        <td className="px-3 py-2.5">
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              item.ativo
                ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-800'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {item.ativo ? 'Ativo' : 'Inativo'}
          </span>
        </td>
      </tr>
    );
  }

  const competenciaChaveAtual = `${monthYear.ano}-${String(monthYear.mes).padStart(2, '0')}`;

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-violet-50/40 pb-10 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-6">
        <header className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm shadow-slate-200/50 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/90 dark:shadow-none sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">Fluxo operacional</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">Alunos e pagamentos</h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Mês do painel: <strong>{mesReferenciaLegivel(monthYear.mes, monthYear.ano)}</strong>. Lista única: cada linha mostra o cadastro e, quando houver, o pagamento do mês (vários pagamentos no mês geram várias linhas).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to={`/relatorios-ia?tipo=alunos_inadimplencia&mes=${monthYear.mes}&ano=${monthYear.ano}`}
              className="rounded-xl border border-rose-300 bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700"
            >
              Relatório do mês
            </Link>
            <button
              type="button"
              onClick={abrirNovoAluno}
              className="rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-violet-500/25 transition hover:from-violet-700 hover:to-indigo-700 dark:shadow-violet-900/40"
            >
              + Novo aluno
            </button>
            <button
              type="button"
              onClick={abrirNovoPagamento}
              className="rounded-xl border-2 border-emerald-500/80 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
            >
              + Novo pagamento
            </button>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-200/90 bg-white/95 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/90">
          <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Seções do fluxo de caixa">
            <button
              type="button"
              role="tab"
              aria-selected={activeTopTab === 'atividades'}
              onClick={() => setActiveTopTab('atividades')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                activeTopTab === 'atividades'
                  ? 'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'border border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200'
              }`}
            >
              Atividades
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTopTab === 'resumo_meio_pagamento'}
              onClick={() => setActiveTopTab('resumo_meio_pagamento')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                activeTopTab === 'resumo_meio_pagamento'
                  ? 'bg-indigo-600 text-white'
                  : 'border border-indigo-300 text-indigo-700 dark:border-indigo-700 dark:text-indigo-300'
              }`}
            >
              Resumo por meio de pagamento
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTopTab === 'pendencias_cobrancas'}
              onClick={() => setActiveTopTab('pendencias_cobrancas')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                activeTopTab === 'pendencias_cobrancas'
                  ? 'bg-amber-600 text-white'
                  : 'border border-amber-300 text-amber-800 dark:border-amber-700 dark:text-amber-300'
              }`}
            >
              Pendências e cobranças
            </button>
          </div>
        </section>

        {activeTopTab === 'atividades' ? (
        <section className="rounded-2xl border border-slate-200/90 bg-white/95 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/90">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Modo de visualização</span>
            <button
              type="button"
              onClick={() => setModoVisao('multi')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                modoVisao === 'multi'
                  ? 'bg-indigo-600 text-white'
                  : 'border border-indigo-300 text-indigo-700 dark:border-indigo-700 dark:text-indigo-300'
              }`}
            >
              Multi-mês (2026)
            </button>
            <button
              type="button"
              onClick={() => setModoVisao('mensal')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                modoVisao === 'mensal'
                  ? 'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'border border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200'
              }`}
            >
              Mensal detalhado
            </button>
          </div>
        </section>
        ) : null}

        {activeTopTab === 'pendencias_cobrancas' ? (
          <>
            <section className="rounded-2xl border border-slate-200/90 bg-white/95 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/90">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Para que serve esta aba</h2>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                Aqui você separa o que é correção interna do sistema (pendência) do que é contato para receber pagamento (cobrança).
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                  Resolver pendência = corrigir dado/cadastro/lançamento
                </span>
                <span className="rounded-full border border-indigo-300 bg-indigo-50 px-2 py-1 text-indigo-900 dark:border-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-200">
                  Cobrar agora = entrar em contato para pagamento
                </span>
              </div>
            </section>

            <section className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-3 dark:border-amber-800/50 dark:bg-amber-950/20">
                <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">Pendências internas (corrigir no sistema)</h3>
                <p className="mt-1 text-xs text-amber-900/90 dark:text-amber-200/90">
                  Itens que travam a conferência e a baixa correta.
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900/80">
                    <p className="text-slate-500 dark:text-slate-400">Total pendências</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{painelOperacional.pendenciasGeral}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900/80">
                    <p className="text-slate-500 dark:text-slate-400">Cadastro incompleto</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{painelOperacional.cadastroPendencias.length}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900/80">
                    <p className="text-slate-500 dark:text-slate-400">Sem pagamento no mês</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{painelOperacional.pagamentoPendencias.length}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-3 dark:border-indigo-800/50 dark:bg-indigo-950/20">
                <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">Cobranças (contato com responsável/aluno)</h3>
                <p className="mt-1 text-xs text-indigo-900/90 dark:text-indigo-200/90">
                  Acompanhamento de quem precisa contato hoje, amanhã ou já está vencido.
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-4">
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900/80">
                    <p className="text-slate-500 dark:text-slate-400">Vence hoje</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{painelOperacional.cobrancaHoje.length}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900/80">
                    <p className="text-slate-500 dark:text-slate-400">Vence amanhã</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{painelOperacional.cobrancaVenceAmanha.length}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900/80">
                    <p className="text-slate-500 dark:text-slate-400">Vencidos</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{painelOperacional.cobrancaVencidos.length}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900/80">
                    <p className="text-slate-500 dark:text-slate-400">Planos próximos</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{painelOperacional.cobrancaPlanos.length}</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/80">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Atividade
                    <select
                      className="select-with-chevron mt-1 w-56 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                      value={pendenciasAtividadeFiltro}
                      onChange={(e) => setPendenciasAtividadeFiltro(e.target.value)}
                    >
                      <option value="todas">Todas as atividades</option>
                      {atividadesPendenciasDisponiveis.map((atividade) => (
                        <option key={atividade} value={atividade}>
                          {atividade}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Exibindo <strong>{agrupadoPendenciasCobrancasFiltrado.length}</strong> atividade(s) com pendências/cobranças.
                  </p>
                </div>
              </div>

              {agrupadoPendenciasCobrancasFiltrado.map((grupoAtividade) => (
                <article
                  key={`pc-atividade-${grupoAtividade.atividade}`}
                  className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/90"
                >
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Atividade: {grupoAtividade.atividade}
                  </h3>

                  <div className="mt-3 space-y-3">
                    {grupoAtividade.modalidades.map((grupoModalidade) => (
                      <div
                        key={`pc-modalidade-${grupoAtividade.atividade}-${grupoModalidade.modalidade}`}
                        className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"
                      >
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                          Modalidade: {grupoModalidade.modalidade}
                        </h4>

                        <div className="mt-2 grid gap-3 lg:grid-cols-2">
                          <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-2 dark:border-amber-800/40 dark:bg-amber-950/20">
                            <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">Pendências</p>
                            <ul className="mt-2 space-y-2 text-xs">
                              {grupoModalidade.pendencias.map((item) => (
                                <li key={`pend-${item.aluno.id}`} className="rounded-lg border border-slate-200 bg-white px-2 py-2 dark:border-slate-700 dark:bg-slate-900/70">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="font-medium text-slate-900 dark:text-slate-100">{item.aluno.aluno_nome}</span>
                                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-700">
                                      Pendência
                                    </span>
                                  </div>
                                  <div className="mt-1 flex flex-wrap gap-1.5">
                                    {item.motivos.slice(0, 3).map((motivo) => (
                                      <span
                                        key={`${item.aluno.id}-${motivo}`}
                                        className="rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                                      >
                                        {motivo}
                                      </span>
                                    ))}
                                  </div>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => abrirResolverPendencia(item.aluno)}
                                      className="rounded border border-amber-300 bg-amber-50 px-2 py-1 font-semibold text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
                                    >
                                      Resolver pendência
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => abrirModalCobranca(item.aluno)}
                                      className="rounded border border-indigo-300 bg-indigo-50 px-2 py-1 font-semibold text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200"
                                    >
                                      Cobrar agora
                                    </button>
                                  </div>
                                </li>
                              ))}
                              {grupoModalidade.pendencias.length === 0 ? (
                                <li className="text-slate-500">Sem pendências nesta modalidade.</li>
                              ) : null}
                            </ul>
                          </div>

                          <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-2 dark:border-indigo-800/40 dark:bg-indigo-950/20">
                            <p className="text-xs font-semibold text-indigo-900 dark:text-indigo-200">Cobranças</p>
                            <ul className="mt-2 space-y-2 text-xs">
                              {grupoModalidade.cobrancas.map((item) => (
                                <li key={`cob-${item.aluno.id}`} className="rounded-lg border border-slate-200 bg-white px-2 py-2 dark:border-slate-700 dark:bg-slate-900/70">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="font-medium text-slate-900 dark:text-slate-100">{item.aluno.aluno_nome}</span>
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                        item.status === 'Vencido'
                                          ? 'bg-rose-100 text-rose-900 ring-1 ring-rose-300 dark:bg-rose-950/40 dark:text-rose-200 dark:ring-rose-700'
                                          : item.status === 'Vence hoje'
                                            ? 'bg-orange-100 text-orange-900 ring-1 ring-orange-300 dark:bg-orange-950/40 dark:text-orange-200 dark:ring-orange-700'
                                            : 'bg-indigo-100 text-indigo-900 ring-1 ring-indigo-300 dark:bg-indigo-950/40 dark:text-indigo-200 dark:ring-indigo-700'
                                      }`}
                                    >
                                      {item.status}
                                    </span>
                                  </div>
                                  <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">{item.motivo}</p>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => abrirModalCobranca(item.aluno)}
                                      className="rounded border border-indigo-300 bg-indigo-50 px-2 py-1 font-semibold text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200"
                                    >
                                      Cobrar agora
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => abrirResolverPendencia(item.aluno)}
                                      className="rounded border border-amber-300 bg-amber-50 px-2 py-1 font-semibold text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
                                    >
                                      Resolver pendência
                                    </button>
                                  </div>
                                </li>
                              ))}
                              {grupoModalidade.cobrancas.length === 0 ? (
                                <li className="text-slate-500">Sem cobranças nesta modalidade.</li>
                              ) : null}
                            </ul>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
              {agrupadoPendenciasCobrancasFiltrado.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300">
                  Nenhuma pendência ou cobrança encontrada.
                </div>
              ) : null}
            </section>
          </>
        ) : null}

        {activeTopTab === 'resumo_meio_pagamento' ? (
          <section className="space-y-3 rounded-2xl border border-indigo-200/70 bg-white/95 p-4 shadow-sm dark:border-indigo-800/60 dark:bg-slate-900/90">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Resumo por meio de pagamento</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Separe por competência mensal ou período personalizado.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setResumoFiltroPeriodoModo('mes');
                    setResumoCalendarioAberto(false);
                  }}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                    resumoFiltroPeriodoModo === 'mes'
                      ? 'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'border border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200'
                  }`}
                >
                  Por mês
                </button>
                <button
                  type="button"
                  onClick={() => setResumoFiltroPeriodoModo('periodo')}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                    resumoFiltroPeriodoModo === 'periodo'
                      ? 'bg-indigo-600 text-white'
                      : 'border border-indigo-300 text-indigo-700 dark:border-indigo-700 dark:text-indigo-300'
                  }`}
                >
                  Por período
                </button>
              </div>
            </div>

            {resumoFiltroPeriodoModo === 'periodo' ? (
              <div className="relative flex flex-wrap items-center gap-2" ref={resumoCalendarioTriggerRef}>
                <button
                  type="button"
                  onClick={() => setResumoCalendarioAberto((v) => !v)}
                  className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-900 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-100"
                >
                  {resumoCalendarioAberto ? 'Fechar calendário' : 'Escolher período'}
                </button>
                {resumoPeriodoLegivel ? (
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{resumoPeriodoLegivel}</span>
                ) : (
                  <span className="text-xs text-slate-500 dark:text-slate-400">Selecione início e fim (pode cruzar mês).</span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setResumoPeriodoInicio('');
                    setResumoPeriodoFim('');
                    setResumoPeriodoCliquePendente(null);
                    setResumoCalendarioAberto(false);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                >
                  Limpar período
                </button>
                <PeriodoMesCalendarioPopover
                  mes={monthYear.mes}
                  ano={monthYear.ano}
                  aberto={resumoCalendarioAberto}
                  onFechar={() => setResumoCalendarioAberto(false)}
                  onDiaClick={handleResumoDiaCalendario}
                  getDiaClasse={getResumoDiaCalendarioClasse}
                  popoverRef={resumoCalendarioPopoverRef}
                />
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Competência atual: <strong>{mesReferenciaLegivel(monthYear.mes, monthYear.ano)}</strong>.
              </p>
            )}

            {pagamentosResumoQuery.error ? (
              <ApiErrorPanel
                message={pagamentosResumoQuery.error instanceof Error ? pagamentosResumoQuery.error.message : 'Erro ao carregar pagamentos do resumo.'}
                onRetry={() => pagamentosResumoQuery.refetch()}
              />
            ) : null}

            {pagamentosResumoQuery.isLoading ? <TableSkeleton rows={5} cols={6} /> : null}

            {!pagamentosResumoQuery.isLoading ? (
              <>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                  {resumoPagamentosPorForma.map((item) => (
                    <button
                      key={item.forma}
                      type="button"
                      onClick={() => setFormaResumoSelecionada(item.forma)}
                      className={`rounded-lg border p-2 text-left ${
                        formaResumoSelecionada === item.forma
                          ? 'border-indigo-500 bg-indigo-100/80 dark:border-indigo-500 dark:bg-indigo-950/40'
                          : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/70'
                      }`}
                    >
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{item.forma}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{formatBrl(item.total)}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{item.quantidade} pagto(s)</p>
                    </button>
                  ))}
                </div>

                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/70">
                  <table className="w-full min-w-[920px] text-xs">
                    <thead className="bg-slate-100/90 text-left font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800/90 dark:text-slate-400">
                      <tr>
                        <th className="px-3 py-2">Forma</th>
                        <th className="px-3 py-2">Data</th>
                        <th className="px-3 py-2">Aluno</th>
                        <th className="px-3 py-2">Responsável</th>
                        <th className="px-3 py-2">Pagador</th>
                        <th className="px-3 py-2">Aba / Modalidade</th>
                        <th className="px-3 py-2 text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {itensResumoFormaSelecionada.slice(0, 120).map((p) => {
                        const aluno = alunoPorChave.get(normKeyFluxo(p.aba, p.modalidade, p.linha_planilha, p.aluno_nome)) ?? null;
                        return (
                          <tr key={`resumo-forma-${p.id}`}>
                            <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{normalizarFormaPagamentoFluxo(p.forma)}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-slate-600 dark:text-slate-300">{formatDataBr(p.data_pagamento)}</td>
                            <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{p.aluno_nome}</td>
                            <td className="max-w-[160px] truncate px-3 py-2 text-slate-600 dark:text-slate-300" title={responsaveisUnificado(aluno, p)}>
                              {responsaveisUnificado(aluno, p)}
                            </td>
                            <td className="max-w-[160px] truncate px-3 py-2 text-slate-600 dark:text-slate-300" title={pagadorUnificado(aluno, p)}>
                              {pagadorUnificado(aluno, p)}
                            </td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                              {p.aba} / {p.modalidade}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                              {formatBrl(p.valor)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </section>
        ) : null}

        {activeTopTab === 'atividades' && modoVisao === 'multi' ? (
          <section className="space-y-4 rounded-2xl border border-indigo-200/70 bg-indigo-50/40 p-4 dark:border-indigo-800/60 dark:bg-indigo-950/20">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-rose-200 bg-white p-3 dark:border-rose-800 dark:bg-slate-900/80">
                <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">Pendentes no mês</p>
                <p className="mt-1 text-xl font-semibold text-rose-900 dark:text-rose-100">{resumoMultiMesQuery.data?.kpis.pendentesMesAtual ?? '—'}</p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-white p-3 dark:border-amber-800 dark:bg-slate-900/80">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Atrasados 2+ meses</p>
                <p className="mt-1 text-xl font-semibold text-amber-900 dark:text-amber-100">{resumoMultiMesQuery.data?.kpis.atrasados2Mais ?? '—'}</p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-white p-3 dark:border-emerald-800 dark:bg-slate-900/80">
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Voltaram a pagar</p>
                <p className="mt-1 text-xl font-semibold text-emerald-900 dark:text-emerald-100">{resumoMultiMesQuery.data?.kpis.voltaramAPagar ?? '—'}</p>
              </div>
            </div>

            {resumoMultiMesQuery.isLoading ? <TableSkeleton rows={4} cols={6} /> : null}
            {resumoMultiMesQuery.error ? (
              <ApiErrorPanel
                message={resumoMultiMesQuery.error instanceof Error ? resumoMultiMesQuery.error.message : 'Erro no resumo multi-mês.'}
                onRetry={() => resumoMultiMesQuery.refetch()}
              />
            ) : null}

            {resumoMultiMesQuery.data ? (
              <div className="space-y-4">
                <details className="group rounded-2xl border border-slate-200/90 bg-white/95 shadow-sm dark:border-slate-700 dark:bg-slate-900/90 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50/80 dark:text-slate-100 dark:hover:bg-slate-800/80">
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-500 transition-transform duration-200 group-open:rotate-90 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                      aria-hidden
                    >
                      ›
                    </span>
                    <span className="flex-1">Filtros rápidos e ordenação (multi-mês)</span>
                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400">abrir / fechar</span>
                  </summary>
                  <div className="space-y-3 border-t border-slate-100 px-4 pb-4 pt-3 dark:border-slate-700">
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <label className="text-xs font-medium text-slate-600">
                        Aba
                        <select
                          className="select-with-chevron mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                          value={abaFiltro}
                          onChange={(e) => setAbaFiltro(e.target.value)}
                          aria-label="Filtrar por aba no multi-mês"
                        >
                          <option value="">Todas as abas</option>
                          {opcoesAbasFiltro.map((a) => (
                            <option key={a} value={a}>
                              {a}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs font-medium text-slate-600">
                        Modalidade
                        <select
                          className="select-with-chevron mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                          value={modalidadeFiltro}
                          onChange={(e) => setModalidadeFiltro(e.target.value)}
                          aria-label="Filtrar por modalidade no multi-mês"
                        >
                          <option value="">Todas modalidades</option>
                          {opcoesModalidadesFiltro.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs font-medium text-slate-600">
                        Cadastro
                        <select
                          className="select-with-chevron mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                          value={ativoFiltro}
                          onChange={(e) => setAtivoFiltro(e.target.value as 'todos' | 'ativos' | 'inativos')}
                          aria-label="Ativos ou inativos no multi-mês"
                        >
                          <option value="ativos">Ativos</option>
                          <option value="inativos">Inativos</option>
                          <option value="todos">Todos</option>
                        </select>
                      </label>
                      <label className="text-xs font-medium text-slate-600">
                        Busca
                        <input
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                          placeholder="Aluno, responsável, pagador…"
                          value={busca}
                          onChange={(e) => setBusca(e.target.value)}
                          aria-label="Buscar no multi-mês"
                        />
                      </label>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Filtros rápidos</span>
                      <button
                        type="button"
                        onClick={() => {
                          setFiltroRapido('sem_pagamento_mes');
                          setSoPendencias(false);
                        }}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          filtroRapido === 'sem_pagamento_mes'
                            ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-300'
                            : 'border border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200'
                        }`}
                      >
                        Sem pagamento no mês
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFiltroRapido('com_pendencias');
                          setSoPendencias(true);
                        }}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          filtroRapido === 'com_pendencias' || soPendencias
                            ? 'bg-rose-100 text-rose-900 ring-1 ring-rose-300'
                            : 'border border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200'
                        }`}
                      >
                        Com pendências
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFiltroRapido('so_ativos');
                          setAtivoFiltro('ativos');
                          setSoPendencias(false);
                        }}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          filtroRapido === 'so_ativos'
                            ? 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300'
                            : 'border border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200'
                        }`}
                      >
                        Só ativos
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFiltroRapido('nenhum');
                          setSoPendencias(false);
                        }}
                        className="rounded-full border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-slate-600 dark:text-slate-300"
                      >
                        Limpar rápidos
                      </button>
                    </div>
                    <div className="mt-2 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-2 dark:border-slate-700">
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                        Ordenar por
                        <select
                          className="select-with-chevron mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                          value={ordemCampo}
                          onChange={(e) => setOrdemCampo(e.target.value as OrdemListaCampo)}
                          aria-label="Ordenar lista multi-mês por"
                        >
                          <option value="aluno">Aluno</option>
                          <option value="data_pagamento">Data pagamento</option>
                          <option value="valor_pago">Valor pago</option>
                          <option value="vencimento">Vencimento</option>
                        </select>
                      </label>
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                        Direção
                        <select
                          className="select-with-chevron mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                          value={ordemDirecao}
                          onChange={(e) => setOrdemDirecao(e.target.value as OrdemListaDirecao)}
                          aria-label="Direção da ordenação multi-mês"
                        >
                          <option value="asc">Crescente (A→Z)</option>
                          <option value="desc">Decrescente (Z→A)</option>
                        </select>
                      </label>
                    </div>
                  </div>
                </details>

                <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/80">
                  <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Atividades (separadas por aba)</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    {multiAbasComDados.map((aba) => {
                      const chrome = getFluxoAbaTabStyle(aba);
                      const ativo = multiAbaAtiva === aba;
                      const modalidadesDaAba = multiAgrupadoPorAba.get(aba)
                        ? [...multiAgrupadoPorAba.get(aba)!.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'))
                        : [];
                      return (
                        <button
                          key={aba}
                          type="button"
                          onClick={() => {
                            setMultiAbaAtiva(aba);
                            setMultiModalidadeAbertaPorAba((prev) => ({
                              ...prev,
                              [aba]: modalidadesDaAba.length === 1 ? modalidadesDaAba[0] : prev[aba] ?? null,
                            }));
                          }}
                          className="rounded-lg border-2 px-3 py-2 text-xs font-semibold shadow-sm transition"
                          style={{
                            borderColor: chrome.tab,
                            backgroundColor: ativo ? chrome.soft : 'transparent',
                            color: ativo ? '#0f172a' : chrome.tab,
                          }}
                        >
                          {aba}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {(multiAgrupadoPorAba.get(multiAbaAtiva) ? [...multiAgrupadoPorAba.get(multiAbaAtiva)!.entries()] : [])
                  .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
                  .map(([modalidade, itens]) => {
                    const chrome = getFluxoModalidadeTabStyle(multiAbaAtiva, modalidade);
                    const modalidadeAberta = multiModalidadeAbertaPorAba[multiAbaAtiva];
                    const itensExibicao = itens
                      .filter((item) => {
                        if (abaFiltro && normalizarAbaMulti(item.aba) !== normalizarAbaMulti(abaFiltro)) return false;
                        if (modalidadeFiltro && item.modalidade !== modalidadeFiltro) return false;
                        const alunoCadastro = alunoPorId.get(item.id);
                        const ativo = alunoCadastro?.ativo ?? true;
                        if (ativoFiltro === 'ativos' && !ativo) return false;
                        if (ativoFiltro === 'inativos' && ativo) return false;

                        const mesAtual = item.historico.find((h) => h.key === competenciaChaveAtual);
                        if (filtroRapido === 'sem_pagamento_mes' && mesAtual?.status === 'pago') return false;
                        if (filtroRapido === 'com_pendencias' && mesAtual?.status !== 'pendente' && mesAtual?.status !== 'parcial') return false;
                        if (filtroRapido === 'so_ativos' && !ativo) return false;

                        if (!buscaDebounced) return true;
                        const q = buscaDebounced.toLowerCase();
                        const aluno = item.alunoNome.toLowerCase();
                        const responsavel = (item.responsaveis ?? '').toLowerCase();
                        const pagador = (item.pagadorPix ?? '').toLowerCase();
                        if (buscaEscopo === 'aluno') return aluno.includes(q);
                        if (buscaEscopo === 'responsavel') return responsavel.includes(q);
                        if (buscaEscopo === 'pagador') return pagador.includes(q);
                        return aluno.includes(q) || responsavel.includes(q) || pagador.includes(q);
                      })
                      .sort((a, b) => {
                        const direction = ordemDirecao === 'asc' ? 1 : -1;
                        if (ordemCampo === 'aluno') {
                          return a.alunoNome.localeCompare(b.alunoNome, 'pt-BR') * direction;
                        }
                        const ma = a.historico.find((h) => h.key === competenciaChaveAtual);
                        const mb = b.historico.find((h) => h.key === competenciaChaveAtual);
                        if (ordemCampo === 'valor_pago') {
                          return ((ma?.valorPago ?? 0) - (mb?.valorPago ?? 0)) * direction;
                        }
                        if (ordemCampo === 'data_pagamento') {
                          return ((ma?.dataPagamento ?? '').localeCompare(mb?.dataPagamento ?? '')) * direction;
                        }
                        return (a.vencimento ?? '').localeCompare(b.vencimento ?? '') * direction;
                      });
                    return (
                      <details
                        key={`${multiAbaAtiva}\u0000${modalidade}`}
                        open={modalidadeAberta === modalidade}
                        onToggle={(e) => {
                          const opened = (e.currentTarget as HTMLDetailsElement).open;
                          setMultiModalidadeAbertaPorAba((prev) => ({
                            ...prev,
                            [multiAbaAtiva]: opened ? modalidade : null,
                          }));
                        }}
                        className="group rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/80"
                        style={{ borderLeftWidth: '5px', borderLeftColor: chrome.tab }}
                      >
                        <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                          Modalidade: <span style={{ color: chrome.tab }}>{modalidade}</span> · {itensExibicao.length} aluno(s)
                        </summary>
                        <div className="overflow-x-auto border-t border-slate-100 p-3 dark:border-slate-700">
                          <table className="w-full min-w-[2200px] text-xs">
                            <thead className="bg-slate-100 text-left font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                              <tr>
                                <th className={`px-2 py-2 ${thAlunoSticky}`}>
                                  <button
                                    type="button"
                                    onClick={alternarOrdenacaoAluno}
                                    className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-slate-200/80 dark:hover:bg-slate-700"
                                    aria-label={
                                      ordemCampo === 'aluno'
                                        ? `Ordenar alunos ${ordemDirecao === 'asc' ? 'decrescente' : 'crescente'}`
                                        : 'Ordenar por aluno A→Z'
                                    }
                                  >
                                    Aluno
                                    {ordemCampo === 'aluno' ? (
                                      <span className="text-[10px] text-violet-700 dark:text-violet-300" aria-hidden>
                                        {ordemDirecao === 'asc' ? '▲' : '▼'}
                                      </span>
                                    ) : null}
                                  </button>
                                </th>
                                <th className="px-2 py-2">Vencimento</th>
                                <th className="px-2 py-2">Valor ref.</th>
                                <th className="px-2 py-2">Responsável</th>
                                <th className="px-2 py-2">Pagador</th>
                                <th className="px-2 py-2">Plano</th>
                                <th className="px-2 py-2">WhatsApp</th>
                                <th className="px-2 py-2">Ação</th>
                                <th className="px-2 py-2 text-center">Ano</th>
                                {resumoMultiMesQuery.data.meses.map((m) => (
                                  <th key={`${modalidade}-${m.ano}-${m.mes}`} className="px-2 py-2 text-center">
                                    {mesAnoCurto(m.mes, m.ano)}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {itensExibicao.map((item) => (
                                <tr key={`linha-${item.id}`}>
                                  <td className="px-2 py-2 font-medium text-slate-900 dark:text-slate-100">{item.alunoNome}</td>
                                  <td className="px-2 py-2 text-slate-600 dark:text-slate-300">{item.vencimento || '—'}</td>
                                  <td className="px-2 py-2 text-slate-600 dark:text-slate-300">{formatBrl(item.valorReferencia)}</td>
                                  <td className="px-2 py-2 text-slate-600 dark:text-slate-300">{item.responsaveis || '—'}</td>
                                  <td className="px-2 py-2 text-slate-600 dark:text-slate-300">{item.pagadorPix || '—'}</td>
                                  <td className="px-2 py-2 text-slate-600 dark:text-slate-300">{item.plano || '—'}</td>
                                  <td className="px-2 py-2 text-slate-600 dark:text-slate-300">{item.whatsapp || '—'}</td>
                                  <td className="px-2 py-2">
                                    <div className="flex flex-col gap-1">
                                      <button
                                        type="button"
                                        onClick={() => abrirEditarCadastroMulti(item)}
                                        className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                                      >
                                        Editar cadastro
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const aluno = alunoPorId.get(item.id);
                                          if (aluno) abrirPagamentoProximoMes(aluno);
                                        }}
                                        className="rounded border border-indigo-300 bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200"
                                      >
                                        Próximo mês
                                      </button>
                                    </div>
                                  </td>
                                  <td className="px-2 py-2 text-center font-semibold text-slate-700 dark:text-slate-200">2026</td>
                                  {item.historico.map((mesItem) => (
                                    <td key={`${item.id}-${mesItem.key}`} className="px-2 py-2 align-top">
                                      <div className={`min-w-[145px] rounded-md p-2 ${statusMesClasse(mesItem.status)}`}>
                                        <div className="font-semibold">{statusMesLabel(mesItem.status)}</div>
                                        <div className="mt-1">Data: {mesItem.dataPagamento ? formatDataBr(mesItem.dataPagamento) : '—'}</div>
                                        <div>Forma: {mesItem.formaPagamento || '—'}</div>
                                        <div>Valor: {mesItem.valorPago > 0 ? formatBrl(mesItem.valorPago) : '—'}</div>
                                        <button
                                          type="button"
                                          onClick={() => abrirPagamentoPorMesMulti(item, mesItem)}
                                          className="mt-2 rounded border border-slate-400/60 bg-white/80 px-2 py-1 text-[11px] font-semibold text-slate-800 dark:border-slate-500 dark:bg-slate-900/60 dark:text-slate-200"
                                        >
                                          {mesItem.valorPago > 0 ? 'Editar mês' : 'Lançar mês'}
                                        </button>
                                      </div>
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    );
                  })}

                <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/80">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Prioridade de cobrança</h3>
                  <ul className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {resumoMultiMesQuery.data.prioridade.slice(0, 9).map((p) => (
                      <li key={`${p.id}-${p.mesesEmAberto}`} className="rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-700">
                        <p className="font-medium text-slate-800 dark:text-slate-100">{p.alunoNome}</p>
                        <p className="text-slate-500 dark:text-slate-400">{p.modalidade} — {p.mesesEmAberto} mês(es) em aberto</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {activeTopTab === 'atividades' && modoVisao === 'mensal' ? (
        <>
        <FilterBar
          title="Filtros da lista"
          subtitle={`${mesReferenciaLegivel(monthYear.mes, monthYear.ano)} · 1 clique no preset aplica os filtros`}
          chips={filtrosAtivos}
          onClear={limparFiltros}
        >
          <PresetsFluxoBar presetAtivo={presetAtivo} onPreset={aplicarPreset} />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Busca
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                placeholder="Aluno, responsável, pagador…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                aria-label="Buscar na lista"
              />
            </label>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Ordenar por
              <select
                className="select-with-chevron mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                value={ordemCampo}
                onChange={(e) => setOrdemCampo(e.target.value as OrdemListaCampo)}
                aria-label="Ordenar lista por"
              >
                <option value="aluno">Aluno</option>
                <option value="data_pagamento">Data pagamento</option>
                <option value="valor_pago">Valor pago</option>
                <option value="vencimento">Vencimento</option>
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Direção
              <select
                className="select-with-chevron mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                value={ordemDirecao}
                onChange={(e) => setOrdemDirecao(e.target.value as OrdemListaDirecao)}
                aria-label="Direção da ordenação"
              >
                <option value="asc">Crescente (A→Z)</option>
                <option value="desc">Decrescente (Z→A)</option>
              </select>
            </label>
            <label className="flex cursor-pointer items-end gap-2 pb-2 text-xs font-medium text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={mensalColunasExtras}
                onChange={(e) => setMensalColunasExtras(e.target.checked)}
                className="rounded border-slate-300"
              />
              Mais colunas
            </label>
          </div>
        </FilterBar>

        <section ref={listaMesRef} className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
          <div className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 px-4 py-2 text-xs text-slate-700 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200">
            Aba: <strong>{abaFiltro || 'Todas'}</strong> · Modalidade: <strong>{modalidadeFiltro || 'Todas'}</strong> · Linhas:{' '}
            <strong>{linhasParaLista.length}</strong>
            {buscaDebounced ? (
              <>
                {' '}
                · Busca: <strong>{buscaDebounced}</strong>
              </>
            ) : null}
          </div>
          <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-700">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Lista do mês</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {mesReferenciaLegivel(monthYear.mes, monthYear.ano)} · Alunos: <strong>{totalVisivel}</strong> · Ativos:{' '}
              <strong>{totalAtivos}</strong> · Pagamentos: <strong>{totalPagamentosMes}</strong> · Linhas:{' '}
              <strong>{linhasParaLista.length}</strong>
            </p>
            <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              Modo compacto padrão: Aluno, valor e pagamento visíveis em 1366px. Use os presets acima ou{' '}
              <a href="#fluxo-filtros-avancados-mensal" className="font-semibold text-violet-700 hover:underline dark:text-violet-300">
                filtros avançados
              </a>
              . Borda âmbar = sem pagamento · violeta = sem cadastro.
            </p>
          </div>

          <div className="space-y-3 p-4">
            {alunosQuery.error && (
              <ApiErrorPanel
                message={alunosQuery.error instanceof Error ? alunosQuery.error.message : 'Erro ao carregar alunos.'}
                onRetry={() => alunosQuery.refetch()}
              />
            )}
            {pagamentosQuery.error && (
              <ApiErrorPanel
                message={pagamentosQuery.error instanceof Error ? pagamentosQuery.error.message : 'Erro ao carregar pagamentos.'}
                onRetry={() => pagamentosQuery.refetch()}
              />
            )}

            {listagemCarregando && <TableSkeleton rows={6} cols={8} />}

            {!listagemCarregando && linhasParaLista.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
                Nenhuma linha para os filtros atuais. Ajuste o mês no painel, abra <strong>Filtros</strong> ou cadastre aluno / pagamento.
              </div>
            )}

            {!listagemCarregando && linhasParaLista.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs text-slate-500 dark:text-slate-400 md:hidden">Deslize horizontalmente em cada tabela.</p>
                {gruposFluxo.map((grupoAba) => {
                  const chromeAba = getFluxoAbaTabStyle(grupoAba.aba);
                  const todasLinhasAba = grupoAba.modalidades.flatMap((m) => m.linhas);
                  const nAlunosAba = contarAlunosUnicos(todasLinhasAba);
                  const nMods = grupoAba.modalidades.length;
                  const modalidadeAuto = nMods === 1 ? grupoAba.modalidades[0].modalidade : null;
                  const modalidadeAberta = modalidadesAbertasPorAba[grupoAba.aba] ?? modalidadeAuto;
                  return (
                  <details
                    key={grupoAba.aba}
                    open={abaDetalheAberta === grupoAba.aba}
                    onToggle={(e) => {
                      const opened = (e.currentTarget as HTMLDetailsElement).open;
                      if (opened) {
                        setAbaDetalheAberta(grupoAba.aba);
                        if (nMods === 1) {
                          setModalidadesAbertasPorAba((prev) => ({ ...prev, [grupoAba.aba]: modalidadeAuto }));
                        }
                      } else if (abaDetalheAberta === grupoAba.aba) {
                        setAbaDetalheAberta(null);
                      }
                    }}
                    className="group rounded-2xl border border-slate-200/90 border-l-[6px] bg-white/90 shadow-sm open:shadow-md dark:border-slate-700 dark:bg-slate-900/80 [&_summary::-webkit-details-marker]:hidden"
                    style={{ borderLeftColor: chromeAba.tab }}
                  >
                    <summary className="flex cursor-pointer list-none items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50/80 dark:text-slate-100 dark:hover:bg-slate-800/80">
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-500 transition-transform duration-200 group-open:rotate-90 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                        aria-hidden
                      >
                        ›
                      </span>
                      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                        <span
                          className="inline-flex h-2.5 w-2.5 shrink-0 rounded-sm"
                          style={{ backgroundColor: chromeAba.tab }}
                          aria-hidden
                        />
                        <span className="truncate">
                          Aba: <span style={{ color: chromeAba.tab }}>{grupoAba.aba}</span>
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-normal text-slate-500 dark:text-slate-400">
                        <strong className="font-semibold text-slate-700 dark:text-slate-200">{nAlunosAba}</strong> aluno(s) ·{' '}
                        <strong className="font-semibold text-slate-700 dark:text-slate-200">{nMods}</strong> modalidade(s)
                      </span>
                    </summary>
                    <div className="space-y-2 border-t border-slate-100 px-2 pb-3 pt-2 dark:border-slate-700 sm:px-3">
                      {grupoAba.modalidades.map((grupoMod) => {
                        const chromeMod = getFluxoModalidadeTabStyle(grupoAba.aba, grupoMod.modalidade);
                        const nAlunosMod = contarAlunosUnicos(grupoMod.linhas);
                        return (
                        <details
                          key={`${grupoAba.aba}\0${grupoMod.modalidade}`}
                          open={modalidadeAberta === grupoMod.modalidade}
                          onToggle={(e) => {
                            const opened = (e.currentTarget as HTMLDetailsElement).open;
                            setModalidadesAbertasPorAba((prev) => ({
                              ...prev,
                              [grupoAba.aba]: opened ? grupoMod.modalidade : null,
                            }));
                          }}
                          className="group/mod rounded-xl border border-slate-100 border-l-[5px] bg-slate-50/50 dark:border-slate-700 dark:bg-slate-950/40 [&_summary::-webkit-details-marker]:hidden"
                          style={{ borderLeftColor: chromeMod.tab }}
                        >
                          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-white/80 dark:text-slate-200 dark:hover:bg-slate-800/60">
                            <span
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-slate-200 bg-white text-xs text-slate-500 transition-transform duration-200 group-open/mod:rotate-90 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                              aria-hidden
                            >
                              ›
                            </span>
                            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                              <span
                                className="inline-flex h-2 w-2 shrink-0 rounded-sm"
                                style={{ backgroundColor: chromeMod.tab }}
                                aria-hidden
                              />
                              <span className="truncate">
                                Modalidade: <span style={{ color: chromeMod.tab }}>{grupoMod.modalidade}</span>
                              </span>
                            </span>
                            <span className="shrink-0 font-normal text-slate-500 dark:text-slate-400">
                              <strong className="font-semibold text-slate-700 dark:text-slate-200">{nAlunosMod}</strong> aluno(s)
                            </span>
                          </summary>
                          <div className="overflow-x-auto px-1 pb-2">
                            <table className={`w-full text-sm ${mensalColunasExtras ? 'min-w-[980px]' : 'min-w-0'}`}>
                              <thead className="bg-slate-100/95 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800/95 dark:text-slate-400">
                                <tr>
                                  <th className={`px-3 py-2 ${thAlunoSticky}`}>
                                    <button
                                      type="button"
                                      onClick={alternarOrdenacaoAluno}
                                      className="inline-flex items-center gap-1 hover:text-indigo-700 dark:hover:text-indigo-300"
                                      title={
                                        ordemCampo === 'aluno'
                                          ? `Ordenar alunos ${ordemDirecao === 'asc' ? 'decrescente' : 'crescente'}`
                                          : 'Ordenar por aluno'
                                      }
                                    >
                                      Aluno
                                      {ordemCampo === 'aluno' ? (
                                        <span className="text-indigo-600 dark:text-indigo-400">
                                          {ordemDirecao === 'asc' ? '▲' : '▼'}
                                        </span>
                                      ) : null}
                                    </button>
                                  </th>
                                  {mensalColunasExtras ? <th className="px-3 py-2">Venc. (cad.)</th> : null}
                                  <th className="px-3 py-2">Valor ref.</th>
                                  {mensalColunasExtras ? <th className="px-3 py-2">Competência</th> : null}
                                  <th className="px-3 py-2">Data pagto.</th>
                                  <th className="px-3 py-2">Valor pago</th>
                                  {mensalColunasExtras ? (
                                    <>
                                      <th className="px-3 py-2">Forma</th>
                                      <th className="px-3 py-2">Resp.</th>
                                      <th className="px-3 py-2">Pagador</th>
                                      <th className="px-3 py-2">Plano</th>
                                    </>
                                  ) : null}
                                  <th className="px-3 py-2">Pendências</th>
                                  <th className="px-3 py-2">Ações</th>
                                  <th className="px-3 py-2">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                                {grupoMod.linhas.map((linha) => renderLinhaFluxo(linha))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                        );
                      })}
                    </div>
                  </details>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <details
          id="fluxo-filtros-avancados-mensal"
          className="group rounded-xl border border-slate-200/80 bg-white/90 shadow-sm dark:border-slate-700 dark:bg-slate-900/90 [&_summary::-webkit-details-marker]:hidden"
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50/80 dark:text-slate-200 dark:hover:bg-slate-800/80">
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-50 text-xs text-slate-500 transition-transform duration-200 group-open:rotate-90 dark:border-slate-600 dark:bg-slate-800"
              aria-hidden
            >
              ›
            </span>
            <span className="flex-1">Filtros avançados e ordenação</span>
            <span className="text-xs font-normal text-slate-500">opcional</span>
          </summary>
          <div className="space-y-3 border-t border-slate-100 px-4 pb-4 pt-3 dark:border-slate-700">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Aba
                <select
                  className="select-with-chevron mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  value={abaFiltro}
                  onChange={(e) => setAbaFiltro(e.target.value)}
                  aria-label="Filtrar por aba"
                >
                  <option value="">Todas as abas</option>
                  {opcoesAbasFiltro.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Modalidade
                <select
                  className="select-with-chevron mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  value={modalidadeFiltro}
                  onChange={(e) => setModalidadeFiltro(e.target.value)}
                  aria-label="Filtrar por modalidade"
                >
                  <option value="">Todas modalidades</option>
                  {opcoesModalidadesFiltro.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Cadastro
                <select
                  className="select-with-chevron mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  value={ativoFiltro}
                  onChange={(e) => setAtivoFiltro(e.target.value as 'todos' | 'ativos' | 'inativos')}
                  aria-label="Ativos ou inativos"
                >
                  <option value="ativos">Ativos</option>
                  <option value="inativos">Inativos</option>
                  <option value="todos">Todos</option>
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Escopo da busca
                <select
                  className="select-with-chevron mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  value={buscaEscopo}
                  onChange={(e) => setBuscaEscopo(e.target.value as BuscaEscopo)}
                  aria-label="Escopo da busca"
                >
                  <option value="todos">Todos</option>
                  <option value="aluno">Aluno</option>
                  <option value="responsavel">Responsável</option>
                  <option value="pagador">Pagador</option>
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Ordenar por
                <select
                  className="select-with-chevron mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  value={ordemCampo}
                  onChange={(e) => setOrdemCampo(e.target.value as OrdemListaCampo)}
                  aria-label="Ordenar lista por"
                >
                  <option value="aluno">Aluno</option>
                  <option value="data_pagamento">Data pagamento</option>
                  <option value="valor_pago">Valor pago</option>
                  <option value="vencimento">Vencimento</option>
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Direção
                <select
                  className="select-with-chevron mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  value={ordemDirecao}
                  onChange={(e) => setOrdemDirecao(e.target.value as OrdemListaDirecao)}
                  aria-label="Direção da ordenação"
                >
                  <option value="asc">Crescente</option>
                  <option value="desc">Decrescente</option>
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(abaFiltro || modalidadeFiltro || ativoFiltro !== 'ativos' || busca) && (
                <button type="button" onClick={limparFiltros} className="text-xs font-semibold text-violet-700 hover:underline dark:text-violet-300">
                  Limpar todos os filtros
                </button>
              )}
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={soPendencias} onChange={(e) => setSoPendencias(e.target.checked)} className="rounded border-slate-300" />
              Mostrar apenas linhas com pendência
            </label>
          </div>
        </details>
        </>
        ) : null}

        <details
          className="group rounded-2xl border border-slate-200/90 bg-white/95 shadow-sm dark:border-slate-700 dark:bg-slate-900/90 [&_summary::-webkit-details-marker]:hidden"
          onToggle={(e) => setHistoricoAberto((e.target as HTMLDetailsElement).open)}
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50/80 dark:text-slate-100 dark:hover:bg-slate-800/80">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-500 transition-transform duration-200 group-open:rotate-90 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
              aria-hidden
            >
              ›
            </span>
            <span className="flex-1">Histórico recente</span>
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">carrega ao expandir</span>
          </summary>
          <div className="space-y-3 border-t border-slate-100 px-4 pb-4 pt-3 dark:border-slate-700">
            {historicoAberto && auditoriaQuery.isLoading && <div className="text-sm text-slate-500">Carregando histórico...</div>}
            {auditoriaQuery.error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {auditoriaQuery.error instanceof Error ? auditoriaQuery.error.message : 'Erro ao carregar histórico.'}
              </div>
            )}
            {historicoAberto && (auditoriaQuery.data?.itens.length ?? 0) === 0 && !auditoriaQuery.isLoading && !auditoriaQuery.error && (
              <p className="text-sm text-slate-500">Nenhum evento recente.</p>
            )}
            {(auditoriaQuery.data?.itens.length ?? 0) > 0 && (
              <div className="overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100/90 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Quando</th>
                      <th className="px-3 py-2">Entidade</th>
                      <th className="px-3 py-2">Ação</th>
                      <th className="px-3 py-2">Aluno</th>
                      <th className="px-3 py-2">Aba / Modalidade</th>
                      <th className="px-3 py-2">Usuário</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(auditoriaQuery.data?.itens ?? []).map((ev) => (
                      <tr key={ev.id} className="bg-white">
                        <td className="px-3 py-2 text-slate-700">{new Date(ev.created_at).toLocaleString('pt-BR')}</td>
                        <td className="px-3 py-2">{ev.entidade}</td>
                        <td className="px-3 py-2">{ev.acao}</td>
                        <td className="px-3 py-2">{ev.aluno_nome ?? '—'}</td>
                        <td className="px-3 py-2">{[ev.aba, ev.modalidade].filter(Boolean).join(' / ') || '—'}</td>
                        <td className="px-3 py-2">{ev.user_email ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </details>
      </div>

      {alunoModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
          role="presentation"
          onClick={fecharModalAluno}
        >
          <div
            className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fluxo-aluno-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="fluxo-aluno-modal-title"
              ref={alunoModalTitleRef}
              tabIndex={-1}
              className="text-base font-semibold text-slate-900 outline-none"
            >
              {editId ? `Editar: ${form.alunoNome || '…'}` : 'Novo aluno'}
            </h2>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              {editId
                ? `Aba ${form.aba || '—'} · modalidade ${form.modalidade || '—'}. Os dados aparecem aqui no centro para não precisar rolar a página.`
                : 'Preencha como na planilha. Campo “Valor referência” grava o valor oficial no cadastro.'}
            </p>
            {alunoModalDestacarPendencias && editId ? (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-100">
                <span className="font-semibold">Pendências no cadastro: </span>
                campos com asterisco (*) ainda entram como pendência no Fluxo. Preencha os dados e use{' '}
                <strong>Ignorar</strong> ao lado do campo quando não se aplicar — as caixas só passam a valer após{' '}
                <strong>Salvar alterações</strong>.
              </div>
            ) : null}
            {editId && !alunoModalDestacarPendencias ? (
              <p className="mb-3 text-[11px] text-slate-500 dark:text-slate-400">
                Marque <strong>Ignorar</strong> ao lado de um dado que não deve gerar pendência para este aluno e salve o
                cadastro.
              </p>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
              <label className="text-xs text-slate-600">
                Aba
                <select
                  className="select-with-chevron mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  value={form.aba}
                  onChange={(e) => setForm((p) => ({ ...p, aba: e.target.value }))}
                >
                  <option value="">Selecionar</option>
                  {opcoesAbasFiltro.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                  {form.aba && !opcoesAbasFiltro.includes(form.aba) ? <option value={form.aba}>{form.aba}</option> : null}
                </select>
              </label>
              <label className="text-xs text-slate-600">
                Modalidade
                <select
                  className="select-with-chevron mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  value={form.modalidade}
                  onChange={(e) => setForm((p) => ({ ...p, modalidade: e.target.value }))}
                >
                  <option value="">Selecionar</option>
                  {opcoesModalidadesFiltro.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                  {form.modalidade && !opcoesModalidadesFiltro.includes(form.modalidade) ? (
                    <option value={form.modalidade}>{form.modalidade}</option>
                  ) : null}
                </select>
              </label>
              <label className="text-xs text-slate-600 sm:col-span-2">
                Nome do aluno
                <input
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  value={form.alunoNome}
                  onChange={(e) => setForm((p) => ({ ...p, alunoNome: e.target.value }))}
                />
              </label>
              <div className="text-xs text-slate-600">
                <div className="mb-0.5 flex items-center justify-between gap-2">
                  <label htmlFor="fluxo-aluno-wpp" className="text-slate-600 dark:text-slate-300">
                    {rotuloComAsteriscoPendencia(
                      'WhatsApp',
                      alunoModalDestacarPendencias && rotulosPendenciaNoModalCadastro.has('wpp'),
                    )}
                  </label>
                  {editId ? (
                    <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] font-normal text-slate-600 dark:text-slate-400">
                      <input
                        type="checkbox"
                        checked={ignorarChavesDraft.includes('wpp')}
                        onChange={(e) => setIgnorarChaveMarcada('wpp', e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-slate-400 text-indigo-600 focus:ring-indigo-500"
                      />
                      Ignorar
                    </label>
                  ) : null}
                </div>
                <input
                  id="fluxo-aluno-wpp"
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                  value={form.wpp}
                  onChange={(e) => setForm((p) => ({ ...p, wpp: e.target.value }))}
                  aria-invalid={alunoModalDestacarPendencias && rotulosPendenciaNoModalCadastro.has('wpp')}
                />
              </div>
              <div className="text-xs text-slate-600 sm:col-span-2">
                <div className="mb-0.5 flex items-center justify-between gap-2">
                  <label htmlFor="fluxo-aluno-resp" className="text-slate-600 dark:text-slate-300">
                    {rotuloComAsteriscoPendencia(
                      'Responsáveis',
                      alunoModalDestacarPendencias && rotulosPendenciaNoModalCadastro.has('responsaveis'),
                    )}
                  </label>
                  {editId ? (
                    <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] font-normal text-slate-600 dark:text-slate-400">
                      <input
                        type="checkbox"
                        checked={ignorarChavesDraft.includes('responsaveis')}
                        onChange={(e) => setIgnorarChaveMarcada('responsaveis', e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-slate-400 text-indigo-600 focus:ring-indigo-500"
                      />
                      Ignorar
                    </label>
                  ) : null}
                </div>
                <input
                  id="fluxo-aluno-resp"
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                  value={form.responsaveis}
                  onChange={(e) => setForm((p) => ({ ...p, responsaveis: e.target.value }))}
                  aria-invalid={alunoModalDestacarPendencias && rotulosPendenciaNoModalCadastro.has('responsaveis')}
                />
              </div>
              <div className="text-xs text-slate-600">
                <div className="mb-0.5 flex items-center justify-between gap-2">
                  <span className="text-slate-600 dark:text-slate-300">
                    {rotuloComAsteriscoPendencia(
                      'Plano',
                      alunoModalDestacarPendencias && rotulosPendenciaNoModalCadastro.has('plano'),
                    )}
                  </span>
                  {editId ? (
                    <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] font-normal text-slate-600 dark:text-slate-400">
                      <input
                        type="checkbox"
                        checked={ignorarChavesDraft.includes('plano')}
                        onChange={(e) => setIgnorarChaveMarcada('plano', e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-slate-400 text-indigo-600 focus:ring-indigo-500"
                      />
                      Ignorar
                    </label>
                  ) : null}
                </div>
                <select
                  id="fluxo-aluno-plano"
                  className="select-with-chevron mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                  value={form.plano}
                  onChange={(e) => setForm((p) => ({ ...p, plano: e.target.value }))}
                  aria-invalid={alunoModalDestacarPendencias && rotulosPendenciaNoModalCadastro.has('plano')}
                >
                  <option value="">Selecionar</option>
                  {PLANO_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                  {form.plano && !PLANO_OPTIONS.some((opt) => opt.toLowerCase() === form.plano.toLowerCase()) ? (
                    <option value={form.plano}>{form.plano}</option>
                  ) : null}
                </select>
              </div>
              <label className="text-xs text-slate-600">
                Matrícula
                <input
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  value={form.matricula}
                  onChange={(e) => setForm((p) => ({ ...p, matricula: e.target.value }))}
                />
              </label>
              <div className="text-xs text-slate-600">
                <div className="mb-0.5 flex items-center justify-between gap-2">
                  <label htmlFor="fluxo-aluno-venc" className="text-slate-600 dark:text-slate-300">
                    {rotuloComAsteriscoPendencia(
                      'Vencimento (dia ou texto)',
                      alunoModalDestacarPendencias && rotulosPendenciaNoModalCadastro.has('venc'),
                    )}
                  </label>
                  {editId ? (
                    <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] font-normal text-slate-600 dark:text-slate-400">
                      <input
                        type="checkbox"
                        checked={ignorarChavesDraft.includes('venc')}
                        onChange={(e) => setIgnorarChaveMarcada('venc', e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-slate-400 text-indigo-600 focus:ring-indigo-500"
                      />
                      Ignorar
                    </label>
                  ) : null}
                </div>
                <input
                  id="fluxo-aluno-venc"
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                  value={form.venc}
                  onChange={(e) => setForm((p) => ({ ...p, venc: e.target.value }))}
                  aria-invalid={alunoModalDestacarPendencias && rotulosPendenciaNoModalCadastro.has('venc')}
                />
              </div>
              <div className="text-xs text-slate-600">
                <div className="mb-0.5 flex items-center justify-between gap-2">
                  <label htmlFor="fluxo-aluno-valor" className="text-slate-600 dark:text-slate-300">
                    {rotuloComAsteriscoPendencia(
                      'Valor referência (mensal)',
                      alunoModalDestacarPendencias && rotulosPendenciaNoModalCadastro.has('valorReferencia'),
                    )}
                  </label>
                  {editId && !isPlanoBolsa(form.plano) ? (
                    <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] font-normal text-slate-600 dark:text-slate-400">
                      <input
                        type="checkbox"
                        checked={ignorarChavesDraft.includes('valor_ref')}
                        onChange={(e) => setIgnorarChaveMarcada('valor_ref', e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-slate-400 text-indigo-600 focus:ring-indigo-500"
                      />
                      Ignorar
                    </label>
                  ) : null}
                </div>
                <input
                  id="fluxo-aluno-valor"
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                  placeholder="R$ 0,00"
                  value={form.valorReferencia}
                  onChange={(e) => setForm((p) => ({ ...p, valorReferencia: e.target.value }))}
                  onFocus={(e) => setForm((p) => ({ ...p, valorReferencia: toEditableCurrency(e.target.value) }))}
                  onBlur={(e) => setForm((p) => ({ ...p, valorReferencia: toFormattedCurrency(e.target.value) }))}
                  inputMode="decimal"
                  aria-invalid={alunoModalDestacarPendencias && rotulosPendenciaNoModalCadastro.has('valorReferencia')}
                />
              </div>
              <div className="text-xs text-slate-600 sm:col-span-2">
                <div className="mb-0.5 flex items-center justify-between gap-2">
                  <label htmlFor="fluxo-aluno-pix" className="text-slate-600 dark:text-slate-300">
                    {rotuloComAsteriscoPendencia(
                      'Pagador PIX',
                      alunoModalDestacarPendencias && rotulosPendenciaNoModalCadastro.has('pagadorPix'),
                    )}
                  </label>
                  {editId ? (
                    <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] font-normal text-slate-600 dark:text-slate-400">
                      <input
                        type="checkbox"
                        checked={ignorarChavesDraft.includes('pagador_pix')}
                        onChange={(e) => setIgnorarChaveMarcada('pagador_pix', e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-slate-400 text-indigo-600 focus:ring-indigo-500"
                      />
                      Ignorar
                    </label>
                  ) : null}
                </div>
                <input
                  id="fluxo-aluno-pix"
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                  value={form.pagadorPix}
                  onChange={(e) => setForm((p) => ({ ...p, pagadorPix: e.target.value }))}
                  aria-invalid={alunoModalDestacarPendencias && rotulosPendenciaNoModalCadastro.has('pagadorPix')}
                />
              </div>
              <label className="text-xs text-slate-600 sm:col-span-3">
                Observações
                <input
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  value={form.observacoes}
                  onChange={(e) => setForm((p) => ({ ...p, observacoes: e.target.value }))}
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-3">
                <input type="checkbox" checked={form.ativo} onChange={(e) => setForm((p) => ({ ...p, ativo: e.target.checked }))} />
                Ativo
              </label>
            </div>
            <div className="mt-5 flex flex-wrap gap-2 justify-end border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={fecharModalAluno}
                className="rounded border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  const erro = validarAluno(form);
                  if (erro) {
                    showToast(erro, 'error');
                    return;
                  }
                  const payload = toPayload(form);
                  alunoUpdateSourceRef.current = 'modal';
                  if (editId) {
                    void (async () => {
                      setIsSavingAlunoModal(true);
                      try {
                        await updateFluxoOperacionalAluno(editId, payload);
                        await patchFluxoOperacionalAlunoPendenciasIgnoradas(editId, ignorarChavesDraft);
                        showToast('Salvo — cadastro do aluno atualizado.', 'success');
                        setForm(initialForm());
                        setEditId(null);
                        setAlunoModalOpen(false);
                        setAlunoModalDestacarPendencias(false);
                        setAlunoUiSnapshot(null);
                        setIgnorarChavesDraft([]);
                        await qc.invalidateQueries({ queryKey: ['fluxo-operacional-alunos'] });
                        await qc.invalidateQueries({ queryKey: ['fluxo-operacional-alunos-painel'] });
                        await qc.invalidateQueries({ queryKey: ['fluxo-operacional-resumo-multi'] });
                        await qc.invalidateQueries({ queryKey: ['fluxo-operacional-auditoria'] });
                      } catch (e) {
                        showToast(e instanceof Error ? e.message : String(e), 'error');
                      } finally {
                        setIsSavingAlunoModal(false);
                      }
                    })();
                    return;
                  }
                  createMut.mutate(payload);
                }}
                className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {editId ? 'Salvar alterações' : 'Adicionar aluno'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pagModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
          role="presentation"
          onClick={fecharModalPagamento}
        >
          <div
            className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-slate-900">
              {pagEditId ? `Editar pagamento: ${pagForm.alunoNome || '…'}` : 'Novo pagamento'}
            </h2>
            <p className="text-xs text-slate-500 mt-1 mb-3">
              Mês do painel: {monthYear.mes}/{monthYear.ano}. Preencha data e valor como no lançamento da planilha.
            </p>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">Atalho:</span>
              <select
                className="rounded border border-slate-300 px-2 py-1.5 text-xs max-w-[280px]"
                value=""
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) return;
                  const aluno = alunosAtivosVisiveis.find((a) => a.id === id);
                  if (!aluno) return;
                  setPagForm((p) => ({
                    ...p,
                    aba: aluno.aba,
                    modalidade: aluno.modalidade,
                    linhaPlanilha: String(aluno.linha_planilha),
                    alunoNome: aluno.aluno_nome,
                    responsaveis: aluno.responsaveis ?? '',
                    pagadorPix: aluno.pagador_pix ?? '',
                  }));
                }}
              >
                <option value="">Preencher com aluno ativo...</option>
                {alunosAtivosVisiveis.slice(0, 200).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.aluno_nome} · {a.modalidade}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
              <label className="text-xs text-slate-600">
                Aba
                <select
                  className="select-with-chevron mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  value={pagForm.aba}
                  onChange={(e) => setPagForm((p) => ({ ...p, aba: e.target.value }))}
                >
                  <option value="">Selecionar</option>
                  {opcoesAbasFiltro.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                  {pagForm.aba && !opcoesAbasFiltro.includes(pagForm.aba) ? <option value={pagForm.aba}>{pagForm.aba}</option> : null}
                </select>
              </label>
              <label className="text-xs text-slate-600">
                Modalidade
                <select
                  className="select-with-chevron mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  value={pagForm.modalidade}
                  onChange={(e) => setPagForm((p) => ({ ...p, modalidade: e.target.value }))}
                >
                  <option value="">Selecionar</option>
                  {opcoesModalidadesFiltro.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                  {pagForm.modalidade && !opcoesModalidadesFiltro.includes(pagForm.modalidade) ? (
                    <option value={pagForm.modalidade}>{pagForm.modalidade}</option>
                  ) : null}
                </select>
              </label>
              <label className="text-xs text-slate-600">
                Ordem lançamento
                <input
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  value={pagForm.ordemLancamento}
                  onChange={(e) => setPagForm((p) => ({ ...p, ordemLancamento: e.target.value }))}
                />
              </label>
              <label className="text-xs text-slate-600 sm:col-span-2">
                Aluno
                <input
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  value={pagForm.alunoNome}
                  onChange={(e) => setPagForm((p) => ({ ...p, alunoNome: e.target.value }))}
                />
              </label>
              <label className="text-xs text-slate-600">
                Data pagamento
                <input
                  type="date"
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  value={pagForm.dataPagamento}
                  onChange={(e) => setPagForm((p) => ({ ...p, dataPagamento: e.target.value }))}
                />
              </label>
              <label className="text-xs text-slate-600">
                Forma
                <select
                  className="select-with-chevron mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  value={pagForm.forma}
                  onChange={(e) => setPagForm((p) => ({ ...p, forma: e.target.value }))}
                >
                  <option value="">Selecionar</option>
                  {FORMA_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                  {pagForm.forma && !FORMA_OPTIONS.some((opt) => opt.toLowerCase() === pagForm.forma.toLowerCase()) ? (
                    <option value={pagForm.forma}>{pagForm.forma}</option>
                  ) : null}
                </select>
              </label>
              <label className="text-xs text-slate-600">
                Valor
                <input
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  placeholder="R$ 0,00"
                  value={pagForm.valor}
                  onChange={(e) => setPagForm((p) => ({ ...p, valor: e.target.value }))}
                  onFocus={(e) => setPagForm((p) => ({ ...p, valor: toEditableCurrency(e.target.value) }))}
                  onBlur={(e) => setPagForm((p) => ({ ...p, valor: toFormattedCurrency(e.target.value) }))}
                  inputMode="decimal"
                />
              </label>
              <label className="text-xs text-slate-600">
                Mês competência
                <input
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  value={pagForm.mesCompetencia}
                  onChange={(e) => setPagForm((p) => ({ ...p, mesCompetencia: e.target.value }))}
                />
              </label>
              <label className="text-xs text-slate-600">
                Ano competência
                <input
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  value={pagForm.anoCompetencia}
                  onChange={(e) => setPagForm((p) => ({ ...p, anoCompetencia: e.target.value }))}
                />
              </label>
              <label className="text-xs text-slate-600 sm:col-span-2">
                Responsáveis
                <input
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  value={pagForm.responsaveis}
                  onChange={(e) => setPagForm((p) => ({ ...p, responsaveis: e.target.value }))}
                />
              </label>
              <label className="text-xs text-slate-600 sm:col-span-2">
                Pagador PIX
                <input
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  value={pagForm.pagadorPix}
                  onChange={(e) => setPagForm((p) => ({ ...p, pagadorPix: e.target.value }))}
                />
              </label>
            </div>
            <div className="mt-5 flex flex-wrap gap-2 justify-end border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={fecharModalPagamento}
                className="rounded border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={submittingPagamento}
                onClick={() => {
                  const erro = validarPagamento(pagForm);
                  if (erro) {
                    showToast(erro, 'error');
                    return;
                  }
                  const payload = toPagamentoPayload(pagForm);
                  if (pagEditId) updatePagMut.mutate({ id: pagEditId, payload });
                  else createPagMut.mutate(payload);
                }}
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {pagEditId ? 'Salvar pagamento' : 'Adicionar pagamento'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {cobrancaModalAluno && cobrancaAlunoEfetivo ? (
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/55"
          role="presentation"
          onClick={fecharModalCobranca}
        >
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fluxo-cobranca-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="fluxo-cobranca-modal-title"
              ref={cobrancaModalTitleRef}
              tabIndex={-1}
              className="text-base font-semibold text-slate-900 outline-none dark:text-slate-100"
            >
              Cobrança — {cobrancaAlunoEfetivo.aluno_nome}
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {cobrancaAlunoEfetivo.aba} · {cobrancaAlunoEfetivo.modalidade}
            </p>
            <dl className="mt-3 grid gap-2 text-sm text-slate-700 dark:text-slate-200">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Competência (mês atual)
                </dt>
                <dd>
                  {String(painelOperacional.referencia.mes).padStart(2, '0')}/{painelOperacional.referencia.ano}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Responsáveis
                </dt>
                <dd>{responsaveisUnificado(cobrancaAlunoEfetivo)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  WhatsApp
                </dt>
                <dd>{String(cobrancaAlunoEfetivo.wpp ?? '').trim() || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Pagador PIX
                </dt>
                <dd>{pagadorUnificado(cobrancaAlunoEfetivo)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Valor referência / exibido
                </dt>
                <dd>
                  {isPlanoBolsa(cobrancaAlunoEfetivo.plano)
                    ? 'Plano bolsa — sem mensalidade'
                    : formatBrl(
                        cobrancaAlunoEfetivo.valor_mensal_exibicao ?? cobrancaAlunoEfetivo.valor_referencia ?? null,
                      )}
                </dd>
              </div>
            </dl>

            {isPlanoBolsa(cobrancaAlunoEfetivo.plano) ? (
              <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                Este aluno está em <strong>bolsa</strong>: não há cobrança de mensalidade. Use o cadastro se precisar
                ajustar dados de contato.
              </p>
            ) : null}

            <section className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-700" aria-label="Histórico de contatos">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                Últimas tentativas registradas
              </h3>
              {(cobrancaAlunoEfetivo.cobranca_tentativas?.length ?? 0) === 0 ? (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Nenhuma tentativa registrada ainda.</p>
              ) : (
                <ul className="mt-2 max-h-36 space-y-2 overflow-y-auto text-xs">
                  {[...(cobrancaAlunoEfetivo.cobranca_tentativas ?? [])]
                    .slice()
                    .reverse()
                    .slice(0, 8)
                    .map((t, i) => (
                      <li
                        key={`${t.registrado_em}-${i}`}
                        className="rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800/80"
                      >
                        <p className="font-medium text-slate-800 dark:text-slate-100">{t.nota}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {new Date(t.registrado_em).toLocaleString('pt-BR')}
                        </p>
                      </li>
                    ))}
                </ul>
              )}
              <label className="mt-2 block text-xs text-slate-600 dark:text-slate-300">
                Registrar nova tentativa
                <textarea
                  className="mt-0.5 w-full min-h-[4rem] rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                  value={cobrancaNotaDraft}
                  onChange={(e) => setCobrancaNotaDraft(e.target.value)}
                  placeholder="Ex.: enviei lembrete por WhatsApp; combinei pagamento para sexta."
                  maxLength={500}
                />
              </label>
              <button
                type="button"
                disabled={postCobrancaTentativaMut.isPending || !cobrancaNotaDraft.trim()}
                onClick={() =>
                  postCobrancaTentativaMut.mutate({
                    alunoId: cobrancaAlunoEfetivo.id,
                    nota: cobrancaNotaDraft.trim(),
                  })
                }
                className="mt-2 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900"
              >
                Registrar tentativa
              </button>
            </section>

            <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4 dark:border-slate-700">
              <button
                type="button"
                disabled={isPlanoBolsa(cobrancaAlunoEfetivo.plano)}
                title={
                  isPlanoBolsa(cobrancaAlunoEfetivo.plano)
                    ? 'Plano bolsa — não lançar mensalidade'
                    : 'Abrir formulário de pagamento do mês'
                }
                onClick={() => lancarPagamentoDesdeCobranca(cobrancaAlunoEfetivo)}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Lançar pagamento
              </button>
              <button
                type="button"
                onClick={() => abrirCadastroDesdeCobranca(cobrancaAlunoEfetivo)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              >
                Abrir cadastro
              </button>
              <button
                type="button"
                onClick={fecharModalCobranca}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirm?.kind === 'aluno'}
        title="Excluir aluno?"
        message={
          confirm?.kind === 'aluno'
            ? `Remover "${confirm.name}" do fluxo operacional? Esta ação não pode ser desfeita.`
            : ''
        }
        confirmLabel="Excluir"
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm?.kind === 'aluno') deleteMut.mutate(confirm.id);
        }}
      />
      <ConfirmDialog
        open={confirm?.kind === 'pagamento'}
        title="Excluir pagamento?"
        message={
          confirm?.kind === 'pagamento'
            ? `Remover o pagamento de "${confirm.name}"? Esta ação não pode ser desfeita.`
            : ''
        }
        confirmLabel="Excluir"
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm?.kind === 'pagamento') deletePagMut.mutate(confirm.id);
        }}
      />

      <datalist id="abas-sugestoes">
        {abasSugestao.map((x) => (
          <option key={x} value={x} />
        ))}
      </datalist>
      <datalist id="modalidades-sugestoes">
        {modalidadesSugestao.map((x) => (
          <option key={x} value={x} />
        ))}
      </datalist>
    </div>
  );
}
