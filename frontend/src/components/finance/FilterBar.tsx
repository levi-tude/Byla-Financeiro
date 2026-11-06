import { useState, type ReactNode } from 'react';

export type FilterChip = {
  id: string;
  label: string;
  onRemove?: () => void;
};

export function FilterBar({
  title,
  subtitle,
  chips,
  periodLabel,
  onClear,
  children,
  /** No celular, os controles começam recolhidos atrás de "Filtros". Desktop permanece aberto. */
  collapsibleOnMobile = true,
}: {
  title: string;
  subtitle?: string;
  chips?: FilterChip[];
  periodLabel?: string;
  onClear?: () => void;
  children?: ReactNode;
  collapsibleOnMobile?: boolean;
}) {
  const [openMobile, setOpenMobile] = useState(false);
  const hasChildren = Boolean(children);

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
          {periodLabel ? <p className="mt-0.5 text-xs text-indigo-700 dark:text-indigo-300">{periodLabel}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {collapsibleOnMobile && hasChildren ? (
            <button
              type="button"
              className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 lg:hidden dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              aria-expanded={openMobile}
              onClick={() => setOpenMobile((v) => !v)}
            >
              {openMobile ? 'Ocultar filtros' : 'Filtros'}
            </button>
          ) : null}
          {onClear ? (
            <button
              type="button"
              onClick={onClear}
              className="min-h-11 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              Limpar filtros
            </button>
          ) : null}
        </div>
      </div>

      {chips && chips.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <span
              key={chip.id}
              className="inline-flex min-h-9 items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs text-indigo-800 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-200"
            >
              {chip.label}
              {chip.onRemove ? (
                <button
                  type="button"
                  onClick={chip.onRemove}
                  className="min-h-8 min-w-8 font-semibold hover:opacity-80"
                  aria-label={`Remover ${chip.label}`}
                >
                  ×
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}

      {hasChildren ? (
        <div className={collapsibleOnMobile ? (openMobile ? 'block' : 'hidden lg:block') : 'block'}>{children}</div>
      ) : null}
    </section>
  );
}
