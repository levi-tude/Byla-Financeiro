export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-2">
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} className="h-9 flex-1 animate-pulse rounded bg-slate-200/80 dark:bg-slate-700/80" />
          ))}
        </div>
      ))}
    </div>
  );
}
