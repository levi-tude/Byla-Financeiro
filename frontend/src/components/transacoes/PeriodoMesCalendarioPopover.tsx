import type { MutableRefObject } from 'react';

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function tituloMes(mes: number, ano: number): string {
  const d = new Date(ano, mes - 1, 1);
  const s = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface PeriodoMesCalendarioPopoverProps {
  mes: number;
  ano: number;
  aberto: boolean;
  onFechar: () => void;
  onDiaClick: (dataIso: string) => void;
  getDiaClasse: (dataIso: string) => string;
  popoverRef: MutableRefObject<HTMLDivElement | null>;
}

export function PeriodoMesCalendarioPopover({
  mes,
  ano,
  aberto,
  onFechar,
  onDiaClick,
  getDiaClasse,
  popoverRef,
}: PeriodoMesCalendarioPopoverProps) {
  if (!aberto) return null;

  const first = new Date(ano, mes - 1, 1);
  const pad = first.getDay();
  const lastDay = new Date(ano, mes, 0).getDate();
  const celulas: { dia: number; iso: string }[] = [];
  for (let d = 1; d <= lastDay; d++) {
    const iso = `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    celulas.push({ dia: d, iso });
  }

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Calendário de ${tituloMes(mes, ano)}`}
      className="absolute left-0 top-full z-50 mt-1.5 min-w-[280px] max-w-[min(100vw-2rem,320px)] rounded-xl border border-slate-200 bg-white p-3 shadow-xl ring-1 ring-slate-900/5 dark:border-slate-600 dark:bg-slate-900 dark:ring-white/10"
    >
      <div className="mb-2 flex items-center justify-between gap-2 border-b border-slate-100 pb-2 dark:border-slate-700">
        <p className="text-sm font-semibold capitalize text-slate-900 dark:text-slate-100">{tituloMes(mes, ano)}</p>
        <button
          type="button"
          onClick={onFechar}
          className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Fechar
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {DIAS_SEMANA.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: pad }, (_, i) => (
          <span key={`pad-${i}`} className="aspect-square" aria-hidden />
        ))}
        {celulas.map(({ dia, iso }) => (
          <button
            key={iso}
            type="button"
            onClick={() => onDiaClick(iso)}
            className={`flex aspect-square items-center justify-center rounded-lg text-sm font-medium transition-colors ${getDiaClasse(iso)}`}
          >
            {dia}
          </button>
        ))}
      </div>
    </div>
  );
}
