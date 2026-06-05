import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ClassificacaoLoadingBlock } from './ClassificacaoLoadingBlock';
import { formatBrl, formatDate } from './utils';
import { EmptyState } from '../StateBlocks';

export type PorCategoriaLinha = {
  template_key: string;
  label: string;
  total: number;
  meta: string;
  qtd_transacoes: number;
};

export type PorCategoriaBloco = {
  bloco_titulo: string;
  linhas: PorCategoriaLinha[];
};

export type CategoriaTransacaoItem = {
  id: string;
  data: string;
  pessoa: string;
  valor: number;
  descricao?: string | null;
  nome_aluno?: string | null;
  modalidade?: string | null;
};

export const CATEGORIA_PENDENTE_KEY = '_pendente';

function CategoriaTransacoesLista({
  mes,
  ano,
  templateKey,
  loadTransacoes,
  valorTone,
}: {
  mes: number;
  ano: number;
  templateKey: string;
  loadTransacoes: (templateKey: string) => Promise<CategoriaTransacaoItem[]>;
  valorTone: 'entrada' | 'saida';
}) {
  const query = useQuery({
    queryKey: ['categoria-transacoes', valorTone, mes, ano, templateKey],
    queryFn: () => loadTransacoes(templateKey),
  });

  const valorClass =
    valorTone === 'entrada'
      ? 'text-emerald-800 dark:text-emerald-200'
      : 'text-rose-800 dark:text-rose-200';

  if (query.isLoading) {
    return (
      <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
        <ClassificacaoLoadingBlock />
      </div>
    );
  }

  if (query.error) {
    return (
      <div className="border-t border-slate-100 px-4 py-3 text-sm text-rose-700 dark:border-slate-800">
        Não foi possível carregar os lançamentos.
      </div>
    );
  }

  const transacoes = query.data ?? [];
  if (transacoes.length === 0) {
    return (
      <div className="border-t border-slate-100 px-4 py-3 text-sm text-slate-500 dark:border-slate-800">
        Nenhum lançamento nesta categoria.
      </div>
    );
  }

  return (
    <ul className="border-t border-slate-100 dark:border-slate-800">
      {transacoes.map((t) => {
        const detalhe =
          t.nome_aluno && t.nome_aluno.trim() !== t.pessoa.trim()
            ? `${t.pessoa} · ${t.nome_aluno}${t.modalidade ? ` · ${t.modalidade}` : ''}`
            : t.pessoa;
        return (
          <li
            key={t.id}
            className="flex items-start justify-between gap-3 border-b border-slate-50 px-4 py-2.5 last:border-b-0 dark:border-slate-800/80"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{formatDate(t.data)}</p>
              <p className="truncate text-xs text-slate-500">{detalhe}</p>
              {t.descricao ? <p className="truncate text-xs text-slate-400">{t.descricao}</p> : null}
            </div>
            <p className={`shrink-0 text-sm font-semibold tabular-nums ${valorClass}`}>
              {formatBrl(Math.abs(t.valor))}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function CategoriaRow({
  row,
  expanded,
  onToggle,
  mes,
  ano,
  loadTransacoes,
  valorTone,
}: {
  row: PorCategoriaLinha;
  expanded: boolean;
  onToggle: () => void;
  mes: number;
  ano: number;
  loadTransacoes: (templateKey: string) => Promise<CategoriaTransacaoItem[]>;
  valorTone: 'entrada' | 'saida';
}) {
  const valorClass =
    valorTone === 'entrada'
      ? 'text-emerald-800 dark:text-emerald-200'
      : 'text-rose-800 dark:text-rose-200';
  const expandivel = row.qtd_transacoes > 0;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
      <button
        type="button"
        disabled={!expandivel}
        onClick={expandivel ? onToggle : undefined}
        className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left ${
          expandivel
            ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50'
            : 'cursor-default opacity-80'
        }`}
        aria-expanded={expandivel ? expanded : undefined}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {expandivel ? (
              <span
                className={`inline-block text-xs text-slate-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
                aria-hidden
              >
                ▶
              </span>
            ) : null}
            <p className="font-semibold text-slate-900 dark:text-slate-100">{row.label}</p>
          </div>
          <p className="text-xs text-slate-500">{row.meta}</p>
          {expandivel ? (
            <p className="mt-0.5 text-xs text-indigo-600 dark:text-indigo-400">
              {expanded ? 'Ocultar lançamentos' : 'Clique para ver lançamentos'}
            </p>
          ) : null}
        </div>
        <p
          className={`text-lg font-bold tabular-nums ${row.total > 0 ? valorClass : 'text-slate-400'}`}
        >
          {formatBrl(row.total)}
        </p>
      </button>
      {expanded && expandivel ? (
        <CategoriaTransacoesLista
          mes={mes}
          ano={ano}
          templateKey={row.template_key}
          loadTransacoes={loadTransacoes}
          valorTone={valorTone}
        />
      ) : null}
    </div>
  );
}

export function PorCategoriaSection({
  isLoading,
  blocos,
  pendenteTotal,
  pendenteQtd = 0,
  emptyMessage,
  valorTone,
  mes,
  ano,
  loadTransacoes,
}: {
  isLoading: boolean;
  blocos: PorCategoriaBloco[];
  pendenteTotal: number;
  pendenteQtd?: number;
  emptyMessage: string;
  valorTone: 'entrada' | 'saida';
  mes: number;
  ano: number;
  loadTransacoes: (templateKey: string) => Promise<CategoriaTransacaoItem[]>;
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const toggle = (key: string) => {
    setExpandedKey((cur) => (cur === key ? null : key));
  };

  if (isLoading) return <ClassificacaoLoadingBlock />;

  const semLinhasClassificadas = blocos.length === 0;
  if (semLinhasClassificadas && pendenteTotal <= 0) {
    return <EmptyState message={emptyMessage} />;
  }

  return (
    <section className="mt-4 space-y-6">
      {blocos.map((bloco) => (
        <div key={bloco.bloco_titulo}>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            {bloco.bloco_titulo}
          </h3>
          <div className="space-y-2">
            {bloco.linhas.map((row) => (
              <CategoriaRow
                key={row.template_key}
                row={row}
                expanded={expandedKey === row.template_key}
                onToggle={() => toggle(row.template_key)}
                mes={mes}
                ano={ano}
                loadTransacoes={loadTransacoes}
                valorTone={valorTone}
              />
            ))}
          </div>
        </div>
      ))}
      {pendenteTotal > 0 && (
        <div className="overflow-hidden rounded-xl border border-dashed border-amber-300 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30">
          <CategoriaRow
            row={{
              template_key: CATEGORIA_PENDENTE_KEY,
              label: 'Sem categoria (pendente)',
              total: pendenteTotal,
              meta: `${pendenteQtd} lanç. sem classificação`,
              qtd_transacoes: pendenteQtd,
            }}
            expanded={expandedKey === CATEGORIA_PENDENTE_KEY}
            onToggle={() => toggle(CATEGORIA_PENDENTE_KEY)}
            mes={mes}
            ano={ano}
            loadTransacoes={loadTransacoes}
            valorTone={valorTone}
          />
        </div>
      )}
    </section>
  );
}
