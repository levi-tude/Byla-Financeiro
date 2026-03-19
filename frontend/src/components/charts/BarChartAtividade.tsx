import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface Serie { name: string; value: number; }
interface BarChartAtividadeProps {
  data: Serie[];
  isLoading?: boolean;
  title?: string;
  valueLabel?: string;
  formatValue?: (v: number) => string;
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

export function BarChartAtividade({ data, isLoading, title, valueLabel, formatValue }: BarChartAtividadeProps) {
  const fmt = formatValue || formatCurrency;
  if (isLoading) return <div className="h-64 bg-gray-100 rounded-lg animate-pulse" />;
  if (!data.length) return <div className="h-64 flex items-center justify-center text-sm text-gray-500">Nenhum dado.</div>;
  return (
    <div className="h-72">
      {title && <h3 className="text-sm font-medium text-gray-700 mb-2">{title}</h3>}
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="name" angle={-25} textAnchor="end" height={60} tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={formatValue ? (v) => String(v) : (v) => (v / 1000).toFixed(0) + 'k'} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v: number) => [fmt(v), valueLabel || 'Valor']} />
          <Bar dataKey="value" name={valueLabel || 'Valor'} fill="#4f46e5" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
