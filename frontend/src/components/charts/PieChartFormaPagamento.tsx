import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface Serie { name: string; value: number; }
const COLORS = ['#4f46e5', '#22c55e', '#f97316', '#e11d48', '#8b5cf6', '#06b6d4'];

interface PieChartFormaPagamentoProps {
  data: Serie[];
  isLoading?: boolean;
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

export function PieChartFormaPagamento({ data, isLoading }: PieChartFormaPagamentoProps) {
  if (isLoading) {
    return <div className="h-64 bg-gray-100 rounded-lg animate-pulse" />;
  }
  if (!data.length) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-gray-500">
        Nenhum dado para exibir.
      </div>
    );
  }
  return (
    <div className="h-64 overflow-hidden">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="40%"
            cy="50%"
            outerRadius={70}
            isAnimationActive={true}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v: number) => formatCurrency(v)} />
          <Legend
            layout="vertical"
            align="right"
            verticalAlign="middle"
            wrapperStyle={{ paddingLeft: 8 }}
            formatter={(value) => <span className="text-xs text-gray-700">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
