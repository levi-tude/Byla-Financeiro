import type { DashboardAlert } from '../../logic/overviewDashboard';

const TONE_STYLES: Record<DashboardAlert['tone'], string> = {
  danger: 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100',
  warning:
    'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100',
  info: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-100',
};

export function AlertBanner({ alert }: { alert: DashboardAlert }) {
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${TONE_STYLES[alert.tone]}`}>
      <p className="font-semibold">{alert.title}</p>
      <p className="mt-0.5 opacity-90">{alert.body}</p>
    </div>
  );
}
