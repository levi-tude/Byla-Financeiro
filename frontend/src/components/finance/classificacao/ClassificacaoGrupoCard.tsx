import { StatusBadge } from '../StatusBadge';

export function ClassificacaoGrupoCard({
  titulo,
  resumo,
  meta,
  estado,
  categoriaLabel,
  scoreRepeticao,
  regraDesativada,
  sugestaoHint,
  sugestaoFluxoBadge,
  cartaoDetalhe,
  onConfirmarSugestao,
  confirmarPending,
  onClassificar,
  onDesativar,
  podeDesativar,
  onDesvincular,
  podeDesvincular,
  desvincularLabel,
  classificarDesabilitado,
}: {
  titulo: string;
  resumo: string;
  meta?: string;
  estado: 'pendente' | 'classificado';
  categoriaLabel: string | null;
  scoreRepeticao: number;
  regraDesativada: boolean;
  sugestaoHint?: string | null;
  sugestaoFluxoBadge?: boolean;
  cartaoDetalhe?: string | null;
  onConfirmarSugestao?: () => void;
  confirmarPending?: boolean;
  onClassificar: () => void;
  onDesativar?: () => void;
  podeDesativar?: boolean;
  onDesvincular?: () => void;
  podeDesvincular?: boolean;
  desvincularLabel?: string;
  classificarDesabilitado?: boolean;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">{titulo}</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">{resumo}</p>
          {meta ? <p className="text-xs text-slate-500">{meta}</p> : null}
        </div>
        <div className="flex flex-wrap gap-1">
          {scoreRepeticao >= 2 && <StatusBadge tone="atencao" label="Repete" />}
          {regraDesativada && <StatusBadge tone="pendente" label="Regra desativada" />}
          {sugestaoFluxoBadge && <StatusBadge tone="atencao" label="Sugerido pelo fluxo" />}
          {cartaoDetalhe && <StatusBadge tone="pendente" label="Cartão" />}
          {estado === 'pendente' && !categoriaLabel && !sugestaoFluxoBadge && (
            <StatusBadge tone="pendente" label="Pendente" />
          )}
          {categoriaLabel && <StatusBadge tone="ok" label={categoriaLabel} />}
        </div>
      </div>
      {cartaoDetalhe && estado === 'pendente' && (
        <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">{cartaoDetalhe}</p>
      )}
      {sugestaoHint && estado === 'pendente' && (
        <p className="mt-2 text-xs text-indigo-700 dark:text-indigo-300">{sugestaoHint}</p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {estado === 'pendente' ? (
          <>
            {onConfirmarSugestao && (
              <button
                type="button"
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
                onClick={onConfirmarSugestao}
                disabled={confirmarPending}
              >
                {confirmarPending ? 'Confirmando…' : 'Confirmar sugestão'}
              </button>
            )}
            <button
              type="button"
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              onClick={onClassificar}
              disabled={classificarDesabilitado}
            >
              {onConfirmarSugestao ? 'Corrigir categoria' : 'Classificar'}
            </button>
            {onDesvincular && podeDesvincular && (
              <button
                type="button"
                className="rounded-lg border border-rose-300 px-3 py-1.5 text-sm text-rose-800 dark:border-rose-800 dark:text-rose-200"
                onClick={onDesvincular}
              >
                {desvincularLabel ?? 'Desvincular'}
              </button>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600"
              onClick={onClassificar}
            >
              Editar categoria
            </button>
            {onDesativar && podeDesativar && !regraDesativada && (
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 dark:border-slate-600 dark:text-slate-300"
                onClick={onDesativar}
              >
                Desativar regra
              </button>
            )}
            {onDesvincular && podeDesvincular && (
              <button
                type="button"
                className="rounded-lg border border-rose-300 px-3 py-1.5 text-sm text-rose-800 dark:border-rose-800 dark:text-rose-200"
                onClick={onDesvincular}
              >
                {desvincularLabel ?? 'Desvincular'}
              </button>
            )}
          </>
        )}
      </div>
    </article>
  );
}
