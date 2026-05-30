import { Link } from 'react-router-dom';

interface KpiCardProps {
  label: string;
  value: string;
  helperText?: string;
  trend?: 'up' | 'down' | 'neutral';
  accentColor?: 'primary' | 'success' | 'danger';
  isLoading?: boolean;
  ctaTo?: string;
  ctaLabel?: string;
}

export function KpiCard(props: KpiCardProps) {
  const {
    label,
    value,
    helperText,
    trend = 'neutral',
    accentColor = 'primary',
    isLoading,
    ctaTo,
    ctaLabel,
  } = props;
  const accent =
    accentColor === 'success'
      ? 'text-emerald-600 dark:text-emerald-400'
      : accentColor === 'danger'
        ? 'text-rose-600 dark:text-rose-400'
        : 'text-indigo-600 dark:text-indigo-400';
  const trendColor =
    trend === 'up'
      ? 'text-emerald-600 dark:text-emerald-400'
      : trend === 'down'
        ? 'text-rose-600 dark:text-rose-400'
        : 'text-gray-500 dark:text-slate-400';
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/40 p-4 flex flex-col gap-2 border border-gray-100 dark:border-slate-700">
      <span className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide">
        {label}
      </span>
      {isLoading ? (
        <div className="h-8 w-32 rounded bg-gray-200 dark:bg-slate-700 animate-pulse" />
      ) : (
        <span className={'text-2xl font-semibold ' + accent}>{value}</span>
      )}
      {helperText && (
        <span className={'text-xs font-medium ' + trendColor}>{helperText}</span>
      )}
      {ctaTo && ctaLabel && (
        <Link
          to={ctaTo}
          className="mt-1 inline-flex w-fit items-center text-xs font-semibold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          {ctaLabel} →
        </Link>
      )}
    </div>
  );
}
