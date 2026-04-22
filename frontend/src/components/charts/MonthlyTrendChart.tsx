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

export interface MonthlyTrendPoint {
  label: string;
  totalEntradas: number;
  totalSaidas: number;
  saldoMes: number;
}

interface MonthlyTrendChartProps {
  data: MonthlyTrendPoint[];
  isLoading?: boolean;
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}

export function MonthlyTrendChart({ data, isLoading }: MonthlyTrendChartProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const gridStroke = isDark ? '#334155' : '#e5e7eb';
  const tickStroke = isDark ? '#94a3b8' : '#6b7280';
  const tooltipStyle = isDark
    ? { borderRadius: 8, border: '1px solid #475569', backgroundColor: '#0f172a', color: '#f1f5f9' }
    : { borderRadius: 8, border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#111827' };

  if (isLoading) {
    return (
      <div className="h-64 bg-gray-100 dark:bg-slate-800 rounded-lg animate-pulse flex items-center justify-center">
        <span className="text-sm text-gray-400 dark:text-slate-500">Carregando...</span>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-gray-500 dark:text-slate-400 bg-gray-50 dark:bg-slate-900/80 rounded-lg border border-transparent dark:border-slate-700">
        Nenhum dado encontrado para este período.
      </div>
    );
  }

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: tickStroke }} stroke={tickStroke} />
          <YAxis
            tickFormatter={(v) => (v / 1000).toFixed(0) + 'k'}
            tick={{ fontSize: 12, fill: tickStroke }}
            stroke={tickStroke}
          />
          <Tooltip
            formatter={(value: number) => [formatCurrency(value), '']}
            labelFormatter={(label) => 'Mes: ' + label}
            contentStyle={tooltipStyle}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="totalEntradas"
            name="Entradas"
            stroke="#4f46e5"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="totalSaidas"
            name="Saidas"
            stroke="#f97316"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="saldoMes"
            name="Saldo"
            stroke="#22c55e"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
