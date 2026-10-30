/**
 * PROTÓTIPO – não mesclar. Fluxo "chat único" do Consulta Byla (rota de demo só em dev: /proto/chat-unico).
 * - Sem IA: respostas vêm de `responderMock` (palavras-chave) com DADOS DE EXEMPLO fictícios.
 * - Reaproveita do PR #39: SectionView/EChart (ECharts), Apresentacao, NumberTicker/BorderBeam (Magic UI, MIT), Motion.
 * - "Salvar" grava só no localStorage do navegador (protótipo); nada vai ao banco.
 */
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import { useTheme } from '../context/ThemeContext';
import { EChart } from '../criacoes/EChart';
import { chartTheme, fonteDaSecao, PALETA, SectionView } from '../criacoes/SectionView';
import { fmt } from '../criacoes/format';
import { secoesRenderizaveis, type Secao } from '../criacoes/types';
import { Apresentacao } from '../pages/CriacoesIaPage';
import { NumberTicker } from '../components/magicui/NumberTicker';
import { BorderBeam } from '../components/magicui/BorderBeam';
import { DADOS_ATE, MESES_EX, ROTULO, SELO_EXEMPLO, SUGESTOES_CHAT, responderMock, specDaVisao, type Metrica, type RespostaMock, type Visao } from './exemploDados';

type Msg = { id: number; de: 'gestor' | 'byla'; texto: string; cartao?: RespostaMock['cartao'] };
type Salva = { id: string; nome: string; escopo: 'privado' | 'gestores'; visao: Visao; em: string };
const LS = 'byla.proto.chatUnico.salvas.v1';

const brl = (n: number) => fmt(n, 'brl');

/* ---------- ícones inline (sem dependência nova) ---------- */
const I = {
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  play: <path d="M7 5v14l11-7z" />,
  bookmark: <path d="M6 4h12v16l-6-4-6 4z" />,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c.6-3.4 3-5 6-5s5.4 1.6 6 5" /><circle cx="17" cy="9" r="2.5" /><path d="M16 14.2c2.6.2 4.4 1.8 5 4.8" /></>,
  chat: <path d="M4 5h16v11H9l-5 4z" />,
  send: <path d="M4 12l16-8-6 16-2.5-6.5z" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  spark: <path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />,
  cal: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
};
function Icon({ d, className = 'h-4 w-4' }: { d: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {d}
    </svg>
  );
}

function SeloDados({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/70 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 ${className}`}>
      <Icon d={I.cal} className="h-3 w-3" /> dados até {DADOS_ATE}
    </span>
  );
}
function SeloExemplo() {
  return <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Exemplo</span>;
}

/* ---------- mini-gráfico do cartão inline ---------- */
function MiniChart({ c }: { c: RespostaMock['cartao'] }) {
  const { theme } = useTheme();
  const t = chartTheme(theme === 'dark');
  const reduce = useReducedMotion();
  const option = useMemo<EChartsCoreOption>(() => {
    const base = {
      animation: !reduce,
      animationDuration: 1400,
      animationEasing: 'cubicOut' as const,
      grid: { left: 2, right: 2, top: 8, bottom: 18 },
      tooltip: { ...t.tooltip, trigger: 'axis', valueFormatter: (v: number) => brl(v) },
      xAxis: { type: 'category', data: c.eixo, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: t.axis.axisLabel.color, fontSize: 10 }, boundaryGap: c.tipo === 'mini_barras' },
      yAxis: { type: 'value', show: false, min: c.tipo === 'mini_barras' ? 0 : 'dataMin' },
    };
    if (c.tipo === 'mini_barras') {
      return {
        ...base,
        series: [
          { name: 'Entradas', type: 'bar', data: c.serie, barWidth: 18, itemStyle: { color: PALETA[0], borderRadius: [6, 6, 0, 0] }, animationDelay: (i: number) => i * 160 },
          { name: 'Saídas', type: 'bar', data: c.serie2, barWidth: 18, itemStyle: { color: PALETA[1], borderRadius: [6, 6, 0, 0] }, animationDelay: (i: number) => 120 + i * 160 },
        ],
      };
    }
    return {
      ...base,
      series: [
        {
          type: 'line',
          data: c.serie,
          smooth: true,
          symbolSize: 6,
          lineStyle: { width: 2.5, color: PALETA[0] },
          itemStyle: { color: PALETA[0] },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: `${PALETA[0]}66` }, { offset: 1, color: `${PALETA[0]}00` }] } },
        },
      ],
    };
  }, [c, t, reduce]);
  return <EChart option={option} height={110} />;
}

/* ---------- cartão compacto inline ---------- */
function CartaoInline({ c, onAbrir, onApresentar, onSalvar }: { c: RespostaMock['cartao']; onAbrir: () => void; onApresentar: () => void; onSalvar: () => void }) {
  const reduce = useReducedMotion();
  const up = (c.delta ?? 0) >= 0;
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 160, damping: 20, delay: 0.15 }}
      className="relative mt-3 w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-lg shadow-slate-300/40 dark:border-white/10 dark:bg-slate-900/80 dark:shadow-black/40"
    >
      <BorderBeam size={70} duration={9} />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
          <span className="grid h-6 w-6 place-items-center rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-300"><Icon d={I.spark} className="h-3.5 w-3.5" /></span>
          {c.titulo}
        </div>
        <div className="flex items-center gap-1.5"><SeloExemplo /><SeloDados /></div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{c.rotulo}</div>
          <div className="mt-1 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            <NumberTicker value={c.valor} format={brl} delay={0.25} />
          </div>
        </div>
        {c.delta != null ? (
          <span className={`mb-1 rounded-full px-2 py-0.5 text-xs font-semibold ${up ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'}`}>
            {up ? '▲' : '▼'} {Math.abs(c.delta).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% vs mês anterior
          </span>
        ) : null}
      </div>
      <div className="-mx-1 mt-1"><MiniChart c={c} /></div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <button type="button" onClick={onAbrir} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"><Icon d={I.expand} className="h-3.5 w-3.5" />Abrir</button>
        <button type="button" onClick={onApresentar} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5"><Icon d={I.play} className="h-3.5 w-3.5" />Apresentar</button>
        <button type="button" onClick={onSalvar} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5"><Icon d={I.bookmark} className="h-3.5 w-3.5" />Salvar</button>
      </div>
    </motion.div>
  );
}

/* ---------- visualização em tela cheia com filtros ---------- */
function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo} className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${ativo ? 'bg-slate-900 text-white shadow dark:bg-white dark:text-slate-900' : 'text-slate-600 hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/10'}`}>
      {children}
    </button>
  );
}
const nomeMes = (i: number) => fmt(MESES_EX[i]!.mes, 'mes');

function TelaCheia({ inicial, onClose, onApresentar, onSalvar }: { inicial: Visao; onClose: () => void; onApresentar: (v: Visao) => void; onSalvar: (v: Visao) => void }) {
  const [v, setV] = useState<Visao>(inicial);
  const reduce = useReducedMotion();
  const spec = useMemo(() => specDaVisao(v), [v]);
  const secoes = secoesRenderizaveis(spec);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const toggleMetrica = (m: Metrica) =>
    setV((x) => {
      const has = x.metricas.includes(m);
      const metricas = has ? x.metricas.filter((y) => y !== m) : [...x.metricas, m];
      return metricas.length ? { ...x, metricas: (['entradas', 'saidas', 'saldo'] as Metrica[]).filter((y) => metricas.includes(y)) } : x;
    });
  const larga = (s: Secao) => s.type === 'kpi_cards' || s.type === 'table' || s.type === 'comparison' || s.type === 'bar_chart';

  return (
    <motion.div
      className="fixed inset-0 z-[90] overflow-y-auto bg-slate-50 text-slate-900 dark:bg-[#020617] dark:text-white"
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      role="dialog"
      aria-label="Visualização em tela cheia"
    >
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(225,29,72,0.10),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(99,102,241,0.10),transparent_55%)] dark:bg-[radial-gradient(ellipse_at_top_left,rgba(225,29,72,0.18),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(99,102,241,0.16),transparent_55%)]" />
      <header className="sticky top-0 z-10 border-b border-slate-200/70 bg-slate-50/80 backdrop-blur-xl dark:border-white/10 dark:bg-[#020617]/70">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <div className="flex items-center gap-2"><SeloExemplo /><SeloDados /></div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{v.titulo}</h1>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => onSalvar(v)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-white dark:border-white/15 dark:hover:bg-white/5"><Icon d={I.bookmark} />Salvar</button>
            <button type="button" onClick={() => onApresentar(v)} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900"><Icon d={I.play} />Apresentar</button>
            <button type="button" onClick={onClose} aria-label="Fechar" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 hover:bg-white dark:border-white/15 dark:hover:bg-white/5"><Icon d={I.x} /></button>
          </div>
        </div>
        {v.foco !== 'pilates' ? (
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-5 pb-4 text-xs">
            <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-white/5">
              <span className="px-2 text-slate-500 dark:text-slate-400">Período</span>
              {([3, 4, 6] as const).map((n) => <Chip key={n} ativo={v.meses === n} onClick={() => setV({ ...v, meses: n })}>{n} meses</Chip>)}
            </div>
            <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-white/5">
              <span className="px-2 text-slate-500 dark:text-slate-400">Métricas</span>
              {(['entradas', 'saidas', 'saldo'] as Metrica[]).map((m) => <Chip key={m} ativo={v.metricas.includes(m)} onClick={() => toggleMetrica(m)}>{ROTULO[m]}</Chip>)}
            </div>
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-3 pr-1 dark:border-white/10 dark:bg-white/5">
              <label className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <input type="checkbox" className="accent-rose-500" checked={!!v.comparar} onChange={(e) => setV({ ...v, comparar: e.target.checked ? [4, 5] : null })} />
                Comparar
              </label>
              {v.comparar ? (
                <>
                  <select aria-label="Mês A" value={v.comparar[0]} onChange={(e) => setV({ ...v, comparar: [Number(e.target.value), v.comparar![1]] })} className="rounded-full border-0 bg-slate-100 px-2 py-1 text-xs dark:bg-white/10">
                    {MESES_EX.map((_, i) => <option key={i} value={i}>{nomeMes(i)}</option>)}
                  </select>
                  <span className="text-slate-400">×</span>
                  <select aria-label="Mês B" value={v.comparar[1]} onChange={(e) => setV({ ...v, comparar: [v.comparar![0], Number(e.target.value)] })} className="rounded-full border-0 bg-slate-100 px-2 py-1 text-xs dark:bg-white/10">
                    {MESES_EX.map((_, i) => <option key={i} value={i}>{nomeMes(i)}</option>)}
                  </select>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </header>
      <main className="relative mx-auto grid max-w-7xl gap-5 px-5 py-6 lg:grid-cols-2">
        {secoes.map((s, i) => (
          <motion.section
            layout={!reduce}
            key={`${s.type}-${'titulo' in s ? s.titulo : i}`}
            initial={reduce ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
            className={`min-w-0 rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-xl shadow-slate-300/30 backdrop-blur dark:border-white/10 dark:bg-slate-900/60 dark:shadow-black/40 ${larga(s) ? 'lg:col-span-2' : ''}`}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold">{'titulo' in s ? s.titulo : ''}</h2>
              <SeloDados />
            </div>
            <SectionView s={s} datasets={spec.datasets} />
            {fonteDaSecao(s, spec.datasets) ? <p className="mt-4 text-[11px] text-slate-500">Fonte: {fonteDaSecao(s, spec.datasets)}</p> : null}
          </motion.section>
        ))}
      </main>
    </motion.div>
  );
}

/* ---------- diálogo Salvar ---------- */
function DialogoSalvar({ visao, onCancel, onSave }: { visao: Visao; onCancel: () => void; onSave: (nome: string, escopo: Salva['escopo']) => void }) {
  const [nome, setNome] = useState(visao.titulo);
  const [escopo, setEscopo] = useState<Salva['escopo']>('privado');
  const reduce = useReducedMotion();
  const Opcao = ({ v, icon, titulo, desc }: { v: Salva['escopo']; icon: ReactNode; titulo: string; desc: string }) => (
    <button
      type="button"
      role="radio"
      aria-checked={escopo === v}
      onClick={() => setEscopo(v)}
      className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition ${escopo === v ? 'border-rose-400 bg-rose-50 ring-2 ring-rose-400/30 dark:border-rose-400/70 dark:bg-rose-500/10' : 'border-slate-200 hover:border-slate-300 dark:border-white/10 dark:hover:border-white/20'}`}
    >
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${escopo === v ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'}`}><Icon d={icon} /></span>
      <span>
        <span className="block text-sm font-semibold text-slate-900 dark:text-white">{titulo}</span>
        <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{desc}</span>
      </span>
    </button>
  );
  return (
    <motion.div className="fixed inset-0 z-[120] grid place-items-center bg-slate-900/40 p-4 backdrop-blur-sm dark:bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCancel}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Salvar visão"
        onClick={(e) => e.stopPropagation()}
        initial={reduce ? false : { opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-slate-900"
      >
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Salvar visão</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Ela reabre sempre com os dados mais recentes.</p>
        <label className="mt-5 block text-xs font-medium text-slate-600 dark:text-slate-300">
          Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-rose-400 focus:outline-none dark:border-white/10 dark:bg-slate-950 dark:text-white" />
        </label>
        <div role="radiogroup" aria-label="Quem pode ver" className="mt-4 space-y-2">
          <Opcao v="privado" icon={I.lock} titulo="Só pra mim" desc="Aparece apenas nas suas visões salvas." />
          <Opcao v="gestores" icon={I.users} titulo="Compartilhar com gestores" desc="Todos os gestores e o admin passam a ver esta visão." />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-xl px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5">Cancelar</button>
          <button type="button" onClick={() => onSave(nome.trim() || visao.titulo, escopo)} className="rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-600/30 hover:brightness-110">Salvar</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ---------- página ---------- */
function lerSalvas(): Salva[] {
  try {
    const v = JSON.parse(localStorage.getItem(LS) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export default function ProtoChatUnicoPage() {
  const { theme, setTheme, toggleTheme } = useTheme();
  const reduce = useReducedMotion();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState('');
  const [digitando, setDigitando] = useState(false);
  const [aberta, setAberta] = useState<Visao | null>(null);
  const [apresentando, setApresentando] = useState<Visao | null>(null);
  const [salvando, setSalvando] = useState<Visao | null>(null);
  const [salvas, setSalvas] = useState<Salva[]>(lerSalvas);
  const [toast, setToast] = useState<string | null>(null);
  const [menuMobile, setMenuMobile] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const seq = useRef(1);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tema');
    if (t === 'escuro') setTheme('dark');
    if (t === 'claro') setTheme('light');
    // conversa inicial de exemplo
    const r = responderMock(SUGESTOES_CHAT[0]!)!;
    setMsgs([
      { id: seq.current++, de: 'gestor', texto: SUGESTOES_CHAT[0]! },
      { id: seq.current++, de: 'byla', texto: r.texto, cartao: r.cartao },
    ]);
  }, [setTheme]);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'end' });
  }, [msgs, digitando, reduce]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const perguntar = (p: string) => {
    const q = p.trim();
    if (!q || digitando) return;
    setTexto('');
    setMsgs((m) => [...m, { id: seq.current++, de: 'gestor', texto: q }]);
    setDigitando(true);
    setTimeout(() => {
      const r = responderMock(q);
      setMsgs((m) => [
        ...m,
        r
          ? { id: seq.current++, de: 'byla', texto: r.texto, cartao: r.cartao }
          : { id: seq.current++, de: 'byla', texto: 'No protótipo eu só sei responder as perguntas sugeridas abaixo (dados de exemplo, sem IA).' },
      ]);
      setDigitando(false);
    }, reduce ? 150 : 900);
  };

  const salvar = (nome: string, escopo: Salva['escopo']) => {
    if (!salvando) return;
    const nova: Salva = { id: `${Date.now()}`, nome, escopo, visao: { ...salvando, titulo: nome }, em: new Date().toISOString() };
    const lista = [nova, ...salvas].slice(0, 30);
    localStorage.setItem(LS, JSON.stringify(lista));
    setSalvas(lista);
    setSalvando(null);
    setToast(escopo === 'gestores' ? 'Visão compartilhada com os gestores' : 'Visão salva só pra você');
  };

  const Menu = (
    <nav className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-center gap-2 px-2">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-rose-500 to-indigo-500 text-sm font-black text-white shadow-lg shadow-rose-500/30">B</div>
        <div>
          <div className="text-sm font-bold text-slate-900 dark:text-white">Byla Financeiro</div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-amber-600 dark:text-amber-300">Protótipo</div>
        </div>
      </div>
      <div>
        <div className="px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">IA</div>
        <a className="mt-2 flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white dark:bg-white/10" href="#chat"><Icon d={I.chat} />Consulta Byla</a>
      </div>
      <div className="min-h-0 flex-1">
        <div className="flex items-center justify-between px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
          Visões salvas <span className="rounded-full bg-slate-900/5 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-white/10 dark:text-slate-300">{salvas.length}</span>
        </div>
        <ul className="mt-2 space-y-1" aria-label="Visões salvas">
          <AnimatePresence initial={false}>
            {salvas.length === 0 ? (
              <li className="px-3 py-2 text-xs text-slate-400">Nada salvo ainda. Use “Salvar” num cartão.</li>
            ) : (
              salvas.map((s) => (
                <motion.li key={s.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
                  <button type="button" onClick={() => { setAberta(s.visao); setMenuMobile(false); }} className="group flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-900/5 dark:text-slate-200 dark:hover:bg-white/5">
                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg ${s.escopo === 'gestores' ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300' : 'bg-slate-900/5 text-slate-500 dark:bg-white/10 dark:text-slate-300'}`}>
                      <Icon d={s.escopo === 'gestores' ? I.users : I.lock} className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{s.nome}</span>
                    <span className="text-[10px] text-slate-400">{s.escopo === 'gestores' ? 'gestores' : 'só eu'}</span>
                  </button>
                </motion.li>
              ))
            )}
          </AnimatePresence>
        </ul>
      </div>
      <button type="button" onClick={toggleTheme} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-white dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">
        <Icon d={theme === 'dark' ? I.sun : I.moon} /> Tema {theme === 'dark' ? 'claro' : 'escuro'}
      </button>
    </nav>
  );

  return (
    <div className="relative flex h-[100dvh] overflow-hidden bg-slate-50 text-slate-900 dark:bg-[#020617] dark:text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(225,29,72,0.08),transparent_60%),radial-gradient(ellipse_at_bottom_right,rgba(99,102,241,0.08),transparent_60%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(225,29,72,0.16),transparent_60%),radial-gradient(ellipse_at_bottom_right,rgba(99,102,241,0.14),transparent_60%)]" />
      <aside className="relative hidden w-72 shrink-0 border-r border-slate-200/80 bg-white/60 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/50 md:block">{Menu}</aside>
      <AnimatePresence>
        {menuMobile ? (
          <motion.div className="fixed inset-0 z-50 bg-slate-900/40 md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMenuMobile(false)}>
            <motion.aside initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }} className="h-full w-72 bg-white dark:bg-slate-950" onClick={(e) => e.stopPropagation()}>{Menu}</motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <section id="chat" className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200/80 px-4 py-3 backdrop-blur dark:border-white/10 sm:px-8">
          <div className="flex items-center gap-3">
            <button type="button" className="rounded-lg border border-slate-200 px-2 py-1 text-xs md:hidden dark:border-white/10" onClick={() => setMenuMobile(true)} aria-label="Abrir menu">☰</button>
            <div>
              <h1 className="text-base font-semibold sm:text-lg">Consulta Byla</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Pergunte em português. Os números vêm do extrato, não da IA.</p>
            </div>
          </div>
          <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">Protótipo · dados de exemplo</span>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
          <div className="mx-auto max-w-3xl space-y-5">
            <AnimatePresence initial={false}>
              {msgs.map((m) => (
                <motion.div key={m.id} initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className={`flex ${m.de === 'gestor' ? 'justify-end' : 'justify-start'}`}>
                  {m.de === 'gestor' ? (
                    <div className="max-w-[80%] rounded-2xl rounded-br-md bg-slate-900 px-4 py-2.5 text-sm text-white shadow dark:bg-white dark:text-slate-900">{m.texto}</div>
                  ) : (
                    <div className="flex max-w-full gap-3">
                      <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-rose-500 to-indigo-500 text-xs font-black text-white">B</div>
                      <div className="min-w-0">
                        <p className="max-w-xl text-sm leading-relaxed text-slate-700 dark:text-slate-200">{m.texto}</p>
                        {m.cartao ? (
                          <CartaoInline c={m.cartao} onAbrir={() => setAberta(m.cartao!.visao)} onApresentar={() => setApresentando(m.cartao!.visao)} onSalvar={() => setSalvando(m.cartao!.visao)} />
                        ) : null}
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
            {digitando ? (
              <div className="flex items-center gap-1.5 pl-11" aria-label="Byla está respondendo">
                {[0, 1, 2].map((i) => (
                  <motion.span key={i} className="h-2 w-2 rounded-full bg-rose-400" animate={reduce ? undefined : { y: [0, -5, 0], opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 0.9, delay: i * 0.15 }} />
                ))}
              </div>
            ) : null}
            <div ref={fim} />
          </div>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); perguntar(texto); }} className="border-t border-slate-200/80 bg-white/60 px-4 py-4 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/40 sm:px-8">
          <div className="mx-auto max-w-3xl">
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {SUGESTOES_CHAT.map((s) => (
                <button key={s} type="button" onClick={() => perguntar(s)} className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:border-rose-300 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:text-white">{s}</button>
              ))}
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm focus-within:border-rose-300 dark:border-white/10 dark:bg-slate-900">
              <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ex.: quanto entrou de Pilates em setembro?" aria-label="Pergunta" className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none" />
              <button type="submit" aria-label="Enviar" disabled={!texto.trim()} className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-rose-600 to-rose-500 text-white disabled:opacity-40"><Icon d={I.send} /></button>
            </div>
          </div>
        </form>
      </section>

      <AnimatePresence>
        {aberta ? <TelaCheia key="tela" inicial={aberta} onClose={() => setAberta(null)} onApresentar={(v) => setApresentando(v)} onSalvar={(v) => setSalvando(v)} /> : null}
      </AnimatePresence>
      {apresentando ? <Apresentacao spec={specDaVisao(apresentando)} onClose={() => setApresentando(null)} /> : null}
      <AnimatePresence>
        {salvando ? <DialogoSalvar key="salvar" visao={salvando} onCancel={() => setSalvando(null)} onSave={salvar} /> : null}
      </AnimatePresence>
      <AnimatePresence>
        {toast ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="fixed bottom-6 left-1/2 z-[130] -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-xl dark:bg-white dark:text-slate-900" role="status">
            ✓ {toast}
          </motion.div>
        ) : null}
      </AnimatePresence>
      <span className="sr-only">{SELO_EXEMPLO}</span>
    </div>
  );
}
