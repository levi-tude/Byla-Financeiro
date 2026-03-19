interface KpiCardProps {
  label: string;
  value: string;
  helperText?: string;
  trend?: 'up' | 'down' | 'neutral';
  accentColor?: 'primary' | 'success' | 'danger';
  isLoading?: boolean;
}

export function KpiCard(props: KpiCardProps) {
  const {
    label,
    value,
    helperText,
    trend = 'neutral',
    accentColor = 'primary',
    isLoading,
  } = props;
  const accent =
    accentColor === 'success'
      ? 'text-emerald-600'
      : accentColor === 'danger'
        ? 'text-rose-600'
        : 'text-indigo-600';
  const trendColor =
    trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-rose-600' : 'text-gray-500';
  return (
    <div className="bg-white rounded-xl shadow-sm p-4 flex flex-col gap-2 border border-gray-100">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </span>
      {isLoading ? (
        <div className="h-8 w-32 rounded bg-gray-200 animate-pulse" />
      ) : (
        <span className={'text-2xl font-semibold ' + accent}>{value}</span>
      )}
      {helperText && !isLoading && (
        <span className={'text-xs font-medium ' + trendColor}>{helperText}</span>
      )}
    </div>
  );
}
