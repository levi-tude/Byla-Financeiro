import type { ReactNode } from 'react';

/** Lista de cartões só no celular (< lg). Desktop usa a tabela ao lado. */
export function MobileOnly({ children }: { children: ReactNode }) {
  return <div className="lg:hidden">{children}</div>;
}

/** Tabela só no desktop (≥ lg). */
export function DesktopOnly({ children }: { children: ReactNode }) {
  return <div className="hidden lg:block">{children}</div>;
}

export function MobileCard({
  title,
  children,
  footer,
}: {
  title: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
      {children ? <div className="mt-2 space-y-1.5 text-sm text-slate-700 dark:text-slate-200">{children}</div> : null}
      {footer ? <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-2 dark:border-slate-800">{footer}</div> : null}
    </article>
  );
}

export function MobileField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      <span className="min-w-0 text-right">{value}</span>
    </div>
  );
}
