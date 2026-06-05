import { useMemo, useState, type ReactNode } from 'react';
import { ClassificacaoLoadingBlock } from './ClassificacaoLoadingBlock';
import { agruparPorBlocoTitulo, filtrarCategoriasPorBusca, formatBrl, formatDate, type CategoriaOpcao } from './utils';

export function ClassificacaoModal({
  title,
  subtitle,
  subtitleExtra,
  categoriaLabel,
  categoriaHint,
  emptyCatalogHint,
  categorias,
  templateKey,
  onTemplateKeyChange,
  transacoes,
  transacoesLoading,
  renderTransacaoExtra,
  sugestao,
  saveError,
  savePending,
  onClose,
  onSave,
}: {
  title: string;
  subtitle: string;
  subtitleExtra?: string;
  categoriaLabel: string;
  categoriaHint?: string;
  emptyCatalogHint?: string;
  categorias: CategoriaOpcao[];
  templateKey: string;
  onTemplateKeyChange: (key: string) => void;
  transacoes: { id: string; data: string; valor: number }[];
  transacoesLoading: boolean;
  renderTransacaoExtra?: (t: { id: string; data: string; valor: number }) => ReactNode;
  sugestao?: ReactNode;
  saveError?: string | null;
  savePending: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  const [busca, setBusca] = useState('');
  const mostrarBusca = categorias.length > 6;

  const categoriasFiltradas = useMemo(
    () => filtrarCategoriasPorBusca(categorias, busca),
    [categorias, busca],
  );
  const byBloco = useMemo(() => agruparPorBlocoTitulo(categoriasFiltradas), [categoriasFiltradas]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal>
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{subtitle}</p>
        {subtitleExtra ? <p className="text-xs text-slate-500">{subtitleExtra}</p> : null}

        {transacoesLoading ? (
          <ClassificacaoLoadingBlock />
        ) : (
          <ul className="mt-4 max-h-52 space-y-2 overflow-auto text-sm">
            {transacoes.map((t) => (
              <li key={t.id} className="border-b border-slate-100 py-1 dark:border-slate-800">
                <div className="flex justify-between gap-2">
                  <span>{formatDate(t.data)}</span>
                  <span className="font-medium tabular-nums">{formatBrl(Math.abs(t.valor))}</span>
                </div>
                {renderTransacaoExtra?.(t)}
              </li>
            ))}
          </ul>
        )}

        {mostrarBusca && (
          <label className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Buscar linha do Controle
            <input
              type="search"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
              placeholder="Ex.: Pholha, Energia, Dança…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </label>
        )}

        <label className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-300">
          {categoriaLabel}
          {categoriaHint ? (
            <span className="mt-0.5 block text-xs font-normal text-slate-500">{categoriaHint}</span>
          ) : null}
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
            value={templateKey}
            onChange={(e) => onTemplateKeyChange(e.target.value)}
          >
            <option value="">Selecione…</option>
            {byBloco.map(([titulo, linhas]) => (
              <optgroup key={titulo} label={titulo}>
                {linhas.map((l) => (
                  <option key={l.templateKey} value={l.templateKey}>
                    {l.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        {byBloco.length === 0 && emptyCatalogHint && (
          <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">{emptyCatalogHint}</p>
        )}

        {sugestao}

        {saveError && <p className="mt-2 text-sm text-rose-700">{saveError}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-600"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!templateKey || savePending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            onClick={onSave}
          >
            Salvar regra
          </button>
        </div>
      </div>
    </div>
  );
}
