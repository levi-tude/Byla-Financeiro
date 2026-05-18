import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, ReferenceLine } from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import { DEFAULT_CHART_HEIGHT } from './chartLayout';

export interface BarChartSerie {
  name: string;
  value: number;
}

interface BarChartAtividadeProps {
  data: BarChartSerie[];
  isLoading?: boolean;
  title?: string;
  valueLabel?: string;
  formatValue?: (v: number) => string;
  barColor?: string;
  highlightLabel?: string;
  height?: number;
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function formatAxisK(value: number): string {
  const v = Math.abs(value);
  if (v >= 1_000_000) return `${(value / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`;
  if (v >= 1000) return `${(value / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}k`;
  return String(value);
}

export function BarChartAtividade({
  data,
  isLoading,
  title,
  valueLabel,
  formatValue,
  barColor = '#16a34a',
  highlightLabel,
  height = DEFAULT_CHART_HEIGHT,
}: BarChartAtividadeProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const gridStroke = isDark ? '#334155' : '#e5e7eb';
  const tickStroke = isDark ? '#94a3b8' : '#6b7280';
  const tooltipStyle = isDark
    ? { borderRadius: 8, border: '1px solid #475569', backgroundColor: '#0f172a', color: '#f1f5f9' }
    : { borderRadius: 8, border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#111827' };

  const fmt = formatValue || formatCurrency;
  const barMuted = isDark ? '#14532d' : '#bbf7d0';
  const barHighlight = barColor;
  const hasNegative = data.some((d) => d.value < 0);

  if (isLoading) {
    return (
      <div
        className="flex w-full items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800/80 animate-pulse"
        style={{ height }}
      >
        <span className="text-xs text-slate-400">Carregando…</span>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div
        className="flex w-full items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400"
        style={{ height }}
      >
        Nenhum dado para exibir.
      </div>
    );
  }

  return (
    <div className="w-full" style={{ height }}>
      {title ? <h3 className="sr-only">{title}</h3> : null}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 12, right: 8, left: 4, bottom: 8 }} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="4 4" stroke={gridStroke} vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 12, fill: tickStroke, fontWeight: 500 }}
            axisLine={{ stroke: tickStroke }}
            tickLine={false}
            interval={0}
          />
          <YAxis
            width={44}
            tickFormatter={formatAxisK}
            tick={{ fontSize: 11, fill: tickStroke }}
            axisLine={false}
            tickLine={false}
          />
          {hasNegative ? <ReferenceLine y={0} stroke={tickStroke} strokeDasharray="4 4" /> : null}
          <Tooltip
            formatter={(v: number) => [fmt(v), valueLabel || 'Valor']}
            labelFormatter={(label) => `Mês: ${label}`}
            contentStyle={tooltipStyle}
          />
          <Bar dataKey="value" name={valueLabel || 'Valor'} maxBarSize={48} radius={[6, 6, 0, 0]}>
            {data.map((entry) => (
              <Cell
                key={entry.name}
                fill={highlightLabel && entry.name === highlightLabel ? barHighlight : barMuted}
                stroke={highlightLabel && entry.name === highlightLabel ? barHighlight : 'transparent'}
                strokeWidth={highlightLabel && entry.name === highlightLabel ? 2 : 0}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
