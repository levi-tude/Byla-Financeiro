import type { ReactNode } from 'react';

type OverviewSectionProps = {
  title: string;
  whatIs: string;
  source: 'fechamento' | 'extrato' | 'fluxo';
  children: ReactNode;
  id?: string;
};

const SOURCE_LABELS: Record<OverviewSectionProps['source'], string> = {
  fechamento: 'Fonte: Controle de caixa (fechamento do mês)',
  extrato: 'Fonte: Extrato bancário',
  fluxo: 'Fonte: Fluxo operacional (mensalidades dos alunos)',
};

const SOURCE_STYLES: Record<OverviewSectionProps['source'], string> = {
  fechamento: 'bg-indigo-50 text-indigo-800 border-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-200 dark:border-indigo-900/60',
  extrato: 'bg-rose-50 text-rose-800 border-rose-100 dark:bg-rose-950/50 dark:text-rose-200 dark:border-rose-900/60',
  fluxo: 'bg-emerald-50 text-emerald-800 border-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-900/60',
};

export function OverviewSection({ title, whatIs, source, children, id }: OverviewSectionProps) {
  return (
    <section id={id} className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{whatIs}</p>
        <p
          className={`mt-2 inline-block rounded-md border px-2 py-0.5 text-[11px] font-medium ${SOURCE_STYLES[source]}`}
        >
          {SOURCE_LABELS[source]}
        </p>
      </div>
      {children}
    </section>
  );
}
