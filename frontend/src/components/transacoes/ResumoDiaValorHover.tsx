import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type ResumoDiaLinhaDetalhe = {
  pessoa: string;
  valor: number;
  tipo: 'entrada' | 'saida';
  descricao: string | null;
  metodo: string;
};

type ModoCelula = 'entradas' | 'saidas' | 'saldo' | 'qtd';

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function linhasParaModo(linhas: ResumoDiaLinhaDetalhe[], modo: ModoCelula): ResumoDiaLinhaDetalhe[] {
  if (modo === 'entradas') return linhas.filter((l) => l.tipo === 'entrada');
  if (modo === 'saidas') return linhas.filter((l) => l.tipo === 'saida');
  return linhas;
}

function ListaDetalhe({ linhas }: { linhas: ResumoDiaLinhaDetalhe[] }) {
  return (
    <ul className="mt-0.5 space-y-1">
      {linhas.map((l, i) => (
        <li key={`${l.pessoa}-${l.valor}-${i}`} className="flex items-start justify-between gap-2 border-b border-slate-100 pb-1 last:border-0 dark:border-slate-800">
          <span className="min-w-0 flex-1 text-slate-700 dark:text-slate-200">
            <span className="block truncate font-medium">{l.pessoa || '—'}</span>
            {(l.descricao || l.metodo) && (
              <span className="block truncate text-[10px] text-slate-500 dark:text-slate-400">
                {[l.metodo, l.descricao].filter(Boolean).join(' · ')}
              </span>
            )}
          </span>
          <span
            className={`shrink-0 tabular-nums font-medium ${
              l.tipo === 'entrada' ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
            }`}
          >
            {l.tipo === 'saida' ? '−' : '+'}
            {formatCurrency(l.valor)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function tituloModo(modo: ModoCelula): string {
  if (modo === 'entradas') return 'Entradas do dia';
  if (modo === 'saidas') return 'Saídas do dia';
  if (modo === 'saldo') return 'Composição do saldo';
  return 'Transações do dia';
}

export interface ResumoDiaValorHoverProps {
  valorExibido: string;
  linhas: ResumoDiaLinhaDetalhe[];
  modo: ModoCelula;
  className?: string;
  dataLabel?: string;
}

export function ResumoDiaValorHover({ valorExibido, linhas, modo, className = '', dataLabel }: ResumoDiaValorHoverProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const detalhes = linhasParaModo(linhas, modo);
  const temDetalhe = detalhes.length > 0;

  const atualizarPos = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const popoverW = 288;
    let left = rect.right - popoverW;
    left = Math.max(8, Math.min(left, window.innerWidth - popoverW - 8));
    const top = rect.bottom + 6;
    setPos({ top, left });
  }, []);

  useEffect(() => {
    if (!aberto) return;
    atualizarPos();
    const onScroll = () => atualizarPos();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [aberto, atualizarPos]);

  const popover =
    aberto && temDetalhe && pos
      ? createPortal(
          <div
            role="tooltip"
            className="fixed z-[200] w-72 rounded-lg border border-slate-200 bg-white p-2.5 text-left shadow-lg ring-1 ring-slate-900/5 dark:border-slate-600 dark:bg-slate-900 dark:ring-slate-700"
            style={{ top: pos.top, left: pos.left }}
            onMouseEnter={() => setAberto(true)}
            onMouseLeave={() => setAberto(false)}
          >
            <p className="text-[11px] font-semibold text-slate-800 dark:text-slate-100">
              {tituloModo(modo)}
              {dataLabel ? <span className="font-normal text-slate-500"> · {dataLabel}</span> : null}
            </p>
            <div className="mt-1 max-h-44 overflow-y-auto text-xs">
              {modo === 'saldo' ? (
                <>
                  {linhas.some((l) => l.tipo === 'entrada') ? (
                    <>
                      <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Entradas</p>
                      <ListaDetalhe linhas={linhas.filter((l) => l.tipo === 'entrada')} />
                    </>
                  ) : null}
                  {linhas.some((l) => l.tipo === 'saida') ? (
                    <>
                      <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-rose-700 dark:text-rose-400">Saídas</p>
                      <ListaDetalhe linhas={linhas.filter((l) => l.tipo === 'saida')} />
                    </>
                  ) : null}
                </>
              ) : (
                <ListaDetalhe linhas={detalhes} />
              )}
            </div>
            <p className="mt-1.5 border-t border-slate-100 pt-1.5 text-[10px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
              {modo === 'saldo'
                ? `Saldo = entradas − saídas · ${linhas.length} movimentos`
                : `${detalhes.length} ${detalhes.length === 1 ? 'lançamento' : 'lançamentos'}`}
            </p>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <span
        ref={anchorRef}
        className={`inline-block tabular-nums ${temDetalhe ? 'cursor-help border-b border-dotted border-current/40' : ''} ${className}`}
        onMouseEnter={() => {
          if (!temDetalhe) return;
          atualizarPos();
          setAberto(true);
        }}
        onMouseLeave={() => setAberto(false)}
        aria-describedby={aberto && temDetalhe ? 'resumo-dia-detalhe' : undefined}
      >
        {valorExibido}
      </span>
      {popover}
    </>
  );
}
