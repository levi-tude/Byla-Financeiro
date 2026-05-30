import type { ReactNode } from 'react';

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
      {message}
    </div>
  );
}

export function LoadingRow({ colSpan, rows = 4 }: { colSpan: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, idx) => (
        <tr key={idx} className="border-b border-slate-100 dark:border-slate-800">
          <td colSpan={colSpan} className="px-2 py-2">
            <div className="h-6 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          </td>
        </tr>
      ))}
    </>
  );
}

export function ErrorPanel({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
      <p>{message}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

