import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Topbar } from '../app/Topbar';
import { useMonthYear } from '../context/MonthYearContext';
import { FilterBar, type FilterChip } from '../components/finance/FilterBar';
import { EmptyState, ErrorPanel, LoadingRow } from '../components/finance/StateBlocks';
import { formatBrl, formatDate } from '../components/finance/classificacao/utils';
import {
  getFinancasAlunos,
  type FinancasAlunoBancoStatus,
  type FinancasAlunoConciliacaoStatus,
  type FinancasAlunoGrupo,
  type FinancasAlunoVinculoFiltro,
  type MeioPagamentoAluno,
  type MeioPagamentoAlunoFiltro,
} from '../services/backendApi';

const MEIO_LABEL: Record<MeioPagamentoAluno, string> = {
  pix: 'PIX',
  debito: 'Débito',
  credito_a_vista: 'Crédito à vista',
  credito_recorrente: 'Crédito por recorrência',
  desconhecido: 'Não identificado',
};

const MEIO_FILTRO_OPCOES: Array<{ id: MeioPagamentoAlunoFiltro; label: string }> = [
  { id: 'todos', label: 'Todos' },
  { id: 'pix', label: 'PIX' },
  { id: 'debito', label: 'Débito' },
  { id: 'credito_a_vista', label: 'Crédito à vista' },
  { id: 'credito_recorrente', label: 'Crédito por recorrência' },
];

const VINCULO_FILTRO_OPCOES: Array<{ id: FinancasAlunoVinculoFiltro; label: string }> = [
  { id: 'todos', label: 'Todos' },
  { id: 'vinculado', label: 'Com vínculo/match' },
  { id: 'sem_vinculo', label: 'Sem vínculo' },
];

const BANCO_STATUS_LABEL: Record<FinancasAlunoBancoStatus, string> = {
  vinculo: 'Vinculado',
  match: 'Match automático',
  nenhum: 'Sem reconhecimento',
};

const STATUS_CONCILIACAO_LABEL: Record<FinancasAlunoConciliacaoStatus, string> = {
  em_dia: 'Em dia',
  atrasado: 'Atrasado',
  pendente: 'Pendente',
  sem_vencimento: 'Sem vencimento',
  bolsa: 'Bolsa',
};

function meioBadgeClass(meio: MeioPagamentoAluno): string {
  if (meio === 'pix') {
    return 'bg-teal-100 text-teal-800 dark:bg-teal-950/50 dark:text-teal-200';
  }
  if (meio === 'debito') {
    return 'bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200';
  }
  if (meio === 'credito_a_vista') {
    return 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200';
  }
  if (meio === 'credito_recorrente') {
    return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200';
  }
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
}

function bancoStatusBadgeClass(status: FinancasAlunoBancoStatus): string {
  if (status === 'vinculo') {
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200';
  }
  if (status === 'match') {
    return 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200';
  }
  return 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200';
}

function statusConciliacaoBadgeClass(status: FinancasAlunoConciliacaoStatus): string {
  if (status === 'em_dia') {
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200';
  }
  if (status === 'atrasado') {
    return 'bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-200';
  }
  if (status === 'pendente') {
    return 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200';
  }
  if (status === 'bolsa') {
    return 'bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-200';
  }
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
}

function normalizeSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function chaveSecao(aba: string, modalidade: string): string {
  return `${aba}|||${modalidade}`;
}

type SecaoAgrupada = {
  aba: string;
  modalidade: string;
  alunos: FinancasAlunoGrupo[];
};

export function FinancasAlunosPage() {
  const { monthYear } = useMonthYear();
  const { mes, ano } = monthYear;

  const [meioFiltro, setMeioFiltro] = useState<MeioPagamentoAlunoFiltro>('todos');
  const [vinculoFiltro, setVinculoFiltro] = useState<FinancasAlunoVinculoFiltro>('todos');
  const [abaFiltro, setAbaFiltro] = useState('');
  const [modalidadeFiltro, setModalidadeFiltro] = useState('');
  const [busca, setBusca] = useState('');

  const query = useQuery({
    queryKey: ['financas-alunos', mes, ano, meioFiltro, vinculoFiltro],
    queryFn: () => getFinancasAlunos(mes, ano, meioFiltro, vinculoFiltro),
  });

  const grupos = query.data?.grupos ?? [];

  const abas = useMemo(() => {
    const set = new Set<string>();
    for (const g of grupos) {
      const a = (g.aba ?? '').trim();
      if (a) set.add(a);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [grupos]);

  const modalidades = useMemo(() => {
    const set = new Set<string>();
    for (const g of grupos) {
      if (abaFiltro && (g.aba ?? '').trim() !== abaFiltro) continue;
      const m = (g.modalidade ?? '').trim();
      if (m) set.add(m);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [grupos, abaFiltro]);

  const gruposFiltrados = useMemo(() => {
    const q = normalizeSearch(busca);
    return grupos.filter((g) => {
      if (abaFiltro && (g.aba ?? '').trim() !== abaFiltro) return false;
      if (modalidadeFiltro && (g.modalidade ?? '').trim() !== modalidadeFiltro) return false;
      if (q) {
        const hay = normalizeSearch(
          `${g.aluno_exibicao} ${g.aba} ${g.modalidade} ${g.pagamentos
            .map(
              (p) =>
                `${MEIO_LABEL[p.meio]} ${BANCO_STATUS_LABEL[p.banco_status]} ${STATUS_CONCILIACAO_LABEL[p.status_conciliacao]}`,
            )
            .join(' ')}`,
        );
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [grupos, abaFiltro, modalidadeFiltro, busca]);

  const secoes = useMemo(() => {
    const map = new Map<string, SecaoAgrupada>();
    for (const g of gruposFiltrados) {
      const aba = g.aba || '—';
      const modalidade = g.modalidade || g.aba || '—';
      const key = chaveSecao(aba, modalidade);
      let secao = map.get(key);
      if (!secao) {
        secao = { aba, modalidade, alunos: [] };
        map.set(key, secao);
      }
      secao.alunos.push(g);
    }
    return [...map.values()].sort(
      (a, b) =>
        a.aba.localeCompare(b.aba, 'pt-BR') ||
        a.modalidade.localeCompare(b.modalidade, 'pt-BR'),
    );
  }, [gruposFiltrados]);

  const resumo = useMemo(() => {
    let pagamentos = 0;
    let comReconhecimento = 0;
    let semReconhecimento = 0;
    let emDia = 0;
    let atrasado = 0;
    let pendente = 0;
    for (const g of gruposFiltrados) {
      for (const p of g.pagamentos) {
        pagamentos += 1;
        if (p.banco_status === 'vinculo' || p.banco_status === 'match') comReconhecimento += 1;
        else semReconhecimento += 1;
        if (p.status_conciliacao === 'em_dia') emDia += 1;
        else if (p.status_conciliacao === 'atrasado') atrasado += 1;
        else if (p.status_conciliacao === 'pendente') pendente += 1;
      }
    }
    return {
      pagamentos,
      comReconhecimento,
      semReconhecimento,
      emDia,
      atrasado,
      pendente,
    };
  }, [gruposFiltrados]);

  const limparFiltros = () => {
    setMeioFiltro('todos');
    setVinculoFiltro('todos');
    setAbaFiltro('');
    setModalidadeFiltro('');
    setBusca('');
  };

  const onChangeAba = (proxima: string) => {
    setAbaFiltro(proxima);
    setModalidadeFiltro('');
  };

  const temFiltro =
    meioFiltro !== 'todos' ||
    vinculoFiltro !== 'todos' ||
    Boolean(busca.trim() || abaFiltro || modalidadeFiltro);

  const chips: FilterChip[] = [];
  if (meioFiltro !== 'todos') {
    const label = MEIO_FILTRO_OPCOES.find((o) => o.id === meioFiltro)?.label ?? meioFiltro;
    chips.push({
      id: 'meio',
      label: `Meio: ${label}`,
      onRemove: () => setMeioFiltro('todos'),
    });
  }
  if (vinculoFiltro !== 'todos') {
    const label = VINCULO_FILTRO_OPCOES.find((o) => o.id === vinculoFiltro)?.label ?? vinculoFiltro;
    chips.push({
      id: 'vinculo',
      label: `Reconhecimento: ${label}`,
      onRemove: () => setVinculoFiltro('todos'),
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

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <Topbar
        title="Alunos"
        subtitle="Pagamentos previstos no Fluxo da competência — com crédito reconhecido ou pendentes"
      />

      {query.error ? (
        <ErrorPanel
          message={
            query.error instanceof Error
              ? query.error.message
              : 'Não foi possível carregar os pagamentos dos alunos.'
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

      <FilterBar
        title="Filtros"
        subtitle="Mesma base de pagamentos da Conciliação. Filtre por reconhecimento bancário, meio, aba ou modalidade."
        periodLabel={`${String(mes).padStart(2, '0')}/${ano}`}
        chips={chips}
        onClear={temFiltro ? limparFiltros : undefined}
      >
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            Reconhecimento bancário
          </p>
          <div className="flex flex-wrap gap-2">
            {VINCULO_FILTRO_OPCOES.map((opcao) => {
              const active = vinculoFiltro === opcao.id;
              return (
                <button
                  key={opcao.id}
                  type="button"
                  onClick={() => setVinculoFiltro(opcao.id)}
                  aria-pressed={active}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    active
                      ? 'border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-500 dark:bg-amber-950/50 dark:text-amber-100'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  {opcao.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            Meio de pagamento
          </p>
          <div className="flex flex-wrap gap-2">
            {MEIO_FILTRO_OPCOES.map((opcao) => {
              const active = meioFiltro === opcao.id;
              return (
                <button
                  key={opcao.id}
                  type="button"
                  onClick={() => setMeioFiltro(opcao.id)}
                  aria-pressed={active}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    active
                      ? 'border-indigo-400 bg-indigo-50 text-indigo-900 dark:border-indigo-500 dark:bg-indigo-950/50 dark:text-indigo-100'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  {opcao.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
          <div className="sm:col-span-1 lg:col-span-3">
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Aba
            </label>
            <select
              value={abaFiltro}
              onChange={(e) => onChangeAba(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">Todas</option>
              {abas.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-1 lg:col-span-3">
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Modalidade
            </label>
            <select
              value={modalidadeFiltro}
              onChange={(e) => setModalidadeFiltro(e.target.value)}
              disabled={modalidades.length === 0}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">Todas</option>
              {modalidades.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-6">
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Busca
            </label>
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome do aluno, aba ou modalidade…"
              autoComplete="off"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
        </div>
      </FilterBar>

      {!query.isLoading && grupos.length > 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200">
          <span className="font-semibold">{gruposFiltrados.length}</span>{' '}
          {gruposFiltrados.length === 1 ? 'aluno' : 'alunos'} ·{' '}
          <span className="font-semibold">{resumo.pagamentos}</span>{' '}
          {resumo.pagamentos === 1 ? 'pagamento' : 'pagamentos'} ·{' '}
          <span className="font-semibold">{resumo.comReconhecimento}</span> com vínculo/match ·{' '}
          <span className="font-semibold">{resumo.semReconhecimento}</span> sem reconhecimento ·{' '}
          <span className="font-semibold">{resumo.emDia}</span> em dia ·{' '}
          <span className="font-semibold">{resumo.atrasado}</span> atrasado ·{' '}
          <span className="font-semibold">{resumo.pendente}</span> pendente
        </div>
      ) : null}

      {query.isLoading ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <table className="min-w-full text-left text-sm">
            <tbody>
              <LoadingRow colSpan={7} rows={6} />
            </tbody>
          </table>
        </div>
      ) : secoes.length === 0 ? (
        <EmptyState
          message={
            grupos.length === 0
              ? vinculoFiltro === 'sem_vinculo'
                ? 'Nenhum pagamento sem reconhecimento bancário neste mês.'
                : vinculoFiltro === 'vinculado'
                  ? 'Nenhum pagamento com vínculo ou match automático neste mês.'
                  : 'Nenhum pagamento previsto no Fluxo para esta competência.'
              : 'Nenhum resultado com os filtros atuais.'
          }
        />
      ) : (
        <div className="space-y-6">
          {secoes.map((secao) => (
            <section
              key={chaveSecao(secao.aba, secao.modalidade)}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <header className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {secao.aba}
                  {secao.modalidade && secao.modalidade !== secao.aba ? (
                    <span className="font-normal text-slate-500 dark:text-slate-400">
                      {' '}
                      · {secao.modalidade}
                    </span>
                  ) : null}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {secao.alunos.length}{' '}
                  {secao.alunos.length === 1 ? 'aluno' : 'alunos'} com pagamento previsto
                </p>
              </header>

              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {secao.alunos.map((aluno) => (
                  <div key={`${aluno.aluno_exibicao}|${aluno.aba}|${aluno.modalidade}`}>
                    <div className="bg-white px-4 py-2.5 dark:bg-slate-900">
                      <h3 className="text-sm font-medium text-slate-800 dark:text-slate-100">
                        {aluno.aluno_exibicao}
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="border-y border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                          <tr>
                            <th className="px-4 py-2 font-medium">Data prevista</th>
                            <th className="px-4 py-2 font-medium">Data no banco</th>
                            <th className="px-4 py-2 font-medium">Valor</th>
                            <th className="px-4 py-2 font-medium">Reconhecimento</th>
                            <th className="px-4 py-2 font-medium">Status</th>
                            <th className="px-4 py-2 font-medium">Como pagou</th>
                          </tr>
                        </thead>
                        <tbody>
                          {aluno.pagamentos.map((pag, idx) => (
                            <tr
                              key={`${pag.data_pagamento ?? ''}|${pag.data_banco ?? ''}|${pag.valor}|${idx}`}
                              className="border-b border-slate-50 last:border-0 dark:border-slate-800/60"
                            >
                              <td className="px-4 py-2 tabular-nums text-slate-600 dark:text-slate-300">
                                {pag.data_pagamento ? formatDate(pag.data_pagamento) : '—'}
                              </td>
                              <td className="px-4 py-2 tabular-nums text-slate-600 dark:text-slate-300">
                                {pag.data_banco ? formatDate(pag.data_banco) : '—'}
                              </td>
                              <td className="px-4 py-2 tabular-nums text-slate-700 dark:text-slate-200">
                                {formatBrl(pag.valor)}
                              </td>
                              <td className="px-4 py-2">
                                <span
                                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${bancoStatusBadgeClass(pag.banco_status)}`}
                                >
                                  {BANCO_STATUS_LABEL[pag.banco_status]}
                                </span>
                              </td>
                              <td className="px-4 py-2">
                                <span
                                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusConciliacaoBadgeClass(pag.status_conciliacao)}`}
                                >
                                  {STATUS_CONCILIACAO_LABEL[pag.status_conciliacao]}
                                </span>
                              </td>
                              <td className="px-4 py-2">
                                <span
                                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${meioBadgeClass(pag.meio)}`}
                                >
                                  {MEIO_LABEL[pag.meio]}
                                </span>
                                {pag.banco_status === 'nenhum' && pag.meio === 'desconhecido' ? (
                                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                    Meio será confirmado após reconhecer o crédito no banco.
                                  </p>
                                ) : null}
                                {pag.aviso_competencia ? (
                                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                                    {pag.aviso_competencia}
                                  </p>
                                ) : null}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
