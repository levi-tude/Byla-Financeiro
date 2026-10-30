import { motion, useReducedMotion } from 'motion/react';
import { useMemo } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import { EChart } from './EChart';
import { fmt, fmtMes } from './format';
import type { Dataset, Secao } from './types';
import { NumberTicker } from '../components/magicui/NumberTicker';
import { BorderBeam } from '../components/magicui/BorderBeam';

export const PALETA = ['#f43f5e', '#818cf8', '#22d3ee', '#fbbf24', '#34d399', '#c084fc', '#fb923c', '#94a3b8'];
const AXIS = { axisLine: { lineStyle: { color: '#334155' } }, axisLabel: { color: '#94a3b8' }, splitLine: { lineStyle: { color: '#1e293b' } } };
const TOOLTIP = {
  backgroundColor: 'rgba(2,6,23,0.92)',
  borderColor: '#334155',
  textStyle: { color: '#e2e8f0' },
  extraCssText: 'backdrop-filter: blur(6px); border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.4);',
};

function col(ds: Dataset, key: string) {
  return ds.colunas.find((c) => c.key === key) ?? { key, label: key, formato: 'texto' as const };
}

function useAnim() {
  const reduce = useReducedMotion();
  return reduce ? { animation: false } : { animationDuration: 1100, animationEasing: 'cubicOut' as const, animationDurationUpdate: 700 };
}

function SeriesChart({ s, ds }: { s: Extract<Secao, { x: string; series: string[] }>; ds: Dataset }) {
  const anim = useAnim();
  const option = useMemo<EChartsCoreOption>(() => {
    const xs = ds.linhas.map((l) => (col(ds, s.x).formato === 'mes' ? fmtMes(l[s.x]!) : String(l[s.x])));
    const isBar = s.type === 'bar_chart';
    return {
      ...anim,
      color: PALETA,
      grid: { left: 8, right: 16, top: 48, bottom: 12, containLabel: true },
      legend: { top: 4, textStyle: { color: '#cbd5e1' } },
      tooltip: {
        ...TOOLTIP,
        trigger: 'axis',
        axisPointer: { type: isBar ? 'shadow' : 'cross', lineStyle: { color: '#475569' } },
        valueFormatter: (v: number) => fmt(v, col(ds, s.series[0]!).formato),
      },
      dataZoom: [{ type: 'inside' }],
      xAxis: { type: 'category', data: xs, boundaryGap: isBar, ...AXIS },
      yAxis: { type: 'value', ...AXIS, axisLabel: { color: '#94a3b8', formatter: (v: number) => fmt(v, col(ds, s.series[0]!).formato, true) } },
      series: s.series.map((k, i) => ({
        id: k,
        name: col(ds, k).label,
        type: isBar ? 'bar' : 'line',
        data: ds.linhas.map((l) => l[k]),
        smooth: true,
        stack: s.empilhado ? 'total' : undefined,
        barMaxWidth: 42,
        symbolSize: 9,
        universalTransition: true,
        itemStyle: isBar ? { borderRadius: [8, 8, 0, 0] } : undefined,
        lineStyle: { width: 3 },
        areaStyle:
          s.type === 'area_chart'
            ? { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: `${PALETA[i]}88` }, { offset: 1, color: `${PALETA[i]}05` }] } }
            : undefined,
        emphasis: { focus: 'series' },
        animationDelay: (idx: number) => idx * 120 + i * 200,
      })),
    };
  }, [s, ds, anim]);
  return <EChart option={option} />;
}

function Donut({ s, ds }: { s: Extract<Secao, { type: 'donut' }>; ds: Dataset }) {
  const anim = useAnim();
  const f = col(ds, s.valor).formato;
  const total = ds.linhas.reduce((a, l) => a + Number(l[s.valor] ?? 0), 0);
  const option = useMemo<EChartsCoreOption>(
    () => ({
      ...anim,
      color: PALETA,
      tooltip: { ...TOOLTIP, trigger: 'item', formatter: (p: { name: string; value: number; percent: number }) => `<b>${p.name}</b><br/>${fmt(p.value, f)} · ${p.percent}%` },
      legend: { orient: 'vertical', right: 0, top: 'middle', textStyle: { color: '#cbd5e1' } },
      series: [
        {
          type: 'pie',
          radius: ['52%', '78%'],
          center: ['38%', '50%'],
          itemStyle: { borderColor: '#020617', borderWidth: 3, borderRadius: 10 },
          label: { show: true, position: 'center', formatter: () => fmt(total, f, true), color: '#f8fafc', fontSize: 22, fontWeight: 700 },
          emphasis: { scale: true, scaleSize: 10 },
          animationType: 'scale',
          data: ds.linhas.map((l) => ({ name: String(l[s.label]), value: l[s.valor] })),
        },
      ],
    }),
    [s, ds, anim, f, total],
  );
  return <EChart option={option} />;
}

function Ranking({ s, ds }: { s: Extract<Secao, { type: 'ranking' }>; ds: Dataset }) {
  const reduce = useReducedMotion();
  const f = col(ds, s.valor).formato;
  const rows = [...ds.linhas].sort((a, b) => Number(b[s.valor]) - Number(a[s.valor])).slice(0, s.top ?? 10);
  const max = Math.max(1, ...rows.map((r) => Number(r[s.valor])));
  return (
    <ol className="space-y-3">
      {rows.map((r, i) => (
        <motion.li
          key={String(r[s.label])}
          initial={reduce ? false : { opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.08, type: 'spring', stiffness: 160, damping: 20 }}
          className="group"
        >
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 text-slate-200">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-white/5 text-xs font-semibold text-slate-400">{i + 1}</span>
              {String(r[s.label])}
            </span>
            <span className="font-semibold tabular-nums text-white">{fmt(r[s.valor], f)}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white/5">
            <motion.div
              className="h-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${PALETA[i % PALETA.length]}, ${PALETA[(i + 1) % PALETA.length]})` }}
              initial={reduce ? false : { width: 0 }}
              animate={{ width: `${(Number(r[s.valor]) / max) * 100}%` }}
              transition={{ delay: 0.2 + i * 0.08, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </motion.li>
      ))}
    </ol>
  );
}

function Comparison({ s, ds }: { s: Extract<Secao, { type: 'comparison' }>; ds: Dataset }) {
  const a = ds.linhas[s.a]!;
  const b = ds.linhas[s.b]!;
  const xf = col(ds, s.x).formato;
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {s.colunas.map((k, i) => {
        const c = col(ds, k);
        const va = Number(a[k]);
        const vb = Number(b[k]);
        const delta = va !== 0 ? ((vb - va) / Math.abs(va)) * 100 : null;
        const up = vb >= va;
        return (
          <motion.div
            key={k}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.12 }}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
          >
            <div className="text-xs uppercase tracking-widest text-slate-400">{c.label}</div>
            <div className="mt-3 flex items-end justify-between gap-2">
              <div>
                <div className="text-xs text-slate-500">{fmt(a[s.x], xf)}</div>
                <div className="text-lg font-medium text-slate-300 tabular-nums">{fmt(va, c.formato)}</div>
              </div>
              <div className="text-2xl text-slate-600">→</div>
              <div className="text-right">
                <div className="text-xs text-slate-500">{fmt(b[s.x], xf)}</div>
                <div className="text-xl font-semibold text-white tabular-nums">{fmt(vb, c.formato)}</div>
              </div>
            </div>
            {delta != null ? (
              <div className={`mt-3 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${up ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
                {up ? '▲' : '▼'} {Math.abs(delta).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
              </div>
            ) : null}
          </motion.div>
        );
      })}
    </div>
  );
}

function Tabela({ s, ds }: { s: Extract<Secao, { type: 'table' }>; ds: Dataset }) {
  const cols = (s.colunas?.length ? s.colunas : ds.colunas.map((c) => c.key)).map((k) => col(ds, k));
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full text-sm">
        <thead className="bg-white/[0.04] text-left text-xs uppercase tracking-wider text-slate-400">
          <tr>{cols.map((c) => <th key={c.key} className={`px-4 py-3 ${c.formato === 'brl' || c.formato === 'numero' ? 'text-right' : ''}`}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {ds.linhas.map((l, i) => (
            <motion.tr key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }} className="border-t border-white/5 hover:bg-white/[0.03]">
              {cols.map((c) => (
                <td key={c.key} className={`px-4 py-2.5 ${c.formato === 'brl' || c.formato === 'numero' ? 'text-right tabular-nums' : ''} ${typeof l[c.key] === 'number' && Number(l[c.key]) < 0 ? 'text-rose-300' : 'text-slate-200'}`}>
                  {fmt(l[c.key], c.formato)}
                </td>
              ))}
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function KpiCards({ s }: { s: Extract<Secao, { type: 'kpi_cards' }> }) {
  const reduce = useReducedMotion();
  return (
    <div className={`grid gap-4 sm:grid-cols-2 ${s.itens.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
      {s.itens.map((k, i) => (
        <motion.div
          key={`${k.label}-${i}`}
          initial={reduce ? false : { opacity: 0, y: 28, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.1 + i * 0.1, type: 'spring', stiffness: 140, damping: 18 }}
          whileHover={reduce ? undefined : { y: -4 }}
          className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.01] p-5 shadow-xl shadow-black/30"
        >
          <BorderBeam delay={i * 2} />
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">{k.label}</div>
          <div className={`mt-3 text-2xl font-bold sm:text-3xl ${k.valor < 0 ? 'text-rose-300' : 'text-white'}`}>
            <NumberTicker value={k.valor} delay={0.2 + i * 0.1} format={(n) => fmt(n, k.formato)} />
          </div>
        </motion.div>
      ))}
    </div>
  );
}

export function SectionView({ s, datasets }: { s: Secao; datasets: Dataset[] }) {
  if (s.type === 'narrative')
    return <p className="max-w-3xl text-lg leading-relaxed text-slate-200 sm:text-xl">{s.texto}</p>;
  if (s.type === 'kpi_cards') return <KpiCards s={s} />;
  const ds = datasets.find((d) => d.id === s.dataset);
  if (!ds) return null;
  switch (s.type) {
    case 'line_chart':
    case 'bar_chart':
    case 'area_chart':
      return <SeriesChart s={s} ds={ds} />;
    case 'donut':
      return <Donut s={s} ds={ds} />;
    case 'ranking':
      return <Ranking s={s} ds={ds} />;
    case 'comparison':
      return <Comparison s={s} ds={ds} />;
    case 'table':
      return <Tabela s={s} ds={ds} />;
  }
}

export function fonteDaSecao(s: Secao, datasets: Dataset[]): string | null {
  if (s.type === 'narrative') return null;
  const id = s.type === 'kpi_cards' ? s.itens[0]?.dataset : s.dataset;
  return datasets.find((d) => d.id === id)?.fonte ?? null;
}
