export function ErrorAlert({ message }: { message: string }) {
  return (
    <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
      {message}
    </div>
  );
}

export function InfoAlert({ message }: { message: string }) {
  return (
    <div className="p-4 rounded-xl border border-blue-200 bg-blue-50 text-sm text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-200">
      {message}
    </div>
  );
}

export function LoadingBars({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 bg-gray-100 dark:bg-slate-800 rounded animate-pulse" />
      ))}
    </div>
  );
}

