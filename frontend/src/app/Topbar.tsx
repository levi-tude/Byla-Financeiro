import type { ReactNode } from 'react';

interface TopbarProps {
  title: string;
  subtitle?: string;
  childrenRight?: ReactNode;
}

export function Topbar({ title, subtitle, childrenRight }: TopbarProps) {
  return (
    <header className="flex flex-col gap-3 border-b border-gray-200 pb-4 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">{title}</h1>
        {subtitle && (
          <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">{subtitle}</p>
        )}
      </div>
      {childrenRight && (
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto sm:justify-end">{childrenRight}</div>
      )}
    </header>
  );
}
