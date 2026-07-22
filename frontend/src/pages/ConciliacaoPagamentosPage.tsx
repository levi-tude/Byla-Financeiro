import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Topbar } from '../app/Topbar';
import { useAuth } from '../auth/AuthContext';
import { useMonthYear } from '../context/MonthYearContext';
import { FilterBar } from '../components/finance/FilterBar';
import { EmptyState, ErrorPanel, LoadingRow } from '../components/finance/StateBlocks';
import { formatBrl, formatDate } from '../components/finance/classificacao/utils';
import {
  getConciliacaoPagamentos,
  type ConciliacaoPagamentoStatus,
} from '../services/backendApi';

type StatusFiltroPrincipal = 'em_dia' | 'atrasado' | 'pendente' | null;

const STATUS_LABEL: Record<ConciliacaoPagamentoStatus, string> = {
  em_dia: 'Em dia',
  atrasado: 'Atrasado',
  pendente: 'Pendente',
  sem_vencimento: 'Sem vencimento',
  bolsa: 'Bolsa',
};

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

function modalidadeLabel(aba: string, modalidade: string): string {
  const a = (aba ?? '').trim();
  const m = (modalidade ?? '').trim();
  if (a && m && a.toLowerCase() !== m.toLowerCase()) return `${a} · ${m}`;
  return m || a || '—';
}

export function ConciliacaoPagamentosPage() {
  const { monthYear } = useMonthYear();
  const { mes, ano } = monthYear;
  const auth = useAuth();
  const isAdmin = auth.role === 'admin';

  const [statusFiltro, setStatusFiltro] = useState<StatusFiltroPrincipal>(null);
  const [busca, setBusca] = useState('');
  const [modalidadeFiltro, setModalidadeFiltro] = useState('');

  const query = useQuery({
    queryKey: ['conciliacao-pagamentos', mes, ano],
    queryFn: () => getConciliacaoPagamentos(mes, ano),
  });

  const totais = query.data?.totais;
  const itens = query.data?.itens ?? [];

  const modalidades = useMemo(() => {
    const set = new Set<string>();
    for (const item of itens) {
      const label = modalidadeLabel(item.aba, item.modalidade);
      if (label && label !== '—') set.add(label);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [itens]);

  const itensFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens.filter((item) => {
      if (statusFiltro && item.status !== statusFiltro) return false;
      if (modalidadeFiltro) {
        if (modalidadeLabel(item.aba, item.modalidade) !== modalidadeFiltro) return false;
      }
      if (q && !item.aluno_nome.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [itens, statusFiltro, modalidadeFiltro, busca]);

  const colCount = isAdmin ? 8 : 4;

  const toggleStatus = (s: Exclude<StatusFiltroPrincipal, null>) => {
    setStatusFiltro((prev) => (prev === s ? null : s));
  };

  const kpiBtn = (
    id: Exclude<StatusFiltroPrincipal, null>,
    label: string,
    value: number | undefined,
    accent: string,
  ) => {
    const active = statusFiltro === id;
    return (
      <button
        type="button"
        key={id}
        onClick={() => toggleStatus(id)}
        aria-pressed={active}
        className={`rounded-xl border p-4 text-left shadow-sm transition ${
          active
            ? 'border-indigo-400 ring-2 ring-indigo-300 dark:border-indigo-500 dark:ring-indigo-700'
            : 'border-gray-100 dark:border-slate-700'
        } bg-white dark:bg-slate-900 dark:shadow-slate-900/40`}
      >
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-slate-400">
          {label}
        </span>
        {query.isLoading ? (
          <div className="mt-2 h-8 w-16 animate-pulse rounded bg-gray-200 dark:bg-slate-700" />
        ) : (
          <span className={`mt-1 block text-2xl font-semibold ${accent}`}>{value ?? '—'}</span>
        )}
        <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
          {active ? 'Filtro ativo — clique para limpar' : 'Clique para filtrar'}
        </span>
      </button>
    );
  };

  const limparFiltros = () => {
    setStatusFiltro(null);
    setBusca('');
    setModalidadeFiltro('');
  };

  const temFiltro = Boolean(statusFiltro || busca.trim() || modalidadeFiltro);

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <Topbar
        title="Conciliação de pagamentos"
        subtitle="Quem pagou em dia, atrasado ou ainda não pagou no mês selecionado"
      />

      <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-100">
        Em dia = crédito no extrato até o dia do vencimento do cadastro, no mês selecionado.
      </div>

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
        {kpiBtn('em_dia', 'Em dia', totais?.em_dia, 'text-emerald-600 dark:text-emerald-400')}
        {kpiBtn('atrasado', 'Atrasado', totais?.atrasado, 'text-amber-600 dark:text-amber-400')}
        {kpiBtn('pendente', 'Pendente', totais?.pendente, 'text-rose-600 dark:text-rose-400')}
      </section>

      {(totais?.sem_vencimento || totais?.bolsa || totais?.total) && !query.isLoading ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Total no mês: {totais?.total ?? 0}
          {totais && totais.sem_vencimento > 0
            ? ` · Sem vencimento: ${totais.sem_vencimento}`
            : ''}
          {totais && totais.bolsa > 0 ? ` · Bolsa: ${totais.bolsa}` : ''}
        </p>
      ) : null}

      <FilterBar
        title="Filtros"
        subtitle="Busque por nome ou modalidade. Os cartões acima também filtram por status."
        onClear={temFiltro ? limparFiltros : undefined}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
          <div className="sm:col-span-2 lg:col-span-7">
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Busca por nome
            </label>
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome do aluno"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          <div className="lg:col-span-5">
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Modalidade
            </label>
            <select
              value={modalidadeFiltro}
              onChange={(e) => setModalidadeFiltro(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">Todas</option>
              {modalidades.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>
      </FilterBar>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2.5 font-medium">Aluno</th>
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
                </td>
              </tr>
            ) : (
              itensFiltrados.map((item) => (
                <tr
                  key={item.aluno_id}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                >
                  <td className="px-3 py-2.5 font-medium text-slate-800 dark:text-slate-100">
                    {item.aluno_nome}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">
                    {modalidadeLabel(item.aba, item.modalidade)}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">
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
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">
                        {item.data_credito ? formatDate(item.data_credito) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">
                        {item.valor_credito != null ? formatBrl(item.valor_credito) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">
                        {item.pessoa_banco?.trim() || '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        {item.status === 'pendente' ? (
                          <Link
                            to="/validacao-pagamentos-diaria"
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
