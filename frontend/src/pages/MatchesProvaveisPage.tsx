import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '../app/Topbar';
import { useMonthYear } from '../context/MonthYearContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../auth/AuthContext';
import { EmptyState, ErrorPanel } from '../components/finance/StateBlocks';
import { formatBrl, formatDate } from '../components/finance/classificacao/utils';
import {
  podeConfirmarIndividualmente,
  rotuloGrupoMatch,
} from '../logic/matchesProvaveisView';
import {
  aplicarMatchesProvaveisSeguros,
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
  const auth = useAuth();
  const [filtroStatus, setFiltroStatus] = useState<
    'todos' | 'seguro' | 'medio' | 'ambiguo' | 'sem_candidato'
  >('todos');
  const [filtroAtividade, setFiltroAtividade] = useState<'todos' | 'ativos' | 'inativos'>('todos');
  const [filtroModalidade, setFiltroModalidade] = useState('todas');
  const [confirmandoKey, setConfirmandoKey] = useState<string | null>(null);
  const [confirmarItem, setConfirmarItem] = useState<MatchesProvaveisApiItem | null>(null);
  const [confirmarLote, setConfirmarLote] = useState(false);

  const query = useQuery({
    queryKey: ['matches-provaveis', mes, ano],
    queryFn: () => getMatchesProvaveisMes(mes, ano),
  });

  const confirmar = useMutation({
    mutationFn: async (item: MatchesProvaveisApiItem) => {
      if (!podeConfirmarIndividualmente(item)) {
        throw new Error('Casos ambíguos ou agrupados devem ser revisados na Validação dia a dia.');
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
        { observacao: 'Confirmado manualmente pela análise mensal' },
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

  const aplicarLote = useMutation({
    mutationFn: () => {
      if (!query.data?.analise_id) throw new Error('Analise o mês novamente antes de aplicar.');
      return aplicarMatchesProvaveisSeguros(mes, ano, query.data.analise_id);
    },
    onSuccess: async (result) => {
      setConfirmarLote(false);
      showToast(
        `${result.aplicados} vínculo${result.aplicados === 1 ? '' : 's'} seguro${result.aplicados === 1 ? '' : 's'} aplicado${result.aplicados === 1 ? '' : 's'}.`,
        'success',
      );
      await queryClient.invalidateQueries({ queryKey: ['matches-provaveis', mes, ano] });
      void queryClient.invalidateQueries({ queryKey: ['fluxo-operacional-pagamentos'] });
      void queryClient.invalidateQueries({ queryKey: ['financas-alunos'] });
      void queryClient.invalidateQueries({ queryKey: ['conciliacao-pagamentos'] });
    },
    onError: (e: unknown) => {
      setConfirmarLote(false);
      showToast(e instanceof Error ? e.message : String(e), 'error');
      void query.refetch();
    },
  });

  const diasFiltrados = useMemo(() => {
    const porDia = query.data?.por_dia ?? [];
    return porDia
      .map((d) => ({
        ...d,
        itens: d.itens.filter((i) => {
          if (filtroStatus !== 'todos' && i.grupo_ui !== filtroStatus) return false;
          if (filtroAtividade === 'ativos' && !i.ativo) return false;
          if (filtroAtividade === 'inativos' && i.ativo) return false;
          if (filtroModalidade !== 'todas' && i.modalidade !== filtroModalidade) return false;
          return true;
        }),
      }))
      .filter((d) => d.itens.length > 0);
  }, [query.data?.por_dia, filtroStatus, filtroAtividade, filtroModalidade]);

  const semCandidatoFiltrados = useMemo(
    () =>
      (query.data?.sem_candidato_itens ?? []).filter((item) => {
        if (filtroStatus !== 'todos' && filtroStatus !== 'sem_candidato') return false;
        if (filtroAtividade === 'ativos' && !item.ativo) return false;
        if (filtroAtividade === 'inativos' && item.ativo) return false;
        if (filtroModalidade !== 'todas' && item.modalidade !== filtroModalidade) return false;
        return true;
      }),
    [query.data?.sem_candidato_itens, filtroStatus, filtroAtividade, filtroModalidade],
  );

  const modalidades = useMemo(
    () =>
      [...new Set([
        ...(query.data?.por_dia.flatMap((d) => d.itens.map((i) => i.modalidade)) ?? []),
        ...(query.data?.sem_candidato_itens.map((i) => i.modalidade) ?? []),
      ])].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [query.data],
  );

  const resumo = query.data?.resumo;

  return (
    <div className="space-y-4">
      <Topbar
        title="Matches prováveis"
        subtitle="Sugestões de vínculo banco ↔ Fluxo para revisar e confirmar na Validação"
      />

      <p className="text-sm text-slate-600 dark:text-slate-400 max-w-3xl">
        Analise a competência inteira antes de confirmar. O sistema preserva vínculos existentes,
        separa casos seguros dos que precisam de revisão e nunca escolhe sozinho quando há ambiguidade.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
          className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-50 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200"
        >
          {query.isFetching ? 'Analisando…' : 'Analisar mês'}
        </button>
        {auth.role === 'admin' && (resumo?.seguro ?? 0) > 0 ? (
          <button
            type="button"
            onClick={() => setConfirmarLote(true)}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            Vincular casos seguros ({resumo?.seguro ?? 0})
          </button>
        ) : null}
        <Link
          to="/validacao-pagamentos-diaria"
          className="ml-auto text-xs font-medium text-sky-700 hover:underline dark:text-sky-300"
        >
          Abrir Validação dia a dia
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-500">Status:</span>
        {(
          [
            { id: 'todos' as const, label: 'Todos' },
            { id: 'seguro' as const, label: 'Seguros' },
            { id: 'medio' as const, label: 'Precisam confirmar' },
            { id: 'ambiguo' as const, label: 'Ambíguos' },
            { id: 'sem_candidato' as const, label: 'Não encontrados' },
          ] as const
        ).map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setFiltroStatus(opt.id)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
              filtroStatus === opt.id
                ? 'border-slate-800 bg-slate-800 text-white dark:border-slate-200 dark:bg-slate-200 dark:text-slate-900'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200'
            }`}
          >
            {opt.label}
          </button>
        ))}
        <select
          value={filtroAtividade}
          onChange={(e) => setFiltroAtividade(e.target.value as typeof filtroAtividade)}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-900"
        >
          <option value="todos">Ativos e inativos</option>
          <option value="ativos">Somente ativos</option>
          <option value="inativos">Somente inativos</option>
        </select>
        <select
          value={filtroModalidade}
          onChange={(e) => setFiltroModalidade(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-900"
        >
          <option value="todas">Todas as modalidades</option>
          {modalidades.map((modalidade) => (
            <option key={modalidade} value={modalidade}>
              {modalidade}
            </option>
          ))}
        </select>
      </div>

      {resumo ? (
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60">
            Já reconhecidos: <b>{resumo.ja_reconhecidos}</b>
          </span>
          {[
            { id: 'seguro' as const, label: 'Seguros para vincular', valor: resumo.seguro, cls: 'border-emerald-200 bg-emerald-50 text-emerald-900' },
            { id: 'medio' as const, label: 'Precisam confirmar', valor: resumo.precisa_confirmar, cls: 'border-amber-200 bg-amber-50 text-amber-950' },
            { id: 'ambiguo' as const, label: 'Ambíguos', valor: resumo.ambiguo, cls: 'border-rose-200 bg-rose-50 text-rose-900' },
            { id: 'sem_candidato' as const, label: 'Não encontrados', valor: resumo.nao_encontrado, cls: 'border-slate-200 bg-white' },
          ].map((card) => (
            <button
              type="button"
              key={card.id}
              onClick={() => setFiltroStatus(card.id)}
              className={`rounded-lg border px-3 py-2 text-left dark:border-slate-700 dark:bg-slate-900 ${card.cls}`}
            >
              {card.label}: <b>{card.valor}</b>
            </button>
          ))}
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

      {!query.isLoading && !query.isError && diasFiltrados.length === 0 && semCandidatoFiltrados.length === 0 ? (
        <EmptyState message="Nenhum caso encontrado para os filtros selecionados." />
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
                            {rotuloGrupoMatch(item.grupo_ui)}
                            {item.score ? ` · ${Math.round(item.score)}` : ''}
                          </span>
                          {!item.ativo ? (
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              Inativo
                            </span>
                          ) : null}
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
                        {item.grupo_ui === 'ambiguo' && item.candidatos_alternativos.length > 1 ? (
                          <div className="mt-2 rounded-lg border border-rose-100 bg-rose-50/60 p-2 text-[11px] text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200">
                            <p className="font-semibold">Candidatos encontrados:</p>
                            {item.candidatos_alternativos.map((candidato) => (
                              <p key={candidato.banco_id}>
                                {candidato.pessoa_banco || 'Sem identificação'} ·{' '}
                                {formatBrl(candidato.valor_banco)} · {formatDate(candidato.data_banco)}
                              </p>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Link
                          to={linkValidacaoDia(item)}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                        >
                          Ir ao dia
                        </Link>
                        {podeConfirmarIndividualmente(item) ? (
                          <button
                            type="button"
                            disabled={confirmandoKey === key || confirmar.isPending}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                            onClick={() => {
                              setConfirmandoKey(key);
                              setConfirmarItem(item);
                            }}
                          >
                            Confirmar
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

      {semCandidatoFiltrados.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Pagamentos não encontrados
          </h2>
          <ul className="space-y-2">
            {semCandidatoFiltrados.map((item) => (
              <li
                key={item.planilha_id}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {item.aluno} · {item.aba} / {item.modalidade}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Fluxo {formatBrl(item.valor_fluxo)} ({item.forma || '—'}) ·{' '}
                      {formatDate(item.data_fluxo)}
                    </p>
                    <p className="text-[11px] text-slate-500">{item.motivo}</p>
                  </div>
                  <Link
                    to={`/validacao-pagamentos-diaria?data=${encodeURIComponent(item.data_fluxo)}&fluxo=${encodeURIComponent(item.planilha_id)}`}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  >
                    Ir ao dia
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {confirmarItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900">
            <h2 className="text-lg font-semibold">Confirmar vínculo</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Confirme {confirmarItem.aluno} com {confirmarItem.pessoa_banco || 'o pagamento bancário'} no
              valor de {formatBrl(confirmarItem.valor_banco)}.
            </p>
            {confirmarItem.grupo_ui === 'medio' ? (
              <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                Este caso exige sua conferência: ele não será incluído no lote automático.
              </p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmarItem(null);
                  setConfirmandoKey(null);
                }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={confirmar.isPending}
                onClick={() => {
                  confirmar.mutate(confirmarItem, { onSuccess: () => setConfirmarItem(null) });
                }}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {confirmar.isPending ? 'Confirmando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmarLote ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900">
            <h2 className="text-lg font-semibold">Vincular casos seguros</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              O sistema recalculará todos os candidatos e tentará vincular somente os{' '}
              <strong>{resumo?.seguro ?? 0} casos 1:1 seguros</strong>. Casos alterados, ambíguos ou já
              usados serão ignorados.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmarLote(false)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={aplicarLote.isPending}
                onClick={() => aplicarLote.mutate()}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {aplicarLote.isPending ? 'Revalidando…' : 'Confirmar lote seguro'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
