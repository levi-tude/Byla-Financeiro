import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '../app/Topbar';
import { useMonthYear } from '../context/MonthYearContext';
import { useToast } from '../context/ToastContext';
import { EmptyState, ErrorPanel } from '../components/finance/StateBlocks';
import { formatBrl, formatDate } from '../components/finance/classificacao/utils';
import {
  createValidacaoVinculo,
  getMatchesProvaveisMes,
  type MatchesProvaveisApiItem,
} from '../services/backendApi';

function bucketBadgeClass(bucket: 'alto' | 'medio'): string {
  if (bucket === 'alto') {
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200';
  }
  return 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200';
}

function linkValidacaoDia(item: MatchesProvaveisApiItem): string {
  const q = new URLSearchParams({
    data: item.data_fluxo,
    banco: item.banco_id,
    fluxo: item.planilha_ids[0] ?? '',
  });
  return `/validacao-pagamentos-diaria?${q.toString()}`;
}

export function MatchesProvaveisPage() {
  const { monthYear } = useMonthYear();
  const { mes, ano } = monthYear;
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [filtroBucket, setFiltroBucket] = useState<'todos' | 'alto' | 'medio'>('todos');
  const [confirmandoKey, setConfirmandoKey] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['matches-provaveis', mes, ano],
    queryFn: () => getMatchesProvaveisMes(mes, ano),
  });

  const confirmar = useMutation({
    mutationFn: async (item: MatchesProvaveisApiItem) => {
      if (!item.pode_confirmar) {
        throw new Error('Só é possível confirmar sugestões de alta confiança e sem ambiguidade.');
      }
      // Mesmo padrão da Validação dia a dia: mes/ano do calendário da data_fluxo
      const mesRef = Number(item.data_fluxo.slice(5, 7));
      const anoRef = Number(item.data_fluxo.slice(0, 4));
      return createValidacaoVinculo(
        item.data_fluxo,
        mesRef,
        anoRef,
        item.banco_id,
        item.planilha_ids,
        { observacao: 'Confirmado pela lista de matches prováveis' },
      );
    },
    onSuccess: async () => {
      showToast('Vínculo confirmado.', 'success');
      await queryClient.invalidateQueries({ queryKey: ['matches-provaveis', mes, ano] });
      void queryClient.invalidateQueries({ queryKey: ['fluxo-operacional-pagamentos'] });
      void queryClient.invalidateQueries({ queryKey: ['cadastro-alunos-resumo'] });
      void queryClient.invalidateQueries({ queryKey: ['financas-alunos'] });
      void queryClient.invalidateQueries({ queryKey: ['conciliacao-pagamentos'] });
    },
    onError: (e: unknown) => {
      showToast(e instanceof Error ? e.message : String(e), 'error');
    },
    onSettled: () => setConfirmandoKey(null),
  });

  const diasFiltrados = useMemo(() => {
    const porDia = query.data?.por_dia ?? [];
    if (filtroBucket === 'todos') return porDia;
    return porDia
      .map((d) => ({
        ...d,
        itens: d.itens.filter((i) => i.bucket === filtroBucket),
      }))
      .filter((d) => d.itens.length > 0);
  }, [query.data?.por_dia, filtroBucket]);

  const resumo = query.data?.resumo;

  return (
    <div className="space-y-4">
      <Topbar
        title="Matches prováveis"
        subtitle="Sugestões de vínculo banco ↔ Fluxo para revisar e confirmar na Validação"
      />

      <p className="text-sm text-slate-600 dark:text-slate-400 max-w-3xl">
        Lista do mês (competência) com confiança alta ou média. Nada é vinculado automaticamente —
        use <strong>Confirmar</strong> só quando a sugestão estiver clara, ou{' '}
        <strong>Ir ao dia</strong> para abrir a Validação com o candidato destacado.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-500">Mostrar:</span>
        {(
          [
            { id: 'todos' as const, label: 'Todos' },
            { id: 'alto' as const, label: 'Alta confiança' },
            { id: 'medio' as const, label: 'Média confiança' },
          ] as const
        ).map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setFiltroBucket(opt.id)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
              filtroBucket === opt.id
                ? 'border-slate-800 bg-slate-800 text-white dark:border-slate-200 dark:bg-slate-200 dark:text-slate-900'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200'
            }`}
          >
            {opt.label}
          </button>
        ))}
        <Link
          to="/validacao-pagamentos-diaria"
          className="ml-auto text-xs font-medium text-sky-700 hover:underline dark:text-sky-300"
        >
          Abrir Validação dia a dia
        </Link>
      </div>

      {resumo ? (
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60">
            Sem vínculo: <b>{resumo.sem_vinculo}</b>
          </span>
          <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
            Alta: <b>{resumo.alto}</b>
          </span>
          <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            Média: <b>{resumo.medio}</b>
          </span>
          <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
            Sem candidato: <b>{resumo.sem_candidato}</b>
          </span>
        </div>
      ) : null}

      {query.isLoading ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/50">
          Carregando sugestões do mês…
        </div>
      ) : null}

      {query.isError ? (
        <ErrorPanel message={query.error instanceof Error ? query.error.message : String(query.error)} />
      ) : null}

      {!query.isLoading && !query.isError && diasFiltrados.length === 0 ? (
        <EmptyState message="Nenhuma sugestão de alta ou média confiança neste mês. Os pagamentos sem candidato aparecem só na Validação dia a dia." />
      ) : null}

      <div className="space-y-6">
        {diasFiltrados.map((dia) => (
          <section key={dia.data_fluxo} className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {formatDate(dia.data_fluxo)}
              <span className="ml-2 font-normal text-slate-500">
                · {dia.itens.length} sugestão{dia.itens.length === 1 ? '' : 'ões'}
              </span>
            </h2>
            <ul className="space-y-2">
              {dia.itens.map((item) => {
                const key = `${item.planilha_ids.join('|')}::${item.banco_id}`;
                return (
                  <li
                    key={key}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${bucketBadgeClass(item.bucket)}`}
                          >
                            {item.confianca}
                            {item.score ? ` · ${Math.round(item.score)}` : ''}
                          </span>
                          {item.n_para_1 ? (
                            <span className="rounded-md bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
                              Vários pagamentos → 1 banco
                            </span>
                          ) : null}
                          {item.ambiguo && !item.n_para_1 ? (
                            <span className="rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
                              Mais de um candidato
                            </span>
                          ) : null}
                        </div>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {item.aluno}
                          <span className="font-normal text-slate-500">
                            {' '}
                            · {item.aba}
                            {item.modalidade && item.modalidade !== item.aba
                              ? ` / ${item.modalidade}`
                              : ''}
                          </span>
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                          Fluxo {formatBrl(item.valor_fluxo)} ({item.forma || '—'})
                          {' → '}
                          Banco {formatBrl(item.valor_banco)}
                          {item.pessoa_banco ? ` · ${item.pessoa_banco}` : ''}
                          {item.data_banco !== item.data_fluxo
                            ? ` · extrato ${formatDate(item.data_banco)}`
                            : ''}
                        </p>
                        {item.motivos.length > 0 ? (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {item.motivos.slice(0, 5).join(' · ')}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Link
                          to={linkValidacaoDia(item)}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                        >
                          Ir ao dia
                        </Link>
                        {item.pode_confirmar ? (
                          <button
                            type="button"
                            disabled={confirmandoKey === key || confirmar.isPending}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                            onClick={() => {
                              setConfirmandoKey(key);
                              confirmar.mutate(item);
                            }}
                          >
                            {confirmandoKey === key ? 'Confirmando…' : 'Confirmar'}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
