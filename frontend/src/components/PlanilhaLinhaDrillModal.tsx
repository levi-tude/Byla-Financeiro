import type { SaidaPainelItem } from '../services/backendApi';

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

function formatDate(s: string): string {
  if (!s) return '–';
  return new Date(s).toLocaleDateString('pt-BR');
}

/** Lista transações classificadas na mesma linha do CONTROLE DE CAIXA. */
export function PlanilhaLinhaDrillModal(props: {
  open: boolean;
  onClose: () => void;
  linhaNome: string | null;
  itens: SaidaPainelItem[];
}) {
  const { open, onClose, linhaNome, itens } = props;

  if (!open || !linhaNome) return null;

  const total = itens.reduce((s, x) => s + Math.abs(Number(x.valor || 0)), 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="planilha-linha-drill-title"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-slate-200 flex items-start justify-between gap-3">
          <div>
            <h2 id="planilha-linha-drill-title" className="text-lg font-semibold text-slate-900">
              Categoria (nome da planilha)
              <span className="font-normal text-slate-600"> — {linhaNome}</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Transações do <strong className="text-slate-700">extrato (Supabase)</strong> classificadas nesta linha do
              CONTROLE · {itens.length} lançamento(s) · Total {formatBRL(total)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
          >
            Fechar
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 min-h-0">
          {itens.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma transação com essa linha neste mês.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr className="text-left text-slate-600">
                  <th className="py-2 px-2">Data</th>
                  <th className="py-2 px-2">Pessoa</th>
                  <th className="py-2 px-2 text-right">Valor</th>
                  <th className="py-2 px-2">Categoria (banco)</th>
                  <th className="py-2 px-2">Regra</th>
                  <th className="py-2 px-2">Descrição</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="py-2 px-2 whitespace-nowrap">{formatDate(row.data)}</td>
                    <td className="py-2 px-2">{row.pessoa ?? '—'}</td>
                    <td className="py-2 px-2 text-right tabular-nums font-medium">{formatBRL(Number(row.valor))}</td>
                    <td className="py-2 px-2">{row.categoria_sugerida_banco ?? '—'}</td>
                    <td className="py-2 px-2 text-xs text-slate-600">{row.classificacao_regra ?? '—'}</td>
                    <td className="py-2 px-2 text-slate-700 max-w-[14rem] truncate" title={row.descricao ?? ''}>
                      {row.descricao ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
