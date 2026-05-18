import { useEffect, useMemo, useState, type MutableRefObject } from 'react';

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

type CalendarCell = {
  iso: string;
  dia: number;
  inCurrentMonth: boolean;
};

function monthShift(mes: number, ano: number, delta: number): { mes: number; ano: number } {
  const d = new Date(ano, mes - 1 + delta, 1);
  return { mes: d.getMonth() + 1, ano: d.getFullYear() };
}

function buildCalendarCells(mes: number, ano: number): CalendarCell[] {
  const first = new Date(ano, mes - 1, 1);
  const startWeekday = first.getDay();
  const currentLastDay = new Date(ano, mes, 0).getDate();
  const prev = monthShift(mes, ano, -1);
  const prevLastDay = new Date(prev.ano, prev.mes, 0).getDate();
  const cells: CalendarCell[] = [];

  for (let i = startWeekday - 1; i >= 0; i--) {
    const day = prevLastDay - i;
    cells.push({
      dia: day,
      iso: `${prev.ano}-${String(prev.mes).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      inCurrentMonth: false,
    });
  }

  for (let day = 1; day <= currentLastDay; day++) {
    cells.push({
      dia: day,
      iso: `${ano}-${String(mes).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      inCurrentMonth: true,
    });
  }

  const next = monthShift(mes, ano, 1);
  let nextDay = 1;
  while (cells.length < 42) {
    cells.push({
      dia: nextDay,
      iso: `${next.ano}-${String(next.mes).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`,
      inCurrentMonth: false,
    });
    nextDay += 1;
  }

  return cells;
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
  const [viewMes, setViewMes] = useState(mes);
  const [viewAno, setViewAno] = useState(ano);

  useEffect(() => {
    if (!aberto) return;
    setViewMes(mes);
    setViewAno(ano);
  }, [aberto, mes, ano]);

  const celulas = useMemo(() => buildCalendarCells(viewMes, viewAno), [viewMes, viewAno]);

  if (!aberto) return null;

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Calendário de ${tituloMes(viewMes, viewAno)}`}
      className="absolute left-0 top-full z-50 mt-1.5 min-w-[280px] max-w-[min(100vw-2rem,320px)] rounded-xl border border-slate-200 bg-white p-3 shadow-xl ring-1 ring-slate-900/5 dark:border-slate-600 dark:bg-slate-900 dark:ring-white/10"
    >
      <div className="mb-2 flex items-center justify-between gap-2 border-b border-slate-100 pb-2 dark:border-slate-700">
        <button
          type="button"
          onClick={() => {
            const prev = monthShift(viewMes, viewAno, -1);
            setViewMes(prev.mes);
            setViewAno(prev.ano);
          }}
          className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="Mês anterior"
        >
          ←
        </button>
        <p className="text-sm font-semibold capitalize text-slate-900 dark:text-slate-100">{tituloMes(viewMes, viewAno)}</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              const next = monthShift(viewMes, viewAno, 1);
              setViewMes(next.mes);
              setViewAno(next.ano);
            }}
            className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="Próximo mês"
          >
            →
          </button>
          <button
            type="button"
            onClick={onFechar}
            className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Fechar
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {DIAS_SEMANA.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {celulas.map(({ dia, iso, inCurrentMonth }) => (
          <button
            key={iso}
            type="button"
            onClick={() => onDiaClick(iso)}
            className={`flex aspect-square items-center justify-center rounded-lg text-sm font-medium transition-colors ${getDiaClasse(iso)} ${
              inCurrentMonth ? '' : 'opacity-60'
            }`}
          >
            {dia}
          </button>
        ))}
      </div>
    </div>
  );
}
