import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
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
  updateFluxoOperacionalAluno,
  updateFluxoOperacionalPagamento,
  type FluxoOperacionalAluno,
  type FluxoOperacionalAlunoPayload,
  type FluxoOperacionalPagamento,
  type FluxoOperacionalPagamentoPayload,
} from '../services/backendApi';
import { useToast } from '../context/ToastContext';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ApiErrorPanel } from '../components/ui/ApiErrorPanel';
import { TableSkeleton } from '../components/ui/TableSkeleton';
import { getFluxoAbaTabStyle, getFluxoModalidadeTabStyle } from '../fluxo/fluxoPlanilhaCores';

function formatBrl(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n));
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

/** Campos do cadastro que costumam precisar estar preenchidos para a secretaria. */
function camposCadastroFaltantes(a: FluxoOperacionalAluno): string[] {
  const r: string[] = [];
  if (!String(a.wpp ?? '').trim()) r.push('WhatsApp');
  if (!(a.responsaveis_exibicao?.trim() || a.responsaveis?.trim())) r.push('Responsáveis');
  if (!(a.venc_exibicao?.trim() || a.venc?.trim())) r.push('Vencimento');
  if (a.valor_mensal_origem === 'planilha_bruta' || a.valor_mensal_origem === 'ultimo_pagamento') {
    r.push('Valor ref. (confirmar no cadastro)');
  } else if (a.valor_referencia == null && a.valor_mensal_exibicao == null) {
    r.push('Valor ref.');
  }
  if (!(a.pagador_pix_exibicao?.trim() || a.pagador_pix?.trim())) r.push('Pagador PIX');
  if (!String(a.plano ?? '').trim()) r.push('Plano');
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

function toPayload(form: FormState): FluxoOperacionalAlunoPayload {
  const valor = form.valorReferencia.trim() ? Number(form.valorReferencia.replace(',', '.')) : null;
  return {
    aba: form.aba.trim(),
    modalidade: form.modalidade.trim(),
    linhaPlanilha: Number(form.linhaPlanilha),
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
    valorReferencia: item.valor_referencia != null ? String(item.valor_referencia) : '',
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
  const valor = Number(form.valor.replace(',', '.'));
  return {
    aba: form.aba.trim(),
    modalidade: form.modalidade.trim(),
    linhaPlanilha: Number(form.linhaPlanilha),
    ordemLancamento: Number(form.ordemLancamento || '1'),
    alunoNome: form.alunoNome.trim(),
    dataPagamento: form.dataPagamento,
    forma: form.forma.trim() || null,
    valor: Number.isFinite(valor) ? valor : NaN,
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
    valor: String(item.valor),
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

export function FluxoCaixaOperacionalPage() {
  const { monthYear } = useMonthYear();
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(initialForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [abaFiltro, setAbaFiltro] = useState('');
  const [modalidadeFiltro, setModalidadeFiltro] = useState('');
  const [ativoFiltro, setAtivoFiltro] = useState<'todos' | 'ativos' | 'inativos'>('ativos');
  const [busca, setBusca] = useState('');
  const [soPendencias, setSoPendencias] = useState(false);
  const [pagForm, setPagForm] = useState<PagamentoFormState>(initialPagamentoForm(monthYear.mes, monthYear.ano));
  const [pagEditId, setPagEditId] = useState<string | null>(null);
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [alunoModalOpen, setAlunoModalOpen] = useState(false);
  const [pagModalOpen, setPagModalOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [inlineAluno, setInlineAluno] = useState<InlineAlunoEdit | null>(null);
  const alunoModalTitleRef = useRef<HTMLHeadingElement>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const alunoUpdateSourceRef = useRef<'inline' | 'modal'>('modal');

  const alunosQuery = useQuery({
    queryKey: ['fluxo-operacional-alunos', abaFiltro, modalidadeFiltro, ativoFiltro, busca],
    queryFn: () =>
      getFluxoOperacionalAlunos({
        aba: abaFiltro || undefined,
        modalidade: modalidadeFiltro || undefined,
        ativo: ativoFiltro === 'todos' ? undefined : ativoFiltro === 'ativos',
        q: busca || undefined,
        limit: 2500,
      }),
  });

  const pagamentosQuery = useQuery({
    queryKey: ['fluxo-operacional-pagamentos', monthYear.mes, monthYear.ano, abaFiltro, modalidadeFiltro, busca],
    queryFn: () =>
      getFluxoOperacionalPagamentos({
        ano: monthYear.ano,
        mes: monthYear.mes,
        aba: abaFiltro || undefined,
        modalidade: modalidadeFiltro || undefined,
        q: busca || undefined,
      }),
  });

  const auditoriaQuery = useQuery({
    queryKey: ['fluxo-operacional-auditoria'],
    queryFn: () => getFluxoOperacionalAuditoria({ limit: 30 }),
    enabled: historicoAberto,
  });

  const createMut = useMutation({
    mutationFn: (payload: FluxoOperacionalAlunoPayload) => createFluxoOperacionalAluno(payload),
    onSuccess: async () => {
      showToast('Aluno salvo no fluxo operacional.', 'success');
      setForm(initialForm());
      setAlunoModalOpen(false);
      setEditId(null);
      await qc.invalidateQueries({ queryKey: ['fluxo-operacional-alunos'] });
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
      await qc.invalidateQueries({ queryKey: ['fluxo-operacional-alunos'] });
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
      }
      await qc.invalidateQueries({ queryKey: ['fluxo-operacional-alunos'] });
      await qc.invalidateQueries({ queryKey: ['fluxo-operacional-pagamentos'] });
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
      await qc.invalidateQueries({ queryKey: ['fluxo-operacional-auditoria'] });
    },
    onError: (e) => {
      showToast(e instanceof Error ? e.message : String(e), 'error');
    },
  });

  const submitting = createMut.isPending || updateMut.isPending;
  const submittingPagamento = createPagMut.isPending || updatePagMut.isPending;

  const totalVisivel = alunosQuery.data?.itens.length ?? 0;
  const totalAtivos = useMemo(
    () => (alunosQuery.data?.itens ?? []).filter((x) => x.ativo).length,
    [alunosQuery.data?.itens]
  );
  const totalPagamentosMes = pagamentosQuery.data?.itens.length ?? 0;

  const alunoPorChave = useMemo(() => {
    const m = new Map<string, FluxoOperacionalAluno>();
    for (const a of alunosQuery.data?.itens ?? []) {
      m.set(normKeyFluxo(a.aba, a.modalidade, a.linha_planilha, a.aluno_nome), a);
    }
    return m;
  }, [alunosQuery.data?.itens]);

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

  const linhasParaLista = useMemo(() => {
    if (!soPendencias) return linhasUnificadas;
    return linhasUnificadas.filter(temPendenciaTrabalho);
  }, [linhasUnificadas, soPendencias]);

  const gruposFluxo = useMemo(() => agruparLinhasFluxo(linhasParaLista), [linhasParaLista]);

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
    const linha = Number(formState.linhaPlanilha);
    if (!Number.isInteger(linha) || linha < 1) return 'Linha da planilha deve ser um número inteiro maior que zero.';
    return null;
  }

  function validarPagamento(formState: PagamentoFormState): string | null {
    if (!formState.aba.trim()) return 'Informe a aba do pagamento.';
    if (!formState.modalidade.trim()) return 'Informe a modalidade do pagamento.';
    if (!formState.alunoNome.trim()) return 'Informe o aluno do pagamento.';
    if (!formState.dataPagamento.trim()) return 'Informe a data do pagamento.';
    const linha = Number(formState.linhaPlanilha);
    if (!Number.isInteger(linha) || linha < 1) return 'Linha da planilha deve ser um número inteiro maior que zero.';
    const valor = Number(formState.valor.replace(',', '.'));
    if (!Number.isFinite(valor) || valor <= 0) return 'Valor do pagamento deve ser maior que zero.';
    const mesComp = Number(formState.mesCompetencia);
    if (!Number.isInteger(mesComp) || mesComp < 1 || mesComp > 12) return 'Mês de competência inválido.';
    const anoComp = Number(formState.anoCompetencia);
    if (!Number.isInteger(anoComp) || anoComp < 2000 || anoComp > 2100) return 'Ano de competência inválido.';
    return null;
  }

  useEffect(() => {
    if (!alunoModalOpen && !pagModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAlunoModalOpen(false);
        setPagModalOpen(false);
        setEditId(null);
        setPagEditId(null);
        setForm(initialForm());
        setPagForm(initialPagamentoForm(monthYear.mes, monthYear.ano));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [alunoModalOpen, pagModalOpen, monthYear.mes, monthYear.ano]);

  useEffect(() => {
    if (alunoModalOpen) {
      const t = window.setTimeout(() => alunoModalTitleRef.current?.focus(), 80);
      return () => window.clearTimeout(t);
    }
  }, [alunoModalOpen]);

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

  function limparFiltros() {
    setAbaFiltro('');
    setModalidadeFiltro('');
    setAtivoFiltro('ativos');
    setBusca('');
    setSoPendencias(false);
  }

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
      valorReferencia: p.aluno_valor_referencia != null ? String(p.aluno_valor_referencia) : '',
    });
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
    setAlunoModalOpen(true);
  }

  function abrirEditarAluno(item: FluxoOperacionalAluno) {
    setEditId(item.id);
    setForm(toForm(item));
    setAlunoModalOpen(true);
  }

  function fecharModalAluno() {
    setAlunoModalOpen(false);
    setEditId(null);
    setForm(initialForm());
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
          <td className="px-3 py-2.5 tabular-nums text-slate-600 dark:text-slate-400">{p.linha_planilha}</td>
          <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-slate-100">{p.aluno_nome}</td>
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
          <td className="whitespace-nowrap px-3 py-2.5 text-slate-700 dark:text-slate-300">
            {mesReferenciaLegivel(p.mes_competencia, p.ano_competencia)}
          </td>
          <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-800 dark:text-slate-200">{formatDataBr(p.data_pagamento)}</td>
          <td className="whitespace-nowrap px-3 py-2.5 font-medium tabular-nums text-slate-900 dark:text-slate-50">{formatBrl(p.valor)}</td>
          <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{p.forma?.trim() || '—'}</td>
          <td className="max-w-[120px] truncate px-3 py-2.5 text-slate-600 dark:text-slate-400" title={responsaveisUnificado(aluno, p)}>
            {responsaveisUnificado(aluno, p)}
          </td>
          <td className="max-w-[110px] truncate px-3 py-2.5 text-slate-600 dark:text-slate-400" title={pagadorUnificado(aluno, p)}>
            {pagadorUnificado(aluno, p)}
          </td>
          <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">{aluno?.plano?.trim() || '—'}</td>
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
              <button
                type="button"
                onClick={() => setConfirm({ kind: 'pagamento', id: p.id, name: p.aluno_nome })}
                className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
              >
                Excluir
              </button>
            </div>
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
        <td className="px-3 py-2.5 tabular-nums text-slate-600 dark:text-slate-400">{item.linha_planilha}</td>
        <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-slate-100">{item.aluno_nome}</td>
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
        <td className="px-3 py-2.5 text-slate-400 dark:text-slate-500">—</td>
        <td className="px-3 py-2.5 text-slate-400 dark:text-slate-500">—</td>
        <td className="px-3 py-2.5 text-slate-400 dark:text-slate-500">—</td>
        <td className="px-3 py-2.5 text-slate-400 dark:text-slate-500">—</td>
        <td className="max-w-[120px] truncate px-3 py-2.5 text-slate-600 dark:text-slate-400" title={item.responsaveis_exibicao ?? item.responsaveis ?? ''}>
          {item.responsaveis_exibicao?.trim() || item.responsaveis?.trim() || '—'}
        </td>
        <td className="max-w-[110px] truncate px-3 py-2.5 text-slate-600 dark:text-slate-400" title={item.pagador_pix_exibicao ?? item.pagador_pix ?? ''}>
          {item.pagador_pix_exibicao?.trim() || item.pagador_pix?.trim() || '—'}
        </td>
        <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">{item.plano ?? '—'}</td>
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
              onClick={() => setConfirm({ kind: 'aluno', id: item.id, name: item.aluno_nome })}
              className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
            >
              Excluir
            </button>
          </div>
        </td>
      </tr>
    );
  }

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

        {opcoesAbasFiltro.length > 0 ? (
          <div className="rounded-2xl border border-slate-200/90 bg-white/95 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/90">
            <p className="mb-2 text-xs text-slate-600 dark:text-slate-400">
              <span className="font-medium">Atalho por aba</span> — cores no estilo das guias do Google Sheets; para igualar à planilha FLUXO BYLA, edite{' '}
              <code className="rounded bg-slate-100 px-1 text-[10px] dark:bg-slate-800">frontend/src/fluxo/fluxoPlanilhaCores.ts</code>.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setAbaFiltro('')}
                className={`rounded-lg border-2 px-3 py-2 text-sm font-medium transition dark:border-slate-600 ${
                  abaFiltro === ''
                    ? 'border-slate-700 bg-slate-800 text-white dark:border-slate-400 dark:bg-slate-100 dark:text-slate-900'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                Todas as abas
              </button>
              {opcoesAbasFiltro.map((aba) => {
                const chrome = getFluxoAbaTabStyle(aba);
                const ativo = abaFiltro === aba;
                return (
                  <button
                    key={aba}
                    type="button"
                    onClick={() => setAbaFiltro(aba)}
                    title={`Filtrar: ${aba}`}
                    className="rounded-lg border-2 px-3 py-2 text-sm font-medium shadow-sm transition hover:opacity-95"
                    style={{
                      borderColor: chrome.tab,
                      backgroundColor: ativo ? chrome.soft : undefined,
                      color: ativo ? '#0f172a' : chrome.tab,
                    }}
                  >
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: chrome.tab }} aria-hidden />
                      {aba}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <details className="group rounded-2xl border border-slate-200/90 bg-white/95 shadow-sm open:shadow-md dark:border-slate-700 dark:bg-slate-900/90 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50/80 dark:text-slate-100 dark:hover:bg-slate-800/80">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-500 transition-transform duration-200 group-open:rotate-90 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
              aria-hidden
            >
              ›
            </span>
            <span className="flex-1">Filtros e busca</span>
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
              <label className="text-xs font-medium text-slate-600">
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
              <label className="text-xs font-medium text-slate-600">
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
              <label className="text-xs font-medium text-slate-600">
                Busca
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
                  placeholder="Aluno, aba, modalidade…"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  aria-label="Buscar"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(abaFiltro || modalidadeFiltro || ativoFiltro !== 'ativos' || busca) && (
                <>
                  {abaFiltro ? (
                    <span className="inline-flex items-center rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-900 ring-1 ring-violet-200">
                      Aba: {abaFiltro}
                    </span>
                  ) : null}
                  {modalidadeFiltro ? (
                    <span className="inline-flex items-center rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-900 ring-1 ring-violet-200">
                      Modalidade: {modalidadeFiltro}
                    </span>
                  ) : null}
                  {ativoFiltro !== 'ativos' ? (
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700">
                      Status: {ativoFiltro === 'inativos' ? 'Inativos' : 'Todos'}
                    </span>
                  ) : null}
                  {busca ? (
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700">
                      Busca: {busca}
                    </span>
                  ) : null}
                  <button type="button" onClick={limparFiltros} className="text-xs font-semibold text-violet-700 hover:underline">
                    Limpar filtros
                  </button>
                </>
              )}
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={soPendencias} onChange={(e) => setSoPendencias(e.target.checked)} className="rounded border-slate-300" />
              Mostrar apenas linhas com pendência (cadastro incompleto, sem pagamento no mês ou sem vínculo de cadastro)
            </label>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Os mesmos filtros aplicam à <strong>lista unificada</strong> abaixo (cadastro + pagamentos do mês do painel). As opções de aba e modalidade
              listam <strong>todos</strong> os valores cadastrados, mesmo com filtro ativo — assim você pode trocar de aba sem limpar antes.
            </p>
          </div>
        </details>

        <details className="group rounded-2xl border border-slate-200/90 bg-white/95 shadow-sm open:shadow-md dark:border-slate-700 dark:bg-slate-900/90 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50/80 dark:text-slate-100 dark:hover:bg-slate-800/80">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-500 transition-transform duration-200 group-open:rotate-90 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
              aria-hidden
            >
              ›
            </span>
            <span className="flex-1">Como ler a lista e atalhos</span>
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">legenda</span>
          </summary>
          <div className="space-y-2 border-t border-slate-100 px-4 pb-4 pt-3 text-xs leading-relaxed text-slate-600 dark:border-slate-700 dark:text-slate-400">
            <p className="rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-2 text-amber-950">
              <strong>◆</strong> ao lado do valor de referência indica origem diferente do cadastro (passe o mouse).{' '}
              <strong>Duplo clique</strong> em <em>Venc. (cad.)</em> ou <em>Valor ref.</em> quando houver cadastro vinculado para editar na tabela.
            </p>
            <p>
              Linhas com <span className="rounded bg-amber-100 px-1 font-medium text-amber-900">borda âmbar</span> são alunos{' '}
              <strong>sem pagamento registrado no mês</strong> do painel — use <strong>+ Pagamento</strong>.
            </p>
            <p>
              Linhas com <span className="rounded bg-violet-100 px-1 font-medium text-violet-900">borda violeta</span> têm pagamento mas{' '}
              <strong>sem cadastro</strong> correspondente — use <strong>Cadastro</strong> para criar o vínculo.
            </p>
            <p>
              A coluna <strong>Pendências</strong> descreve o que falta (cadastro ou pagamento do mês). Linhas com <strong>contorno rosado</strong>{' '}
              ainda têm itens a resolver.
            </p>
            <p>
              <kbd className="rounded border border-slate-200 bg-slate-50 px-1 dark:border-slate-600 dark:bg-slate-800">Esc</kbd> fecha os
              formulários centrais sem salvar.
            </p>
          </div>
        </details>

        <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
          <div className="flex flex-col gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50/90 to-white px-4 py-4 dark:border-slate-700 dark:from-slate-900 dark:to-slate-900 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Lista do mês</h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Alunos na consulta: <strong>{totalVisivel}</strong> · Ativos: <strong>{totalAtivos}</strong> · Pagamentos no mês:{' '}
                <strong>{totalPagamentosMes}</strong> · Linhas exibidas: <strong>{linhasParaLista.length}</strong>
                {soPendencias ? (
                  <>
                    {' '}
                    · <span className="text-rose-700 dark:text-rose-400">filtro: só pendências</span>
                  </>
                ) : null}
              </p>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              <strong>Editar pagamento</strong> abre o formulário no centro. A lista abaixo está agrupada por <strong>aba</strong> e{' '}
              <strong>modalidade</strong> (cada grupo pode ser recolhido).
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
                  return (
                  <details
                    key={grupoAba.aba}
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
                            <table className="w-full min-w-[980px] text-sm">
                              <thead className="bg-slate-100/95 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800/95 dark:text-slate-400">
                                <tr>
                                  <th className="px-3 py-2">Linha</th>
                                  <th className="px-3 py-2">Aluno</th>
                                  <th className="px-3 py-2">Venc. (cad.)</th>
                                  <th className="px-3 py-2">Valor ref.</th>
                                  <th className="px-3 py-2">Competência</th>
                                  <th className="px-3 py-2">Data pagto.</th>
                                  <th className="px-3 py-2">Valor pago</th>
                                  <th className="px-3 py-2">Forma</th>
                                  <th className="px-3 py-2">Resp.</th>
                                  <th className="px-3 py-2">Pagador</th>
                                  <th className="px-3 py-2">Plano</th>
                                  <th className="px-3 py-2">Status</th>
                                  <th className="px-3 py-2">Pendências</th>
                                  <th className="px-3 py-2">Ações</th>
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
          className="group rounded-2xl border border-slate-200/90 bg-white/95 shadow-sm open:shadow-md dark:border-slate-700 dark:bg-slate-900/90 [&_summary::-webkit-details-marker]:hidden"
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
                ? `Aba ${form.aba || '—'} · modalidade ${form.modalidade || '—'} · linha ${form.linhaPlanilha || '—'}. Os dados aparecem aqui no centro para não precisar rolar a página.`
                : 'Preencha como na planilha. Campo “Valor referência” grava o valor oficial no cadastro.'}
            </p>
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
              <label className="text-xs text-slate-600">
                Aba
                <input
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  list="abas-sugestoes"
                  value={form.aba}
                  onChange={(e) => setForm((p) => ({ ...p, aba: e.target.value }))}
                />
              </label>
              <label className="text-xs text-slate-600">
                Modalidade
                <input
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  list="modalidades-sugestoes"
                  value={form.modalidade}
                  onChange={(e) => setForm((p) => ({ ...p, modalidade: e.target.value }))}
                />
              </label>
              <label className="text-xs text-slate-600">
                Linha (planilha)
                <input
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  value={form.linhaPlanilha}
                  onChange={(e) => setForm((p) => ({ ...p, linhaPlanilha: e.target.value }))}
                />
              </label>
              <label className="text-xs text-slate-600 sm:col-span-2">
                Nome do aluno
                <input
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  value={form.alunoNome}
                  onChange={(e) => setForm((p) => ({ ...p, alunoNome: e.target.value }))}
                />
              </label>
              <label className="text-xs text-slate-600">
                WhatsApp
                <input
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  value={form.wpp}
                  onChange={(e) => setForm((p) => ({ ...p, wpp: e.target.value }))}
                />
              </label>
              <label className="text-xs text-slate-600 sm:col-span-2">
                Responsáveis
                <input
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  value={form.responsaveis}
                  onChange={(e) => setForm((p) => ({ ...p, responsaveis: e.target.value }))}
                />
              </label>
              <label className="text-xs text-slate-600">
                Plano
                <input
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  value={form.plano}
                  onChange={(e) => setForm((p) => ({ ...p, plano: e.target.value }))}
                />
              </label>
              <label className="text-xs text-slate-600">
                Matrícula
                <input
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  value={form.matricula}
                  onChange={(e) => setForm((p) => ({ ...p, matricula: e.target.value }))}
                />
              </label>
              <label className="text-xs text-slate-600">
                Vencimento (dia ou texto)
                <input
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  value={form.venc}
                  onChange={(e) => setForm((p) => ({ ...p, venc: e.target.value }))}
                />
              </label>
              <label className="text-xs text-slate-600">
                Valor referência (mensal)
                <input
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  placeholder="ex: 150 ou 150,50"
                  value={form.valorReferencia}
                  onChange={(e) => setForm((p) => ({ ...p, valorReferencia: e.target.value }))}
                />
              </label>
              <label className="text-xs text-slate-600 sm:col-span-2">
                Pagador PIX
                <input
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  value={form.pagadorPix}
                  onChange={(e) => setForm((p) => ({ ...p, pagadorPix: e.target.value }))}
                />
              </label>
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
                  if (editId) updateMut.mutate({ id: editId, payload });
                  else createMut.mutate(payload);
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
                <input
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  list="abas-sugestoes"
                  value={pagForm.aba}
                  onChange={(e) => setPagForm((p) => ({ ...p, aba: e.target.value }))}
                />
              </label>
              <label className="text-xs text-slate-600">
                Modalidade
                <input
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  list="modalidades-sugestoes"
                  value={pagForm.modalidade}
                  onChange={(e) => setPagForm((p) => ({ ...p, modalidade: e.target.value }))}
                />
              </label>
              <label className="text-xs text-slate-600">
                Linha
                <input
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  value={pagForm.linhaPlanilha}
                  onChange={(e) => setPagForm((p) => ({ ...p, linhaPlanilha: e.target.value }))}
                />
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
                <input
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  value={pagForm.forma}
                  onChange={(e) => setPagForm((p) => ({ ...p, forma: e.target.value }))}
                />
              </label>
              <label className="text-xs text-slate-600">
                Valor
                <input
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  value={pagForm.valor}
                  onChange={(e) => setPagForm((p) => ({ ...p, valor: e.target.value }))}
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
