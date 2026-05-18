import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import { getFluxoAbaTabStyle, getFluxoModalidadeTabStyle } from '../../fluxo/fluxoPlanilhaCores';
import type { ReceitaPorAbaModalidade } from '../../fluxo/fluxoAbaHierarchy';
import { formatBrl, formatPct } from '../../logic/overviewDashboard';

type View = { level: 'abas' } | { level: 'modalidades'; aba: string };

type AbaChartRow = {
  key: string;
  aba: string;
  label: string;
  fullName: string;
  value: number;
  pct: number;
  modalidadeCount: number;
};

type ModChartRow = {
  key: string;
  modalidade: string;
  label: string;
  fullName: string;
  value: number;
  pct: number;
  pctMes: number;
};

type ModalityRevenueDrilldownChartProps = {
  data: ReceitaPorAbaModalidade;
  isLoading?: boolean;
};

function formatAxisK(value: number): string {
  const v = Math.abs(value);
  if (v >= 1_000_000) return `${(value / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`;
  if (v >= 1000) return `${(value / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}k`;
  return String(value);
}

function formatBarLabel(value: number, pct: number): string {
  return `${formatBrl(value)} · ${formatPct(pct)}`;
}

export function ModalityRevenueDrilldownChart({ data, isLoading }: ModalityRevenueDrilldownChartProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const gridStroke = isDark ? '#334155' : '#e5e7eb';
  const tickStroke = isDark ? '#94a3b8' : '#6b7280';
  const [view, setView] = useState<View>({ level: 'abas' });

  const abaRows = useMemo<AbaChartRow[]>(
    () =>
      data.abas.map((r) => ({
        key: r.aba,
        aba: r.aba,
        label: r.aba.length > 22 ? `${r.aba.slice(0, 21)}…` : r.aba,
        fullName: r.aba,
        value: r.value,
        pct: r.pctMes,
        modalidadeCount: r.modalidadeCount,
      })),
    [data.abas],
  );

  const activeAba = view.level === 'modalidades' ? view.aba : null;
  const modRows = useMemo<ModChartRow[]>(() => {
    if (!activeAba) return [];
    const rows = data.porAba.get(activeAba) ?? [];
    return rows.map((r) => ({
      key: r.modalidade,
      modalidade: r.modalidade,
      label: r.label,
      fullName: r.fullName,
      value: r.value,
      pct: r.pctAba,
      pctMes: r.pctMes,
    }));
  }, [activeAba, data.porAba]);

  const chartRows = view.level === 'abas' ? abaRows : modRows;
  const chartHeight = Math.min(520, Math.max(220, chartRows.length * 40 + 24));

  const totalAba =
    view.level === 'modalidades' ? (data.abas.find((a) => a.aba === view.aba)?.value ?? 0) : 0;
  const pctAbaNoMes =
    view.level === 'modalidades' ? (data.abas.find((a) => a.aba === view.aba)?.pctMes ?? 0) : 0;

  if (isLoading) {
    return (
      <div
        className="flex w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-50 animate-pulse dark:border-slate-700 dark:bg-slate-900/50"
        style={{ height: chartHeight }}
      >
        <span className="text-sm text-slate-400">Carregando…</span>
      </div>
    );
  }

  if (!data.abas.length) {
    return (
      <div
        className="flex w-full items-center justify-center rounded-xl border border-dashed border-slate-200 px-4 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400"
        style={{ height: 220 }}
      >
        Nenhum pagamento no Fluxo para este mês de competência.
      </div>
    );
  }

  const chartData = [...chartRows].reverse();

  const panelClass = isDark
    ? 'rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 shadow-lg'
    : 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-lg';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      {view.level === 'modalidades' ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setView({ level: 'abas' })}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            aria-label="Voltar ao total do mês"
          >
            ← Voltar ao total do mês
          </button>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Mensalidades · <span className="font-semibold text-slate-800 dark:text-slate-100">{view.aba}</span>
          </span>
        </div>
      ) : null}

      <div className="mb-3 space-y-0.5">
        {view.level === 'abas' ? (
          <>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Por atividade (aba)</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Total do mês:{' '}
              <span className="font-semibold text-slate-800 dark:text-slate-200">{formatBrl(data.totalMes)}</span>
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{view.aba} — por modalidade</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Total da aba:{' '}
              <span className="font-semibold text-slate-800 dark:text-slate-200">{formatBrl(totalAba)}</span>
              {' · '}
              {formatPct(pctAbaNoMes)} do mês
            </p>
          </>
        )}
      </div>

      <div className="w-full" style={{ height: chartHeight }} key={`${view.level}-${activeAba ?? ''}`}>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 4, right: 120, left: 4, bottom: 4 }}
            barCategoryGap="18%"
          >
            <CartesianGrid strokeDasharray="4 4" stroke={gridStroke} horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={formatAxisK}
              tick={{ fontSize: 11, fill: tickStroke }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={168}
              tick={{ fontSize: 11, fill: tickStroke }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: isDark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.2)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.[0]?.payload) return null;
                const row = payload[0].payload as AbaChartRow | ModChartRow;
                if (view.level === 'abas' && 'modalidadeCount' in row) {
                  const abaRow = row as AbaChartRow;
                  return (
                    <div className={panelClass}>
                      <p className="max-w-xs text-xs font-semibold leading-snug">{abaRow.fullName}</p>
                      <p className="mt-1 text-sm tabular-nums">
                        {formatBrl(abaRow.value)} · {formatPct(abaRow.pct)} do mês
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        {abaRow.modalidadeCount}{' '}
                        {abaRow.modalidadeCount === 1 ? 'modalidade' : 'modalidades'} — clique para detalhar
                      </p>
                    </div>
                  );
                }
                const modRow = row as ModChartRow;
                return (
                  <div className={panelClass}>
                    <p className="max-w-xs text-xs font-semibold leading-snug">{modRow.fullName}</p>
                    <p className="mt-1 text-sm tabular-nums">
                      {formatBrl(modRow.value)} · {formatPct(modRow.pct)} da aba
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {formatPct(modRow.pctMes)} do mês
                    </p>
                  </div>
                );
              }}
            />
            <Bar
              dataKey="value"
              name="Valor"
              radius={[0, 4, 4, 0]}
              maxBarSize={28}
              cursor={view.level === 'abas' ? 'pointer' : 'default'}
              onClick={(entry) => {
                if (view.level !== 'abas') return;
                const row = (entry as { payload?: AbaChartRow })?.payload;
                if (row?.aba) setView({ level: 'modalidades', aba: row.aba });
              }}
            >
              {chartData.map((row) => {
                const fill =
                  view.level === 'abas'
                    ? getFluxoAbaTabStyle((row as AbaChartRow).aba).tab
                    : getFluxoModalidadeTabStyle(activeAba ?? '', (row as ModChartRow).fullName).tab;
                const dimmed = row.label.startsWith('Outras');
                return <Cell key={row.key} fill={fill} fillOpacity={dimmed ? 0.65 : 1} />;
              })}
              <LabelList
                dataKey="value"
                position="right"
                formatter={(value: number, _name: string, item: { payload?: AbaChartRow | ModChartRow }) => {
                  const p = item?.payload;
                  if (!p || value == null) return '';
                  return formatBarLabel(Number(value), p.pct);
                }}
                style={{ fontSize: 10, fill: tickStroke }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
        {view.level === 'abas'
          ? 'Clique em uma atividade para ver as modalidades. Passe o mouse para o resumo.'
          : 'Percentual na barra é da aba selecionada.'}
      </p>
    </div>
  );
}
