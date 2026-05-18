import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import { DEFAULT_CHART_HEIGHT } from './chartLayout';

export interface MonthlyTrendPoint {
  label: string;
  totalEntradas: number;
  totalSaidas: number;
  saldoMes: number;
}

interface MonthlyTrendChartProps {
  data: MonthlyTrendPoint[];
  isLoading?: boolean;
  showLucroLine?: boolean;
  showSeriesChips?: boolean;
  height?: number;
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}

const STROKE_ENTRADAS = '#4f46e5';
const STROKE_SAIDAS = '#f97316';

export function MonthlyTrendChart({
  data,
  isLoading,
  showLucroLine = true,
  showSeriesChips = false,
  height = DEFAULT_CHART_HEIGHT,
}: MonthlyTrendChartProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const gridStroke = isDark ? '#334155' : '#e5e7eb';
  const tickStroke = isDark ? '#94a3b8' : '#6b7280';
  const tooltipStyle = isDark
    ? { borderRadius: 8, border: '1px solid #475569', backgroundColor: '#0f172a', color: '#f1f5f9' }
    : { borderRadius: 8, border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#111827' };

  const chipsH = showSeriesChips ? 40 : 0;
  const plotHeight = Math.max(200, height - chipsH);

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
        Nenhum dado encontrado para este período.
      </div>
    );
  }

  const chipEntrada = isDark
    ? 'border-indigo-500/40 bg-indigo-950/60 text-indigo-100'
    : 'border-indigo-200 bg-indigo-50 text-indigo-900';
  const chipSaida = isDark
    ? 'border-orange-500/40 bg-orange-950/50 text-orange-100'
    : 'border-orange-200 bg-orange-50 text-orange-900';

  return (
    <figure className="w-full" style={{ height }}>
      {showSeriesChips ? (
        <div className="mb-2 flex flex-wrap gap-2" role="group" aria-label="Legenda das séries">
          <span className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs font-semibold ${chipEntrada}`}>
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: STROKE_ENTRADAS }} aria-hidden />
            Entradas
          </span>
          <span className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs font-semibold ${chipSaida}`}>
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: STROKE_SAIDAS }} aria-hidden />
            Saídas
          </span>
        </div>
      ) : null}
      <div className="w-full" style={{ height: plotHeight }}>
        <ResponsiveContainer width="100%" height={plotHeight}>
          <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="4 4" stroke={gridStroke} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: tickStroke }} axisLine={false} tickLine={false} />
            <YAxis
              width={44}
              tickFormatter={(v) => (v / 1000).toFixed(0) + 'k'}
              tick={{ fontSize: 11, fill: tickStroke }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(value: number) => [formatCurrency(value), '']}
              labelFormatter={(label) => 'Mês: ' + label}
              contentStyle={tooltipStyle}
            />
            {!showSeriesChips ? <Legend /> : null}
            <Line type="monotone" dataKey="totalEntradas" name="Entradas" stroke={STROKE_ENTRADAS} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            <Line type="monotone" dataKey="totalSaidas" name="Saídas" stroke={STROKE_SAIDAS} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            {showLucroLine ? (
              <Line type="monotone" dataKey="saldoMes" name="Lucro" stroke="#22c55e" strokeWidth={2} dot={false} />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
