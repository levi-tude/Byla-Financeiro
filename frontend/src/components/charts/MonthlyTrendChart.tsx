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
  if (isLoading) {
    return (
      <div className="h-64 bg-gray-100 rounded-lg animate-pulse flex items-center justify-center">
        <span className="text-sm text-gray-400">Carregando...</span>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-gray-500 bg-gray-50 rounded-lg">
        Nenhum dado encontrado para este período.
      </div>
    );
  }

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#6b7280" />
          <YAxis
            tickFormatter={(v) => (v / 1000).toFixed(0) + 'k'}
            tick={{ fontSize: 12 }}
            stroke="#6b7280"
          />
          <Tooltip
            formatter={(value: number) => [formatCurrency(value), '']}
            labelFormatter={(label) => 'Mes: ' + label}
            contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
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
