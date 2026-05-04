import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTheme } from '../../context/ThemeContext';

export type DailyFlowPoint = {
  /** ISO date yyyy-mm-dd */
  dataIso: string;
  /** Day of month for X axis (01–31) */
  dia: string;
  entradas: number;
  saidas: number;
};

export interface TransacoesDailyFlowChartProps {
  data: DailyFlowPoint[];
  isLoading?: boolean;
  /** Shown in empty state, e.g. "Nenhum dia com movimento para os filtros atuais." */
  emptyMessage?: string;
}

function formatCurrencyFull(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Eixo Y compacto (padrão fintech: k / M sem poluir o eixo). */
function formatAxisTick(value: number): string {
  const v = Math.abs(value);
  if (v >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`;
  }
  if (v >= 1000) {
    return `${(value / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`;
  }
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

type TooltipRow = {
  dataKey: string;
  name: string;
  value: number | string;
  color: string;
  payload: DailyFlowPoint;
};

function DailyFlowTooltip({
  active,
  payload,
  isDark,
}: {
  active?: boolean;
  payload?: TooltipRow[];
  isDark: boolean;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  const dateLabel = new Date(`${row.dataIso}T12:00:00`).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const saldoDia = Number(row.entradas || 0) - Number(row.saidas || 0);
  const saldoClass =
    saldoDia >= 0
      ? isDark
        ? 'text-emerald-400'
        : 'text-emerald-700'
      : isDark
        ? 'text-rose-400'
        : 'text-rose-700';

  const panel = isDark
    ? 'rounded-xl border border-slate-600/80 bg-slate-950/95 px-3.5 py-3 text-slate-100 shadow-2xl ring-1 ring-white/5 backdrop-blur-sm'
    : 'rounded-xl border border-slate-200/90 bg-white px-3.5 py-3 text-slate-900 shadow-xl ring-1 ring-slate-900/[0.04]';

  return (
    <div className={`min-w-[220px] max-w-[280px] text-sm ${panel}`}>
      <p className="mb-2.5 border-b border-slate-200/80 pb-2 text-xs font-medium capitalize leading-snug text-slate-500 dark:border-slate-600/80 dark:text-slate-400">
        {dateLabel}
      </p>
      <dl className="space-y-2">
        {payload.map((p) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-6">
            <dt className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: p.color }} aria-hidden />
              <span>{p.name}</span>
            </dt>
            <dd className="tabular-nums text-right font-semibold tracking-tight">
              {formatCurrencyFull(Number(p.value))}
            </dd>
          </div>
        ))}
      </dl>
      <p className={`mt-2.5 border-t border-slate-200/80 pt-2 text-xs font-medium tabular-nums dark:border-slate-600/80 ${saldoClass}`}>
        Saldo do dia: {formatCurrencyFull(saldoDia)}
      </p>
    </div>
  );
}

export function TransacoesDailyFlowChart({
  data,
  isLoading,
  emptyMessage = 'Nenhum dia com movimento para o período ou filtros atuais.',
}: TransacoesDailyFlowChartProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const gridStroke = isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.35)';
  const axisStroke = isDark ? '#64748b' : '#94a3b8';
  const tickFill = isDark ? '#94a3b8' : '#64748b';

  const fillEntrada = isDark ? '#34d399' : '#059669';
  const fillSaida = isDark ? '#fb7185' : '#e11d48';

  const xInterval = data.length > 18 ? Math.max(0, Math.floor((data.length - 1) / 14)) : 0;

  if (isLoading) {
    return (
      <div
        className="flex h-80 flex-col justify-center gap-3 rounded-xl border border-slate-200/80 bg-gradient-to-b from-slate-50 to-white px-4 dark:border-slate-700 dark:from-slate-900/50 dark:to-slate-950"
        role="status"
        aria-busy="true"
        aria-label="Carregando gráfico"
      >
        <div className="mx-auto h-2 w-3/5 max-w-xs animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
        <div className="mx-auto h-40 w-full max-w-md animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/80" />
        <div className="mx-auto h-2 w-2/5 max-w-[180px] animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
      </div>
    );
  }

  if (!data.length) {
    return (
      <div
        className="flex h-80 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-6 text-center dark:border-slate-700 dark:bg-slate-900/40"
        role="img"
        aria-label="Gráfico sem dados"
      >
        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Sem dados para exibir</span>
        <span className="max-w-sm text-xs leading-relaxed text-slate-500 dark:text-slate-400">{emptyMessage}</span>
      </div>
    );
  }

  const labelFill = isDark ? '#cbd5e1' : '#475569';
  const chipEntrada = isDark
    ? 'border-emerald-500/40 bg-emerald-950/60 text-emerald-100'
    : 'border-emerald-200 bg-emerald-50 text-emerald-900';
  const chipSaida = isDark
    ? 'border-rose-500/40 bg-rose-950/50 text-rose-100'
    : 'border-rose-200 bg-rose-50 text-rose-900';

  return (
    <figure className="space-y-2" aria-labelledby="transacoes-daily-chart-title">
      <figcaption id="transacoes-daily-chart-title" className="sr-only">
        Gráfico de barras agrupadas: entradas e saídas por dia do mês
      </figcaption>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1 text-xs leading-snug text-slate-600 dark:text-slate-400">
          <p>
            <span className="font-semibold text-slate-800 dark:text-slate-200">Eixo horizontal (X):</span>{' '}
            dia civil no mês (01 a 31).
          </p>
          <p>
            <span className="font-semibold text-slate-800 dark:text-slate-200">Eixo vertical (Y):</span>{' '}
            valor em reais; rótulos curtos — <span className="tabular-nums">k</span> = milhares,{' '}
            <span className="tabular-nums">M</span> = milhões.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2.5 sm:justify-end" role="group" aria-label="Legenda das séries">
          <div
            className={`inline-flex items-center gap-2.5 rounded-lg border px-3 py-2 shadow-sm ${chipEntrada}`}
          >
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-sm shadow-sm ring-1 ring-black/5 dark:ring-white/10"
              style={{ backgroundColor: fillEntrada }}
              aria-hidden
            />
            <span className="text-sm font-semibold tracking-tight">Entradas</span>
            <span className="hidden text-[11px] font-normal opacity-90 sm:inline">recebido no dia</span>
          </div>
          <div
            className={`inline-flex items-center gap-2.5 rounded-lg border px-3 py-2 shadow-sm ${chipSaida}`}
          >
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-sm shadow-sm ring-1 ring-black/5 dark:ring-white/10"
              style={{ backgroundColor: fillSaida }}
              aria-hidden
            />
            <span className="text-sm font-semibold tracking-tight">Saídas</span>
            <span className="hidden text-[11px] font-normal opacity-90 sm:inline">pago no dia</span>
          </div>
        </div>
      </div>

      <div className="h-80 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 10, right: 10, left: 4, bottom: 36 }}
            barCategoryGap="18%"
            barGap={4}
          >
            <CartesianGrid strokeDasharray="4 4" stroke={gridStroke} vertical={false} />
            <XAxis
              dataKey="dia"
              tick={{ fontSize: 11, fill: tickFill }}
              tickLine={false}
              axisLine={{ stroke: axisStroke }}
              interval={xInterval}
              tickMargin={8}
              label={{
                value: 'Dia do mês (eixo X)',
                position: 'insideBottom',
                offset: -4,
                fill: labelFill,
                fontSize: 12,
                fontWeight: 600,
              }}
            />
            <YAxis
              tickFormatter={(v) => `R$ ${formatAxisTick(v)}`}
              tick={{ fontSize: 11, fill: tickFill }}
              tickLine={false}
              axisLine={{ stroke: axisStroke }}
              width={58}
              domain={[0, 'auto']}
              label={{
                value: 'Valor (R$) — eixo Y',
                angle: -90,
                position: 'insideLeft',
                offset: 2,
                fill: labelFill,
                fontSize: 11,
                fontWeight: 600,
                style: { textAnchor: 'middle' },
              }}
            />
            <Tooltip
              cursor={{ fill: isDark ? 'rgba(148, 163, 184, 0.06)' : 'rgba(15, 23, 42, 0.04)' }}
              content={<DailyFlowTooltip isDark={isDark} />}
              wrapperStyle={{ outline: 'none' }}
            />
            <Bar
              dataKey="entradas"
              name="Entradas"
              fill={fillEntrada}
              radius={[4, 4, 0, 0]}
              maxBarSize={48}
              isAnimationActive
              animationDuration={450}
              animationEasing="ease-out"
            />
            <Bar
              dataKey="saidas"
              name="Saídas"
              fill={fillSaida}
              radius={[4, 4, 0, 0]}
              maxBarSize={48}
              isAnimationActive
              animationDuration={450}
              animationEasing="ease-out"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
