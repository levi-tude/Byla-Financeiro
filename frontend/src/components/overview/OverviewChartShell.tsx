import type { ReactNode } from 'react';

export const OVERVIEW_CHART_MIN_H = 288;

export type OverviewChartSource = 'fechamento' | 'extrato' | 'fluxo';

const SOURCE_FOOTER: Record<OverviewChartSource, string> = {
  fechamento: 'Controle de caixa (fechamento)',
  extrato: 'Extrato bancário',
  fluxo: 'Fluxo operacional',
};

type OverviewChartShellProps = {
  title: string;
  subtitle?: string;
  source?: OverviewChartSource;
  footer?: string;
  children: ReactNode;
  isLoading?: boolean;
  /** Altura em px da área do gráfico */
  chartHeight?: number;
};

export function OverviewChartShell({
  title,
  subtitle,
  source,
  footer,
  children,
  isLoading,
  chartHeight = OVERVIEW_CHART_MIN_H,
}: OverviewChartShellProps) {
  const footerText = footer ?? (source ? SOURCE_FOOTER[source] : undefined);

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <header>
        <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
      </header>
      <div className="mt-3 w-full overflow-hidden" style={{ height: chartHeight }}>
        {isLoading ? (
          <div
            className="flex h-full w-full items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800/80"
            aria-busy="true"
            aria-label="Carregando gráfico"
          >
            <span className="text-xs text-slate-400 dark:text-slate-500">Carregando…</span>
          </div>
        ) : (
          children
        )}
      </div>
      {footerText ? (
        <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">{footerText}</p>
      ) : null}
    </article>
  );
}
