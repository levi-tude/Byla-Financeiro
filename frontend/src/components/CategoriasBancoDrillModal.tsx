import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCategoriasBancoDetalhe } from '../services/backendApi';

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

function formatDate(s: string): string {
  if (!s) return '–';
  return new Date(s).toLocaleDateString('pt-BR');
}

export type CategoriasGrupo = 'modalidade' | 'categoria' | 'funcionario';

const PAGE_SIZE = 50;

export function CategoriasBancoDrillModal(props: {
  open: boolean;
  onClose: () => void;
  mes: number;
  ano: number;
  tipo: 'entrada' | 'saida';
  grupo: CategoriasGrupo;
  chave: string | null;
  tituloGrupo: string;
}) {
  const { open, onClose, mes, ano, tipo, grupo, chave, tituloGrupo } = props;
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [chave, mes, ano, grupo, tipo]);

  const q = useQuery({
    queryKey: ['categorias-banco-detalhe', mes, ano, tipo, grupo, chave, page],
    queryFn: () => getCategoriasBancoDetalhe(mes, ano, tipo, grupo, chave!, page, PAGE_SIZE),
    enabled: open && !!chave,
  });

  if (!open) return null;

  const totalPages = q.data ? Math.max(1, Math.ceil(q.data.total / PAGE_SIZE)) : 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="categorias-drill-title"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-slate-200 flex items-start justify-between gap-3">
          <div>
            <h2 id="categorias-drill-title" className="text-lg font-semibold text-slate-900">
              {tituloGrupo}
              {chave ? (
                <span className="font-normal text-slate-600"> — {chave}</span>
              ) : null}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Mês {String(mes).padStart(2, '0')}/{ano} · {q.data?.total ?? '…'} lançamento(s)
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
          {q.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
              ))}
            </div>
          ) : q.error ? (
            <p className="text-sm text-rose-700">
              {q.error instanceof Error ? q.error.message : 'Erro ao carregar detalhe.'}
            </p>
          ) : !q.data?.itens.length ? (
            <p className="text-sm text-slate-500">Nenhum item neste filtro.</p>
          ) : grupo === 'funcionario' ? (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr className="text-left text-slate-600">
                  <th className="py-2 px-2">Data</th>
                  <th className="py-2 px-2 text-right">Valor</th>
                  <th className="py-2 px-2">Categoria</th>
                  <th className="py-2 px-2">Descrição</th>
                </tr>
              </thead>
              <tbody>
                {q.data.itens.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="py-2 px-2 whitespace-nowrap">{formatDate(row.data)}</td>
                    <td className="py-2 px-2 text-right tabular-nums font-medium">{formatBRL(row.valor)}</td>
                    <td className="py-2 px-2">{row.categoria ?? '—'}</td>
                    <td className="py-2 px-2 text-slate-700">{row.descricao ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr className="text-left text-slate-600">
                  <th className="py-2 px-2">Data</th>
                  <th className="py-2 px-2">Pessoa</th>
                  <th className="py-2 px-2 text-right">Valor</th>
                  <th className="py-2 px-2">Modalidade</th>
                  <th className="py-2 px-2">Categoria</th>
                  <th className="py-2 px-2">Descrição</th>
                </tr>
              </thead>
              <tbody>
                {q.data.itens.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="py-2 px-2 whitespace-nowrap">{formatDate(row.data)}</td>
                    <td className="py-2 px-2">{row.pessoa ?? '—'}</td>
                    <td className="py-2 px-2 text-right tabular-nums font-medium">{formatBRL(row.valor)}</td>
                    <td className="py-2 px-2">{row.modalidade ?? '—'}</td>
                    <td className="py-2 px-2">{row.categoria_sugerida ?? '—'}</td>
                    <td className="py-2 px-2 text-slate-700">{row.descricao ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {q.data && totalPages > 1 && (
          <div className="px-4 py-2 border-t border-slate-200 flex items-center justify-between gap-2 text-sm">
            <span className="text-slate-600">
              Página {page} de {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 rounded border border-slate-300 disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 rounded border border-slate-300 disabled:opacity-40"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
