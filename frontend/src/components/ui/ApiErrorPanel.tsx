type ApiErrorPanelProps = {
  title?: string;
  message: string;
  technical?: string;
  onRetry?: () => void;
};

export function ApiErrorPanel({ title = 'Algo deu errado', message, technical, onRetry }: ApiErrorPanelProps) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-100">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-rose-800 dark:text-rose-200">{message}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-sm font-medium text-rose-800 hover:bg-rose-100 focus-visible:outline focus-visible:ring-2 focus-visible:ring-rose-400 dark:border-rose-700 dark:bg-slate-900 dark:text-rose-200 dark:hover:bg-rose-950/50"
          >
            Tentar de novo
          </button>
        )}
      </div>
      {technical ? (
        <details className="mt-3 text-xs text-rose-700 dark:text-rose-300">
          <summary className="cursor-pointer font-medium text-rose-800 dark:text-rose-200">Detalhes técnicos</summary>
          <pre className="mt-2 max-h-40 overflow-auto rounded bg-rose-100/80 dark:bg-rose-950/60 p-2 whitespace-pre-wrap break-all">
            {technical}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
