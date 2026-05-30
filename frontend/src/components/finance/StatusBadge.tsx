type StatusTone = 'ok' | 'atencao' | 'divergente' | 'pendente';

const TONE_CLASS: Record<StatusTone, string> = {
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200',
  atencao: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200',
  divergente: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200',
  pendente: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

const LABEL_DEFAULT: Record<StatusTone, string> = {
  ok: 'OK',
  atencao: 'Atenção',
  divergente: 'Divergente',
  pendente: 'Pendente',
};

export function StatusBadge({ tone, label }: { tone: StatusTone; label?: string }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${TONE_CLASS[tone]}`}>
      {label ?? LABEL_DEFAULT[tone]}
    </span>
  );
}

