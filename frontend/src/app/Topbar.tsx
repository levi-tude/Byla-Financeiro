import type { ReactNode } from 'react';

interface TopbarProps {
  title: string;
  subtitle?: string;
  childrenRight?: ReactNode;
}

export function Topbar({ title, subtitle, childrenRight }: TopbarProps) {
  return (
    <header className="flex items-center justify-between gap-4 pb-4 border-b border-gray-200">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        {subtitle && (
          <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
        )}
      </div>
      {childrenRight && (
        <div className="flex items-center gap-3">{childrenRight}</div>
      )}
    </header>
  );
}
