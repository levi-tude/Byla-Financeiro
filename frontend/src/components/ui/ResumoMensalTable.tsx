import type { ResumoMensalRow } from '../../types/resumo';

interface ResumoMensalTableProps {
  rows: ResumoMensalRow[];
  isLoading?: boolean;
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatMesAno(mes: number, ano: number): string {
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${meses[mes - 1]}/${ano.toString().slice(-2)}`;
}

export function ResumoMensalTable({ rows, isLoading }: ResumoMensalTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (!rows.length) {
    return (
      <p className="text-sm text-gray-500 py-6 text-center">
        Sem meses registrados ainda.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-500 font-medium">
            <th className="pb-2 pr-4">Mês</th>
            <th className="pb-2 pr-4 text-right">Entradas</th>
            <th className="pb-2 pr-4 text-right">Saídas</th>
            <th className="pb-2 pr-4 text-right">Saldo</th>
            <th className="pb-2 text-right">Saldo/Entradas</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const pct =
              row.total_entradas > 0
                ? (row.saldo_mes / row.total_entradas) * 100
                : 0;
            return (
              <tr
                key={`${row.ano}-${row.mes}`}
                className="border-b border-gray-100 hover:bg-gray-50"
              >
                <td className="py-2 pr-4 font-medium text-gray-900">
                  {formatMesAno(row.mes, row.ano)}
                </td>
                <td className="py-2 pr-4 text-right text-gray-700">
                  {formatCurrency(row.total_entradas)}
                </td>
                <td className="py-2 pr-4 text-right text-gray-700">
                  {formatCurrency(row.total_saidas)}
                </td>
                <td
                  className={`py-2 pr-4 text-right font-medium ${
                    row.saldo_mes >= 0 ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {formatCurrency(row.saldo_mes)}
                </td>
                <td className="py-2 text-right text-gray-600">
                  {pct.toFixed(1)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
