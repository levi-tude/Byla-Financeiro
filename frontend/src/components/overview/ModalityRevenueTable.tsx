import { formatBrl, formatPct, type ModalityRow } from '../../logic/overviewDashboard';

type ModalityRevenueTableProps = {
  rows: ModalityRow[];
  total: number;
};

export function ModalityRevenueTable({ rows, total }: ModalityRevenueTableProps) {
  if (!rows.length) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
        Nenhum pagamento registrado no Fluxo para este mês de competência.
      </p>
    );
  }

  const maxVal = rows[0]?.value ?? 1;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-400">
              <th className="px-4 py-3">Modalidade</th>
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-4 py-3 text-right w-28">%</th>
              <th className="px-4 py-3 hidden sm:table-cell w-40" aria-hidden>
                Participação
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((row) => (
              <tr key={row.name} className="bg-white dark:bg-slate-900/40">
                <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{row.name}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-800 dark:text-slate-200">
                  {formatBrl(row.value)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400">
                  {formatPct(row.pct)}
                </td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400"
                      style={{ width: `${Math.max(4, (row.value / maxVal) * 100)}%` }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50 font-semibold dark:border-slate-700 dark:bg-slate-800/80">
              <td className="px-4 py-3 text-slate-900 dark:text-slate-100">Total</td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-900 dark:text-slate-100">
                {formatBrl(total)}
              </td>
              <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400">100%</td>
              <td className="hidden sm:table-cell" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
