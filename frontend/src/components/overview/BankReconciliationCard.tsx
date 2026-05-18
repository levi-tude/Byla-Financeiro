import { Link } from 'react-router-dom';
import { formatBrl } from '../../logic/overviewDashboard';

type ReconciliationLine = {
  extrato: number | null;
  fechamento: number | null;
  diff: number | null;
};

type BankReconciliationCardProps = {
  entradas: ReconciliationLine;
  saidas: ReconciliationLine;
};

function DiffCell({ diff }: { diff: number | null }) {
  if (diff == null) return <span>—</span>;
  const warn = Math.abs(diff) > 0.02;
  return (
    <span className={warn ? 'font-semibold text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-400'}>
      {formatBrl(diff, 2)}
    </span>
  );
}

export function BankReconciliationCard({ entradas, saidas }: BankReconciliationCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
        Compare o extrato bancário com o fechamento do mesmo mês — entradas e saídas. Pequenas diferenças podem
        vir de timing ou lançamentos ainda não conferidos.
      </p>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <th className="pb-2 pr-4">Tipo</th>
              <th className="pb-2 pr-4 text-right">Extrato bancário</th>
              <th className="pb-2 pr-4 text-right">Fechamento</th>
              <th className="pb-2 text-right">Diferença</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            <tr>
              <td className="py-3 font-medium text-slate-800 dark:text-slate-200">Entradas</td>
              <td className="py-3 text-right tabular-nums">{formatBrl(entradas.extrato)}</td>
              <td className="py-3 text-right tabular-nums">{formatBrl(entradas.fechamento)}</td>
              <td className="py-3 text-right tabular-nums">
                <DiffCell diff={entradas.diff} />
              </td>
            </tr>
            <tr>
              <td className="py-3 font-medium text-slate-800 dark:text-slate-200">Saídas</td>
              <td className="py-3 text-right tabular-nums">{formatBrl(saidas.extrato)}</td>
              <td className="py-3 text-right tabular-nums">{formatBrl(saidas.fechamento)}</td>
              <td className="py-3 text-right tabular-nums">
                <DiffCell diff={saidas.diff} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <Link
          to="/transacoes"
          className="font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          Ver extrato →
        </Link>
        <Link
          to="/controle-caixa"
          className="font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          Editar fechamento →
        </Link>
      </div>
    </div>
  );
}
