import { useMemo, useState, type ReactNode } from 'react';

type Column<T> = {
  id: string;
  header: string;
  align?: 'left' | 'right' | 'center';
  sticky?: boolean;
  optional?: boolean;
  /** No cartão mobile, esta coluna vira o título (primeira coluna sticky se não houver). */
  mobileTitle?: boolean;
  render: (row: T) => ReactNode;
};

function alignClass(align?: 'left' | 'right' | 'center') {
  if (align === 'right') return 'text-right';
  if (align === 'center') return 'text-center';
  return 'text-left';
}

export function DataTable<T>({
  title,
  subtitle,
  columns,
  rows,
  loadingRows,
  emptyBlock,
}: {
  title: string;
  subtitle?: string;
  columns: Array<Column<T>>;
  rows: T[];
  loadingRows?: ReactNode;
  emptyBlock?: ReactNode;
}) {
  const [showOptional, setShowOptional] = useState(false);
  const hasOptional = useMemo(() => columns.some((c) => c.optional), [columns]);
  const visibleColumns = useMemo(
    () => columns.filter((c) => !c.optional || showOptional),
    [columns, showOptional],
  );
  const titleCol = useMemo(
    () => visibleColumns.find((c) => c.mobileTitle) ?? visibleColumns.find((c) => c.sticky) ?? visibleColumns[0],
    [visibleColumns],
  );
  const detailCols = useMemo(
    () => visibleColumns.filter((c) => c.id !== titleCol?.id),
    [visibleColumns, titleCol],
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
        </div>
        {hasOptional ? (
          <button
            type="button"
            onClick={() => setShowOptional((v) => !v)}
            className="min-h-11 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {showOptional ? 'Ocultar colunas' : 'Mais colunas'}
          </button>
        ) : null}
      </div>

      {/* Desktop: tabela */}
      <div className="hidden overflow-auto max-h-[460px] lg:block">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b bg-white/95 text-slate-500 dark:bg-slate-900/95">
              {visibleColumns.map((col) => (
                <th
                  key={col.id}
                  className={`whitespace-nowrap py-2 pr-2 font-medium ${alignClass(col.align)} ${
                    col.sticky ? 'sticky left-0 z-[2] bg-white dark:bg-slate-900' : ''
                  }`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loadingRows}
            {!loadingRows &&
              rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-slate-100 dark:border-slate-800">
                  {visibleColumns.map((col) => (
                    <td
                      key={col.id}
                      className={`py-2 pr-2 ${alignClass(col.align)} ${
                        col.sticky ? 'sticky left-0 z-[1] bg-white dark:bg-slate-900' : ''
                      }`}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: cartões — mesmos valores, sem rolagem lateral */}
      <ul className="space-y-3 lg:hidden">
        {loadingRows ? <li className="text-sm text-slate-500">Carregando…</li> : null}
        {!loadingRows &&
          rows.map((row, rowIndex) => (
            <li
              key={rowIndex}
              className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/50"
            >
              {titleCol ? (
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{titleCol.render(row)}</div>
              ) : null}
              <dl className="mt-2 space-y-1.5">
                {detailCols.map((col) => (
                  <div key={col.id} className="flex items-start justify-between gap-3 text-sm">
                    <dt className="shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">{col.header}</dt>
                    <dd className={`min-w-0 text-right text-slate-800 dark:text-slate-100 ${alignClass(col.align)}`}>
                      {col.render(row)}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
      </ul>

      {!loadingRows && rows.length === 0 ? <div className="mt-3">{emptyBlock}</div> : null}
    </section>
  );
}
