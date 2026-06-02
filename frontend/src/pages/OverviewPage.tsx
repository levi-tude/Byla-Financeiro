import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Topbar } from '../app/Topbar';
import { KpiCard } from '../components/ui/KpiCard';
import { MonthlyTrendChart } from '../components/charts/MonthlyTrendChart';
import { BarChartAtividade } from '../components/charts/BarChartAtividade';
import { ApiErrorPanel } from '../components/ui/ApiErrorPanel';
import { useResumoMensal } from '../hooks/useResumoMensal';
import { useMonthYear } from '../context/MonthYearContext';
import {
  getControleCaixa,
  getFluxoOperacionalAlunos,
  getFluxoOperacionalPagamentos,
  getTransacoesPorMes,
} from '../services/backendApi';
import {
  computeFluxoOperacionalResumo,
  controleToTrendPoint,
  formatBrl,
  formatDeltaBrl,
  formatPct,
  formatPctChange,
  labelMesAno,
  lastNMonths,
  mesExtenso,
  previousMonth,
  resolveModalityLabel,
  resumoToTrendPoint,
} from '../logic/overviewDashboard';
import { buildReceitaPorAbaModalidade } from '../fluxo/fluxoAbaHierarchy';
import { SourceLegend } from '../components/overview/SourceLegend';
import { OverviewSection } from '../components/overview/OverviewSection';
import { OverviewChartShell, OVERVIEW_CHART_MIN_H } from '../components/overview/OverviewChartShell';
import { ModalityRevenueDrilldownChart } from '../components/overview/ModalityRevenueDrilldownChart';
import { ModalityRevenueLegend } from '../components/overview/ModalityRevenueLegend';
import { BankReconciliationCard } from '../components/overview/BankReconciliationCard';
import { FilterBar } from '../components/finance/FilterBar';
import { MonthYearPicker } from '../components/ui/MonthYearPicker';
import { getDespesas } from '../services/backendApi';

function trendFromDelta(current: number | null, prev: number | null): 'up' | 'down' | 'neutral' {
  if (current == null || prev == null) return 'neutral';
  if (current > prev) return 'up';
  if (current < prev) return 'down';
  return 'neutral';
}

type QuickActionProps = {
  to: string;
  title: string;
  description: string;
  borderClass: string;
  bgClass: string;
  titleClass: string;
};

function QuickActionCardColored({ to, title, description, borderClass, bgClass, titleClass }: QuickActionProps) {
  return (
    <Link
      to={to}
      className={`rounded-xl border p-4 shadow-sm transition hover:shadow-md focus-visible:outline focus-visible:ring-2 focus-visible:ring-indigo-400 ${borderClass} ${bgClass}`}
    >
      <h2 className={`text-sm font-semibold ${titleClass}`}>{title}</h2>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{description}</p>
    </Link>
  );
}

export function OverviewPage() {
  const { monthYear } = useMonthYear();
  const { mes, ano } = monthYear;
  const prev = previousMonth(mes, ano);
  const historyMonths = useMemo(() => lastNMonths(mes, ano, 6), [mes, ano]);

  const { resumoMensal, isLoading: resumoLoading, error: resumoError } = useResumoMensal();

  const controleQuery = useQuery({
    queryKey: ['overview-controle-caixa', mes, ano],
    queryFn: () => getControleCaixa(mes, ano),
  });

  const despesasQuery = useQuery({
    queryKey: ['overview-despesas-categorias', mes, ano],
    queryFn: () => getDespesas(mes, ano),
  });

  const controlePrevQuery = useQuery({
    queryKey: ['overview-controle-caixa', prev.mes, prev.ano],
    queryFn: () => getControleCaixa(prev.mes, prev.ano),
  });

  const controleHistoryQueries = useQueries({
    queries: historyMonths.map(({ mes: m, ano: a }) => ({
      queryKey: ['overview-controle-caixa', m, a],
      queryFn: () => getControleCaixa(m, a),
    })),
  });

  const fluxoAlunosQuery = useQuery({
    queryKey: ['overview-fluxo-alunos'],
    queryFn: () => getFluxoOperacionalAlunos({ ativo: true, limit: 2500 }),
  });

  const fluxoPagQuery = useQuery({
    queryKey: ['overview-fluxo-pagamentos', mes, ano],
    queryFn: () => getFluxoOperacionalPagamentos({ mes, ano, limit: 1000 }),
  });

  const transacoesEntradaQuery = useQuery({
    queryKey: ['overview-transacoes-entrada', mes, ano],
    queryFn: () => getTransacoesPorMes(mes, ano, 'entrada'),
  });

  const transacoesSaidaQuery = useQuery({
    queryKey: ['overview-transacoes-saida', mes, ano],
    queryFn: () => getTransacoesPorMes(mes, ano, 'saida'),
  });

  const controle = controleQuery.data;
  const controlePrev = controlePrevQuery.data;

  const entrada = controle?.totais.entradaTotal ?? null;
  const saida = controle?.totais.saidaTotal ?? null;
  const lucro = controle?.totais.lucroTotal ?? null;

  const entradaPrev = controlePrev?.totais.entradaTotal ?? null;
  const saidaPrev = controlePrev?.totais.saidaTotal ?? null;
  const lucroPrev = controlePrev?.totais.lucroTotal ?? null;

  const fluxoResumo = useMemo(() => {
    const alunos = fluxoAlunosQuery.data?.itens ?? [];
    const pagamentos = fluxoPagQuery.data?.itens ?? [];
    return computeFluxoOperacionalResumo(alunos, pagamentos, mes, ano);
  }, [fluxoAlunosQuery.data, fluxoPagQuery.data, mes, ano]);

  const receitaDrilldown = useMemo(
    () =>
      buildReceitaPorAbaModalidade(
        fluxoPagQuery.data?.itens ?? [],
        mes,
        ano,
        resolveModalityLabel,
      ),
    [fluxoPagQuery.data?.itens, mes, ano],
  );
  const topAbaInsight = useMemo(() => {
    const leader = [...receitaDrilldown.abas].sort((a, b) => b.value - a.value)[0];
    if (!leader || leader.pctMes <= 0) return null;
    return `${leader.aba} concentra ${formatPct(leader.pctMes)} das mensalidades recebidas no mês.`;
  }, [receitaDrilldown.abas]);

  const somaExtratoEntradas = useMemo(() => {
    const itens = transacoesEntradaQuery.data?.itens ?? [];
    return itens.reduce((acc, r) => acc + Number(r.valor || 0), 0);
  }, [transacoesEntradaQuery.data]);

  const somaExtratoSaidas = useMemo(() => {
    const itens = transacoesSaidaQuery.data?.itens ?? [];
    return itens.reduce((acc, r) => acc + Number(r.valor || 0), 0);
  }, [transacoesSaidaQuery.data]);

  const diffExtratoEntradas =
    entrada != null && transacoesEntradaQuery.isSuccess ? entrada - somaExtratoEntradas : null;
  const diffExtratoSaidas =
    saida != null && transacoesSaidaQuery.isSuccess ? saida - somaExtratoSaidas : null;
  const hasExtratoDiff =
    (diffExtratoEntradas != null && Math.abs(diffExtratoEntradas) > 0) ||
    (diffExtratoSaidas != null && Math.abs(diffExtratoSaidas) > 0);

  const controleHistoryComplete = controleHistoryQueries.every((q) => q.isSuccess && q.data != null);

  const { trendData, trendUsesExtrato } = useMemo(() => {
    if (controleHistoryComplete) {
      return {
        trendData: historyMonths.map((ma, i) =>
          controleToTrendPoint(ma.mes, ma.ano, controleHistoryQueries[i].data),
        ),
        trendUsesExtrato: false,
      };
    }
    const byKey = new Map(resumoMensal.map((r) => [`${r.ano}-${r.mes}`, r]));
    const fromResumo = historyMonths
      .map((ma) => byKey.get(`${ma.ano}-${ma.mes}`))
      .filter((r): r is NonNullable<typeof r> => r != null)
      .map(resumoToTrendPoint);
    return { trendData: fromResumo, trendUsesExtrato: true };
  }, [controleHistoryComplete, historyMonths, controleHistoryQueries, resumoMensal]);

  const trendLoading =
    controleHistoryQueries.some((q) => q.isLoading) || (trendUsesExtrato && resumoLoading);

  const lucroBarData = useMemo(
    () => trendData.map((row) => ({ name: row.label, value: row.saldoMes })),
    [trendData],
  );

  const selectedMonthLabel = labelMesAno(mes, ano);

  const kpiLoading = controleQuery.isLoading || controlePrevQuery.isLoading;
  const fluxoLoading = fluxoAlunosQuery.isLoading || fluxoPagQuery.isLoading;

  const periodoLabel = mesExtenso(mes, ano);
  const prevLabel = mesExtenso(prev.mes, prev.ano);
  const relatorioHref = `/relatorios-ia?tipo=mensal_operacional&mes=${mes}&ano=${ano}`;

  const saudavel =
    lucro != null && lucroPrev != null ? lucro > 0 && lucro >= lucroPrev : lucro != null && lucro > 0;

  const hasOperacaoItens =
    fluxoResumo.semPagamentoNoMes > 0 ||
    fluxoResumo.pendenciasCadastro > 0 ||
    fluxoResumo.vencimentoHoje > 0;

  return (
    <div className="p-6 space-y-10 min-h-0 max-w-7xl mx-auto">
      <Topbar
        title="Visão geral"
        subtitle={periodoLabel}
        childrenRight={
          <Link
            to={relatorioHref}
            className="rounded-lg border border-rose-300 bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 dark:border-rose-700 dark:bg-rose-700 dark:hover:bg-rose-600"
          >
            Relatório IA do mês
          </Link>
        }
      />

      <SourceLegend />

      <FilterBar
        title="Contexto do mês"
        subtitle="KPIs, alertas e saídas por categoria usam o mês selecionado abaixo (ou o seletor global no topo)."
        periodLabel={periodoLabel}
      >
        <MonthYearPicker />
      </FilterBar>

      {resumoError && trendUsesExtrato && (
        <ApiErrorPanel
          message="Não foi possível carregar o histórico pelo extrato."
          technical={resumoError.message}
        />
      )}

      {controleQuery.error && (
        <ApiErrorPanel
          message="Não foi possível carregar o fechamento deste mês. Abra o Controle de caixa para conferir os números."
          technical={
            controleQuery.error instanceof Error ? controleQuery.error.message : String(controleQuery.error)
          }
        />
      )}

      <OverviewSection
        title="Painel executivo do mês"
        whatIs="Primeira dobra para fechamento: até 6 KPIs comparados com mês anterior e alertas com ação direta."
        source="fechamento"
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <KpiCard
            label="Entradas (fechamento)"
            value={kpiLoading ? '…' : formatBrl(entrada)}
            helperText={
              !kpiLoading && entradaPrev != null
                ? `vs ${prevLabel}: ${formatPctChange(entrada, entradaPrev) ?? '—'}`
                : undefined
            }
            trend={trendFromDelta(entrada, entradaPrev)}
            accentColor="primary"
            isLoading={kpiLoading}
            ctaTo="/controle-caixa"
            ctaLabel="Ver fechamento"
          />
          <KpiCard
            label="Saídas (fechamento)"
            value={kpiLoading ? '…' : formatBrl(saida)}
            helperText={
              !kpiLoading && saidaPrev != null
                ? `vs ${prevLabel}: ${formatPctChange(saida, saidaPrev) ?? '—'}`
                : undefined
            }
            trend={trendFromDelta(saida, saidaPrev) === 'up' ? 'down' : trendFromDelta(saida, saidaPrev)}
            accentColor="danger"
            isLoading={kpiLoading}
            ctaTo="/controle-caixa"
            ctaLabel="Analisar saídas"
          />
          <KpiCard
            label="Lucro (fechamento)"
            value={kpiLoading ? '…' : formatBrl(lucro)}
            helperText={
              !kpiLoading && lucroPrev != null
                ? `vs ${prevLabel}: ${formatDeltaBrl(lucro, lucroPrev) ?? '—'}`
                : undefined
            }
            trend={trendFromDelta(lucro, lucroPrev)}
            accentColor="success"
            isLoading={kpiLoading}
            ctaTo="/controle-caixa"
            ctaLabel="Ajustar fechamento"
          />
          <KpiCard
            label="Sem pagamento no mês"
            value={fluxoLoading ? '…' : String(fluxoResumo.semPagamentoNoMes)}
            helperText={`competência ${labelMesAno(mes, ano)}`}
            trend={fluxoResumo.semPagamentoNoMes > 0 ? 'down' : 'neutral'}
            accentColor="danger"
            isLoading={fluxoLoading}
            ctaTo="/fluxo-caixa"
            ctaLabel="Abrir Fluxo"
          />
          <KpiCard
            label="Pendências de cadastro"
            value={fluxoLoading ? '…' : String(fluxoResumo.pendenciasCadastro)}
            helperText="alunos com dados incompletos"
            trend={fluxoResumo.pendenciasCadastro > 0 ? 'down' : 'neutral'}
            accentColor="danger"
            isLoading={fluxoLoading}
            ctaTo="/validacao-pagamentos-diaria"
            ctaLabel="Ir para Validação"
          />
          <KpiCard
            label="Diferença extrato × fechamento"
            value={
              transacoesEntradaQuery.isLoading || transacoesSaidaQuery.isLoading
                ? '…'
                : formatBrl((diffExtratoEntradas ?? 0) + (diffExtratoSaidas ?? 0))
            }
            helperText="soma das diferenças de entradas e saídas"
            trend={hasExtratoDiff ? 'down' : 'neutral'}
            accentColor={hasExtratoDiff ? 'danger' : 'success'}
            isLoading={transacoesEntradaQuery.isLoading || transacoesSaidaQuery.isLoading}
            ctaTo="/transacoes"
            ctaLabel="Conferir transações"
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
            <p className="font-semibold">Lucro do mês</p>
            <p className="mt-1 opacity-90">
              {kpiLoading
                ? 'Carregando fechamento...'
                : lucro == null
                  ? 'Fechamento ainda não disponível.'
                  : saudavel
                    ? `Saudável: lucro positivo e igual/maior que ${prevLabel}.`
                    : lucro > 0
                      ? `Atenção: lucro positivo, porém menor que ${prevLabel}.`
                      : 'Crítico: lucro negativo no fechamento.'}
            </p>
            <Link to="/controle-caixa" className="mt-2 inline-block font-semibold hover:underline">
              Abrir Controle de caixa →
            </Link>
          </div>

          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-100">
            <p className="font-semibold">Cobrança do mês</p>
            <p className="mt-1 opacity-90">
              {fluxoLoading
                ? 'Carregando dados operacionais...'
                : fluxoResumo.semPagamentoNoMes > 0
                  ? `${fluxoResumo.semPagamentoNoMes} aluno(s) sem pagamento em ${labelMesAno(mes, ano)}.`
                  : 'Sem atraso de pagamento detectado no mês.'}
            </p>
            <Link to="/fluxo-caixa" className="mt-2 inline-block font-semibold hover:underline">
              Ir para Fluxo de caixa →
            </Link>
          </div>

          <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-100">
            <p className="font-semibold">Conferência com extrato</p>
            <p className="mt-1 opacity-90">
              {transacoesEntradaQuery.isLoading || transacoesSaidaQuery.isLoading
                ? 'Carregando conciliação...'
                : hasExtratoDiff
                  ? 'Existe diferença entre extrato e fechamento. Priorize conferência do dia.'
                  : 'Sem diferença relevante entre extrato e fechamento.'}
            </p>
            <Link to="/transacoes" className="mt-2 inline-block font-semibold hover:underline">
              Conferir em Transações →
            </Link>
          </div>
        </div>
      </OverviewSection>

      <OverviewSection
        title="Saídas por categoria"
        whatIs="Resumo das despesas do mês agrupadas por categoria (extrato/saídas lançadas)."
        source="extrato"
      >
        {despesasQuery.isLoading ? (
          <p className="text-sm text-slate-500">Carregando categorias de saída…</p>
        ) : despesasQuery.error ? (
          <p className="text-sm text-rose-700">Não foi possível carregar saídas por categoria.</p>
        ) : (despesasQuery.data?.resumo.por_categoria.length ?? 0) === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma saída categorizada neste mês.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {despesasQuery.data!.resumo.por_categoria.slice(0, 9).map((row) => (
              <div
                key={row.categoria}
                className="rounded-lg border border-rose-200/80 bg-rose-50/50 px-3 py-2 dark:border-rose-900/40 dark:bg-rose-950/30"
              >
                <p className="text-xs font-semibold text-rose-900 dark:text-rose-100 truncate">{row.categoria}</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums text-rose-950 dark:text-rose-50">{formatBrl(row.total)}</p>
                <p className="text-[11px] text-rose-800/80 dark:text-rose-200/80">{row.qtd} lançamento(s)</p>
              </div>
            ))}
          </div>
        )}
        <Link to="/transacoes" className="mt-3 inline-block text-xs font-semibold text-indigo-700 hover:underline dark:text-indigo-300">
          Ver saídas em Transações →
        </Link>
      </OverviewSection>

      <OverviewSection
        title="Conferência com o extrato"
        whatIs="Cruza entradas e saídas do extrato bancário com o fechamento do mesmo mês."
        source="extrato"
      >
        <BankReconciliationCard
          entradas={{
            extrato: transacoesEntradaQuery.isSuccess ? somaExtratoEntradas : null,
            fechamento: entrada,
            diff: diffExtratoEntradas,
          }}
          saidas={{
            extrato: transacoesSaidaQuery.isSuccess ? somaExtratoSaidas : null,
            fechamento: saida,
            diff: diffExtratoSaidas,
          }}
        />
      </OverviewSection>

      <OverviewSection
        title="Tendência do fechamento"
        whatIs="Últimos 6 meses: fluxo de entradas e saídas e evolução do lucro mês a mês."
        source={trendUsesExtrato ? 'extrato' : 'fechamento'}
      >
        <details className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900" open={false}>
          <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-100">
            Ver gráficos de tendência (secundário)
          </summary>
          <div className="mt-4 space-y-4">
            {trendUsesExtrato ? (
              <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-100">
                Fechamento indisponível em parte do período — gráficos com base no extrato bancário (resumo).
              </p>
            ) : null}
            <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
              <OverviewChartShell
                title="Entradas × saídas — últimos 6 meses"
                isLoading={trendLoading}
                chartHeight={OVERVIEW_CHART_MIN_H}
              >
                <MonthlyTrendChart
                  data={trendData}
                  showLucroLine={false}
                  showSeriesChips
                  height={OVERVIEW_CHART_MIN_H}
                />
              </OverviewChartShell>
              <OverviewChartShell
                title="Lucro mês a mês (objetivo: crescer todo mês)"
                subtitle="Sem meta fixa de receita"
                isLoading={trendLoading}
                chartHeight={OVERVIEW_CHART_MIN_H}
              >
                <BarChartAtividade
                  data={lucroBarData}
                  valueLabel="Lucro"
                  barColor="#16a34a"
                  highlightLabel={selectedMonthLabel}
                  height={OVERVIEW_CHART_MIN_H}
                />
              </OverviewChartShell>
            </div>
          </div>
        </details>
      </OverviewSection>

      {/* Operação Fluxo */}
      <OverviewSection
        title="Operação — Fluxo de caixa"
        whatIs="Cobranças e cadastro dos alunos no mês — independente do fechamento financeiro."
        source="fluxo"
      >
        {fluxoLoading ? (
          <p className="text-sm text-slate-500">Carregando operação…</p>
        ) : !hasOperacaoItens ? (
          <p className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
            Nenhuma pendência operacional automática para este mês.
          </p>
        ) : (
          <ul className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:divide-slate-800">
            {fluxoResumo.semPagamentoNoMes > 0 && (
              <li className="px-4 py-3 text-sm">
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {fluxoResumo.semPagamentoNoMes} aluno(s) ativo(s) sem pagamento na competência {labelMesAno(mes, ano)}
                </span>
              </li>
            )}
            {fluxoResumo.pendenciasCadastro > 0 && (
              <li className="px-4 py-3 text-sm">
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {fluxoResumo.pendenciasCadastro} cadastro(s) com campo(s) em falta
                </span>
              </li>
            )}
            {fluxoResumo.vencimentoHoje > 0 && (
              <li className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                {fluxoResumo.vencimentoHoje} vencimento(s) hoje — priorize cobrança
              </li>
            )}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <Link
            to="/fluxo-caixa"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Abrir Fluxo de caixa
          </Link>
          <Link
            to="/validacao-pagamentos-diaria"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            Validação de pagamentos
          </Link>
        </div>
      </OverviewSection>

      <OverviewSection
        title="Mensalidades recebidas por modalidade"
        whatIs={`Pagamentos no Fluxo com competência ${labelMesAno(mes, ano)} — não são as entradas do fechamento.`}
        source="fluxo"
      >
        <details className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900" open={false}>
          <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-100">
            Ver detalhamento por modalidade (secundário)
          </summary>
          <div className="mt-4 space-y-3">
            {topAbaInsight ? (
              <p className="rounded-lg border border-emerald-100 bg-emerald-50/80 px-4 py-2.5 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
                {topAbaInsight}
              </p>
            ) : null}
            <ModalityRevenueDrilldownChart key={`${mes}-${ano}`} data={receitaDrilldown} isLoading={fluxoLoading} />
            <ModalityRevenueLegend mesAnoLabel={labelMesAno(mes, ano)} />
          </div>
        </details>
      </OverviewSection>

      {/* Ações rápidas */}
      <section aria-label="Ações rápidas" className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Ações rápidas</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">Atalhos para as telas que você mais usa no dia a dia.</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <QuickActionCardColored
            to="/fluxo-caixa"
            title="Fluxo de caixa"
            description="Alunos, pagamentos e cobranças."
            borderClass="border-indigo-200 dark:border-indigo-800/60"
            bgClass="bg-indigo-50/90 dark:bg-indigo-950/35"
            titleClass="text-indigo-950 dark:text-indigo-100"
          />
          <QuickActionCardColored
            to="/validacao-pagamentos-diaria"
            title="Validação de pagamentos"
            description="Conferir dia × extrato."
            borderClass="border-emerald-200 dark:border-emerald-800/60"
            bgClass="bg-emerald-50/90 dark:bg-emerald-950/35"
            titleClass="text-emerald-950 dark:text-emerald-100"
          />
          <QuickActionCardColored
            to="/transacoes"
            title="Transações"
            description="Entradas e saídas do banco."
            borderClass="border-rose-200 dark:border-rose-800/60"
            bgClass="bg-rose-50/90 dark:bg-rose-950/35"
            titleClass="text-rose-950 dark:text-rose-100"
          />
        </div>
      </section>
    </div>
  );
}
