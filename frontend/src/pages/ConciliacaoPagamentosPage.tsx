import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { usePersistedPageState } from '../hooks/usePersistedPageState';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Topbar } from '../app/Topbar';
import { useAuth } from '../auth/AuthContext';
import { useMonthYear } from '../context/MonthYearContext';
import { FilterBar, type FilterChip } from '../components/finance/FilterBar';
import { EmptyState, ErrorPanel, LoadingRow } from '../components/finance/StateBlocks';
import { formatBrl, formatDate } from '../components/finance/classificacao/utils';
import {
  classificarAssinaturaCreditoRecorrente,
  getAlertasParouDePagar,
  getAlertasVendasSemVinculo,
  getConciliacaoPagamentos,
  type ConciliacaoPagamentoStatus,
} from '../services/backendApi';

type StatusFiltro = ConciliacaoPagamentoStatus | 'todos';

const STATUS_LABEL: Record<ConciliacaoPagamentoStatus, string> = {
  em_dia: 'Em dia',
  atrasado: 'Atrasado',
  pendente: 'Pendente',
  sem_vencimento: 'Sem vencimento',
  bolsa: 'Bolsa',
};

/** Ordem de cobrança (mercado AR / aging): urgência primeiro. */
const STATUS_SORT: Record<ConciliacaoPagamentoStatus, number> = {
  pendente: 0,
  atrasado: 1,
  sem_vencimento: 2,
  em_dia: 3,
  bolsa: 4,
};

function normalizeSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function statusBadgeClass(status: ConciliacaoPagamentoStatus): string {
  if (status === 'em_dia') {
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200';
  }
  if (status === 'atrasado') {
    return 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200';
  }
  if (status === 'pendente') {
    return 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200';
  }
  if (status === 'bolsa') {
    return 'bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200';
  }
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
}

function rowKey(item: {
  aluno_id: string;
  aba: string;
  modalidade: string;
  status: ConciliacaoPagamentoStatus;
}): string {
  return `${item.aluno_id}|${item.aba}|${item.modalidade}|${item.status}`;
}

type ConciliacaoNavPersisted = {
  statusFiltro: StatusFiltro;
  busca: string;
  abaFiltro: string;
  modalidadeFiltro: string;
};

const CONCILIACAO_NAV_INITIAL: ConciliacaoNavPersisted = {
  statusFiltro: 'todos',
  busca: '',
  abaFiltro: '',
  modalidadeFiltro: '',
};

function patchConciliacaoNav<K extends keyof ConciliacaoNavPersisted>(
  setNav: Dispatch<SetStateAction<ConciliacaoNavPersisted>>,
  key: K,
  value: SetStateAction<ConciliacaoNavPersisted[K]>,
) {
  setNav((prev) => ({
    ...prev,
    [key]: typeof value === 'function'
      ? (value as (prev: ConciliacaoNavPersisted[K]) => ConciliacaoNavPersisted[K])(prev[key])
      : value,
  }));
}

export function ConciliacaoPagamentosPage() {
  const { monthYear } = useMonthYear();
  const { mes, ano } = monthYear;
  const auth = useAuth();
  const isAdmin = auth.role === 'admin';
  const queryClient = useQueryClient();

  const [nav, setNav] = usePersistedPageState('conciliacao-pagamentos', CONCILIACAO_NAV_INITIAL);
  const { statusFiltro, busca, abaFiltro, modalidadeFiltro } = nav;

  const setStatusFiltro = useCallback(
    (value: SetStateAction<StatusFiltro>) => patchConciliacaoNav(setNav, 'statusFiltro', value),
    [setNav],
  );
  const setBusca = useCallback(
    (value: SetStateAction<string>) => patchConciliacaoNav(setNav, 'busca', value),
    [setNav],
  );
  const setAbaFiltro = useCallback(
    (value: SetStateAction<string>) => patchConciliacaoNav(setNav, 'abaFiltro', value),
    [setNav],
  );
  const setModalidadeFiltro = useCallback(
    (value: SetStateAction<string>) => patchConciliacaoNav(setNav, 'modalidadeFiltro', value),
    [setNav],
  );

  const [alertasParouOcultos, setAlertasParouOcultos] = useState<Set<string>>(() => new Set());
  const [classificandoId, setClassificandoId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['conciliacao-pagamentos', mes, ano],
    queryFn: () => getConciliacaoPagamentos(mes, ano),
  });

  const alertasVendasQuery = useQuery({
    queryKey: ['alertas-vendas', mes, ano],
    queryFn: () => getAlertasVendasSemVinculo(mes, ano),
  });

  const alertasParouQuery = useQuery({
    queryKey: ['alertas-parou', mes, ano],
    queryFn: () => getAlertasParouDePagar(mes, ano),
  });

  const classificarMutation = useMutation({
    mutationFn: ({
      id,
      acao,
    }: {
      id: string;
      acao: 'cancelou' | 'parou_de_pagar';
    }) => classificarAssinaturaCreditoRecorrente(id, acao),
    onMutate: ({ id }) => setClassificandoId(id),
    onSettled: () => setClassificandoId(null),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alertas-parou', mes, ano] });
    },
  });

  const alertasVendas = alertasVendasQuery.data?.alertas ?? [];
  const alertasParouVisiveis = (alertasParouQuery.data?.alertas ?? []).filter(
    (a) => !alertasParouOcultos.has(a.assinatura_id),
  );


  const itens = query.data?.itens ?? [];

  const itensComFiltrosGerais = useMemo(() => {
    const q = normalizeSearch(busca);
    return itens.filter((item) => {
      if (abaFiltro && (item.aba ?? '').trim() !== abaFiltro) return false;
      if (modalidadeFiltro && (item.modalidade ?? '').trim() !== modalidadeFiltro) return false;
      if (q) {
        const hay = normalizeSearch(
          `${item.aluno_nome} ${item.aba} ${item.modalidade} ${STATUS_LABEL[item.status]}`,
        );
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [itens, abaFiltro, modalidadeFiltro, busca]);

  const totaisVisiveis = useMemo(() => {
    const acc = {
      em_dia: 0,
      atrasado: 0,
      pendente: 0,
      sem_vencimento: 0,
      bolsa: 0,
      total: 0,
    };
    for (const item of itensComFiltrosGerais) {
      acc[item.status] += 1;
      acc.total += 1;
    }
    return acc;
  }, [itensComFiltrosGerais]);

  const abas = useMemo(() => {
    const set = new Set<string>();
    for (const item of itens) {
      const a = (item.aba ?? '').trim();
      if (a) set.add(a);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [itens]);

  /** Modalidades da aba selecionada (ou todas, se nenhuma aba). */
  const modalidades = useMemo(() => {
    const set = new Set<string>();
    for (const item of itens) {
      if (abaFiltro && (item.aba ?? '').trim() !== abaFiltro) continue;
      const m = (item.modalidade ?? '').trim();
      if (m) set.add(m);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [itens, abaFiltro]);

  const itensFiltrados = useMemo(() => {
    const filtered = itensComFiltrosGerais.filter((item) => {
      if (statusFiltro !== 'todos' && item.status !== statusFiltro) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      const byStatus = STATUS_SORT[a.status] - STATUS_SORT[b.status];
      if (byStatus !== 0) return byStatus;
      const byAba = (a.aba ?? '').localeCompare(b.aba ?? '', 'pt-BR');
      if (byAba !== 0) return byAba;
      const byMod = (a.modalidade ?? '').localeCompare(b.modalidade ?? '', 'pt-BR');
      if (byMod !== 0) return byMod;
      return a.aluno_nome.localeCompare(b.aluno_nome, 'pt-BR');
    });
  }, [itensComFiltrosGerais, statusFiltro]);

  const colCount = isAdmin ? 9 : 5;

  const limparFiltros = () => {
    setStatusFiltro('todos');
    setBusca('');
    setAbaFiltro('');
    setModalidadeFiltro('');
  };

  const onChangeAba = (proxima: string) => {
    setAbaFiltro(proxima);
    setModalidadeFiltro('');
  };

  const temFiltro =
    statusFiltro !== 'todos' || Boolean(busca.trim() || abaFiltro || modalidadeFiltro);

  const chips: FilterChip[] = [];
  if (statusFiltro !== 'todos') {
    chips.push({
      id: 'status',
      label: `Status: ${STATUS_LABEL[statusFiltro]}`,
      onRemove: () => setStatusFiltro('todos'),
    });
  }
  if (abaFiltro) {
    chips.push({
      id: 'aba',
      label: `Aba: ${abaFiltro}`,
      onRemove: () => {
        setAbaFiltro('');
        setModalidadeFiltro('');
      },
    });
  }
  if (modalidadeFiltro) {
    chips.push({
      id: 'mod',
      label: `Modalidade: ${modalidadeFiltro}`,
      onRemove: () => setModalidadeFiltro(''),
    });
  }
  if (busca.trim()) {
    chips.push({
      id: 'busca',
      label: `Busca: ${busca.trim()}`,
      onRemove: () => setBusca(''),
    });
  }

  const kpiBtn = (
    id: ConciliacaoPagamentoStatus,
    label: string,
    value: number | undefined,
    accent: string,
    borderAccent: string,
  ) => {
    const active = statusFiltro === id;
    return (
      <button
        type="button"
        key={id}
        onClick={() => setStatusFiltro((prev) => (prev === id ? 'todos' : id))}
        aria-pressed={active}
        className={`rounded-xl border border-t-4 p-4 text-left shadow-sm transition ${borderAccent} ${
          active
            ? 'ring-2 ring-indigo-300 dark:ring-indigo-700 border-indigo-300 dark:border-indigo-600'
            : 'border-gray-100 dark:border-slate-700'
        } bg-white dark:bg-slate-900 dark:shadow-slate-900/40`}
      >
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-slate-400">
          {label}
        </span>
        {query.isLoading ? (
          <div className="mt-2 h-8 w-16 animate-pulse rounded bg-gray-200 dark:bg-slate-700" />
        ) : (
          <span className={`mt-1 block text-2xl font-semibold tabular-nums ${accent}`}>
            {value ?? '—'}
          </span>
        )}
        <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
          {active ? 'Filtro ativo — clique para limpar' : 'Clique para filtrar'}
        </span>
      </button>
    );
  };

  const secondaryPill = (id: ConciliacaoPagamentoStatus, label: string, count: number) => {
    if (count <= 0 && !query.isLoading) return null;
    const active = statusFiltro === id;
    return (
      <button
        type="button"
        key={id}
        onClick={() => setStatusFiltro((prev) => (prev === id ? 'todos' : id))}
        aria-pressed={active}
        className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
          active
            ? 'border-indigo-400 bg-indigo-50 text-indigo-900 dark:border-indigo-500 dark:bg-indigo-950/50 dark:text-indigo-100'
            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
        }`}
      >
        {label}
        <span className="ml-1 tabular-nums opacity-80">({query.isLoading ? '…' : count})</span>
      </button>
    );
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <Topbar
        title="Conciliação de pagamentos"
        subtitle="Quem pagou em dia, atrasado ou ainda não pagou no mês selecionado"
      />

      <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-100">
        Em dia = crédito no extrato até o dia do vencimento do cadastro, no mês selecionado. A lista
        prioriza pendentes e atrasados (ordem de cobrança).
      </div>

      {alertasVendas.length > 0 ? (
        <div
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
          role="region"
          aria-label="Alertas de possível nova assinatura"
        >
          <p className="font-medium">
            {alertasVendas.length} possível(is) nova(s) assinatura(s) no mês — crédito recorrente (Vendas) ainda
            sem vínculo
          </p>
          <ul className="mt-2 space-y-2">
            {alertasVendas.map((alerta) => {
              const diaFluxo = (alerta.data_fluxo_sugerida ?? alerta.data).slice(0, 10);
              const mostraHintExtrato =
                alerta.data_fluxo_sugerida &&
                alerta.data_fluxo_sugerida.slice(0, 10) !== alerta.data.slice(0, 10);
              return (
              <li
                key={`${alerta.data}-${alerta.valor}-${alerta.banco_id ?? alerta.mensagem}`}
                className="rounded-lg border border-amber-200/80 bg-white/60 px-3 py-2 dark:border-amber-900/50 dark:bg-slate-900/40"
              >
                <p>{alerta.mensagem}</p>
                <p className="mt-1 text-xs tabular-nums text-amber-900/80 dark:text-amber-200/80">
                  {mostraHintExtrato ? (
                    <>
                      Cobrança no fluxo: {formatDate(diaFluxo)} · liquidação no extrato:{' '}
                      {formatDate(alerta.data)} · {formatBrl(alerta.valor)}
                    </>
                  ) : (
                    <>
                      {formatDate(alerta.data)} · {formatBrl(alerta.valor)}
                      {isAdmin && alerta.pessoa ? ` · ${alerta.pessoa}` : ''}
                    </>
                  )}
                </p>
                {isAdmin ? (
                  <Link
                    to={`/validacao-pagamentos-diaria?data=${encodeURIComponent(diaFluxo)}`}
                    className="mt-2 inline-flex rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-slate-900 dark:text-amber-100 dark:hover:bg-slate-800"
                  >
                    Ir ao dia na Validação
                  </Link>
                ) : null}
              </li>
              );
            })}
          </ul>
          {isAdmin ? (
            <Link
              to={`/validacao-pagamentos-diaria${
                alertasVendas[0]?.data_fluxo_sugerida
                  ? `?data=${encodeURIComponent(alertasVendas[0].data_fluxo_sugerida.slice(0, 10))}`
                  : ''
              }`}
              className="mt-3 inline-flex rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-slate-900 dark:text-amber-100 dark:hover:bg-slate-800"
            >
              Ir para Validação →
            </Link>
          ) : null}
        </div>
      ) : null}

      {alertasParouVisiveis.length > 0 ? (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-100"
          role="region"
          aria-label="Alertas de possível parada de pagamento"
        >
          <p className="font-medium">
            {alertasParouVisiveis.length} assinatura(s) recorrente(s) — possível parada de pagamento
          </p>
          <ul className="mt-2 space-y-2">
            {alertasParouVisiveis.map((alerta) => (
              <li
                key={alerta.assinatura_id}
                className="rounded-lg border border-rose-200/80 bg-white/60 px-3 py-2 dark:border-rose-900/50 dark:bg-slate-900/40"
              >
                <p className="font-medium">{alerta.nome_exibicao}</p>
                <p className="mt-0.5">{alerta.mensagem}</p>
                {isAdmin && alerta.data_esperada ? (
                  <p className="mt-1 text-xs tabular-nums text-rose-900/80 dark:text-rose-200/80">
                    Liquidação esperada no extrato ~{formatDate(alerta.data_esperada)}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={classificandoId === alerta.assinatura_id}
                    onClick={() =>
                      classificarMutation.mutate({
                        id: alerta.assinatura_id,
                        acao: 'cancelou',
                      })
                    }
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                  >
                    Cancelou
                  </button>
                  <button
                    type="button"
                    disabled={classificandoId === alerta.assinatura_id}
                    onClick={() =>
                      classificarMutation.mutate({
                        id: alerta.assinatura_id,
                        acao: 'parou_de_pagar',
                      })
                    }
                    className="rounded-lg border border-rose-300 bg-white px-3 py-1 text-xs font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-60 dark:border-rose-700 dark:bg-slate-900 dark:text-rose-100 dark:hover:bg-rose-950/60"
                  >
                    Parou de pagar
                  </button>
                  <button
                    type="button"
                    disabled={classificandoId === alerta.assinatura_id}
                    onClick={() =>
                      setAlertasParouOcultos((prev) => new Set(prev).add(alerta.assinatura_id))
                    }
                    className="rounded-lg border border-transparent px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Ver depois
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {isAdmin ? (
            <Link
              to="/assinaturas-credito-recorrente"
              className="mt-3 inline-flex rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-100 dark:border-rose-700 dark:bg-slate-900 dark:text-rose-100 dark:hover:bg-slate-800"
            >
              Ver cadastro de assinaturas →
            </Link>
          ) : null}
        </div>
      ) : null}

      {query.error ? (
        <ErrorPanel
          message={
            query.error instanceof Error
              ? query.error.message
              : 'Não foi possível carregar a conciliação.'
          }
          action={
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-medium hover:bg-rose-100 dark:border-rose-800 dark:hover:bg-rose-950/60"
            >
              Tentar de novo
            </button>
          }
        />
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        {kpiBtn(
          'pendente',
          'Pendente',
          totaisVisiveis.pendente,
          'text-rose-600 dark:text-rose-400',
          'border-t-rose-500',
        )}
        {kpiBtn(
          'atrasado',
          'Atrasado',
          totaisVisiveis.atrasado,
          'text-amber-600 dark:text-amber-400',
          'border-t-amber-500',
        )}
        {kpiBtn(
          'em_dia',
          'Em dia',
          totaisVisiveis.em_dia,
          'text-emerald-600 dark:text-emerald-400',
          'border-t-emerald-500',
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setStatusFiltro('todos')}
          aria-pressed={statusFiltro === 'todos'}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
            statusFiltro === 'todos'
              ? 'border-indigo-400 bg-indigo-50 text-indigo-900 dark:border-indigo-500 dark:bg-indigo-950/50 dark:text-indigo-100'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300'
          }`}
        >
          Todos
          <span className="ml-1 tabular-nums opacity-80">
            ({query.isLoading ? '…' : totaisVisiveis.total})
          </span>
        </button>
        {secondaryPill('sem_vencimento', 'Sem vencimento', totaisVisiveis.sem_vencimento)}
        {secondaryPill('bolsa', 'Bolsa', totaisVisiveis.bolsa)}
      </div>

      <FilterBar
        title="Filtros"
        subtitle="Busque pelo nome. Refine por aba e, em seguida, pela modalidade dessa aba."
        chips={chips}
        periodLabel={`${String(mes).padStart(2, '0')}/${ano}`}
        onClear={temFiltro ? limparFiltros : undefined}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
          <div className="sm:col-span-2 lg:col-span-6">
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Busca
            </label>
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome do aluno…"
              autoComplete="off"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          <div className="lg:col-span-3">
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Aba
            </label>
            <select
              value={abaFiltro}
              onChange={(e) => onChangeAba(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">Todas as abas</option>
              {abas.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-3">
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Modalidade
            </label>
            <select
              value={modalidadeFiltro}
              onChange={(e) => setModalidadeFiltro(e.target.value)}
              disabled={modalidades.length === 0}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">
                {abaFiltro ? 'Todas desta aba' : 'Todas as modalidades'}
              </option>
              {modalidades.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>
      </FilterBar>

      {!query.isLoading && itens.length > 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Mostrando <span className="font-semibold text-slate-700 dark:text-slate-200">{itensFiltrados.length}</span>{' '}
          de <span className="font-semibold text-slate-700 dark:text-slate-200">{itens.length}</span> alunos
          {temFiltro ? ' (com filtros)' : ''}.
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2.5 font-medium">Aluno</th>
              <th className="px-3 py-2.5 font-medium">Aba</th>
              <th className="px-3 py-2.5 font-medium">Modalidade</th>
              <th className="px-3 py-2.5 font-medium">Venc.</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              {isAdmin ? (
                <>
                  <th className="px-3 py-2.5 font-medium">Data crédito</th>
                  <th className="px-3 py-2.5 font-medium">Valor</th>
                  <th className="px-3 py-2.5 font-medium">Pessoa banco</th>
                  <th className="px-3 py-2.5 font-medium">Ação</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              <LoadingRow colSpan={colCount} rows={6} />
            ) : itensFiltrados.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-3 py-4">
                  <EmptyState
                    message={
                      itens.length === 0
                        ? 'Nenhum aluno ativo neste mês para conciliar.'
                        : 'Nenhum resultado com os filtros atuais.'
                    }
                  />
                  {temFiltro && itens.length > 0 ? (
                    <div className="mt-3 text-center">
                      <button
                        type="button"
                        onClick={limparFiltros}
                        className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        Limpar filtros
                      </button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ) : (
              itensFiltrados.map((item) => (
                <tr
                  key={rowKey(item)}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                >
                  <td className="px-3 py-2.5 font-medium text-slate-800 dark:text-slate-100">
                    {item.aluno_nome}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">
                    {(item.aba ?? '').trim() || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">
                    {(item.modalidade ?? '').trim() || '—'}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-600 dark:text-slate-300">
                    {item.dia_vencimento != null ? `Dia ${item.dia_vencimento}` : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(item.status)}`}
                    >
                      {STATUS_LABEL[item.status]}
                    </span>
                  </td>
                  {isAdmin ? (
                    <>
                      <td className="px-3 py-2.5 tabular-nums text-slate-600 dark:text-slate-300">
                        {item.data_credito ? formatDate(item.data_credito) : '—'}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-slate-600 dark:text-slate-300">
                        {item.valor_credito != null ? formatBrl(item.valor_credito) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">
                        {item.pessoa_banco?.trim() || '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        {item.status === 'pendente' || item.status === 'atrasado' ? (
                          <Link
                            to={
                              item.data_pagamento_fluxo
                                ? `/validacao-pagamentos-diaria?data=${encodeURIComponent(item.data_pagamento_fluxo.slice(0, 10))}`
                                : '/validacao-pagamentos-diaria'
                            }
                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
                          >
                            Conferir na Validação
                          </Link>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
