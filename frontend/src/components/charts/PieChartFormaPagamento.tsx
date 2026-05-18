import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import { DEFAULT_CHART_HEIGHT, OVERVIEW_PIE_HEIGHT } from './chartLayout';

interface Serie {
  name: string;
  value: number;
}
const COLORS = ['#4f46e5', '#22c55e', '#f97316', '#e11d48', '#8b5cf6', '#06b6d4'];

interface PieChartFormaPagamentoProps {
  data: Serie[];
  isLoading?: boolean;
  donut?: boolean;
  /** `modalidade` — receita por modalidade no Fluxo (Overview). */
  variant?: 'default' | 'modalidade';
  height?: number;
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

export function PieChartFormaPagamento({
  data,
  isLoading,
  donut = false,
  variant = 'default',
  height,
}: PieChartFormaPagamentoProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const chartHeight = height ?? (variant === 'modalidade' ? OVERVIEW_PIE_HEIGHT : DEFAULT_CHART_HEIGHT);
  const legendColor = isDark ? '#cbd5e1' : '#374151';
  const tooltipStyle = isDark
    ? { borderRadius: 8, border: '1px solid #475569', backgroundColor: '#0f172a', color: '#f1f5f9' }
    : { borderRadius: 8, border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#111827' };

  if (isLoading) {
    return (
      <div
        className="flex w-full items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800/80 animate-pulse"
        style={{ height: chartHeight }}
      >
        <span className="text-xs text-slate-400">Carregando…</span>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div
        className="flex w-full items-center justify-center rounded-lg border border-dashed border-slate-200 px-4 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400"
        style={{ height: chartHeight }}
      >
        Nenhum pagamento no Fluxo para este mês de competência.
      </div>
    );
  }

  const isModalidade = variant === 'modalidade';
  const innerR = donut ? (isModalidade ? 52 : 48) : 0;
  const outerR = isModalidade ? 88 : 72;

  return (
    <div className="w-full" style={{ height: chartHeight }}>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <PieChart margin={{ top: 8, right: 8, bottom: isModalidade ? 48 : 8, left: 8 }}>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy={isModalidade ? '42%' : '50%'}
            innerRadius={innerR}
            outerRadius={outerR}
            paddingAngle={2}
            isAnimationActive
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} stroke={isDark ? '#0f172a' : '#fff'} strokeWidth={2} />
            ))}
          </Pie>
          <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={tooltipStyle} />
          <Legend
            layout="horizontal"
            align="center"
            verticalAlign="bottom"
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
            formatter={(value) => (
              <span style={{ color: legendColor, marginRight: 12 }}>{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
