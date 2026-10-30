/**
 * Criações da IA — painel/apresentação gerados a partir de um spec JSON validado.
 * A IA NÃO escreve código nem HTML: escolhe seções e referencia datasets; o servidor hidrata os números.
 * Bibliotecas: ECharts (Apache-2.0), echarts-for-react (MIT), Motion (MIT),
 * NumberTicker/BorderBeam adaptados de Magic UI (MIT). Tudo carregado só nesta rota (lazy).
 */
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { gerarCriacaoIa } from '../services/backendApi';
import { DEMO_BALANCO_4_MESES } from '../criacoes/demoSpec';
import { fonteDaSecao, SectionView } from '../criacoes/SectionView';
import { secoesRenderizaveis, type CriacaoSpec, type Secao } from '../criacoes/types';

const LS_KEY = 'byla.criacoesIa.salvas.v1';
type Salva = { id: string; prompt: string; spec: CriacaoSpec; salvaEm: string };

function lerSalvas(): Salva[] {
  try {
    const v = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]');
    return Array.isArray(v) ? v.slice(0, 20) : [];
  } catch {
    return [];
  }
}

const SUGESTOES = ['Balanço dos últimos 4 meses', 'Entradas por modalidade deste mês', 'Compare agosto com setembro', 'Meios de pagamento do mês'];

function tituloSecao(s: Secao) {
  return s.type === 'narrative' ? s.titulo ?? 'Leitura' : s.titulo;
}

function Card({ s, spec, i }: { s: Secao; spec: CriacaoSpec; i: number }) {
  const reduce = useReducedMotion();
  const fonte = fonteDaSecao(s, spec.datasets);
  const wide = s.type === 'kpi_cards' || s.type === 'table' || s.type === 'comparison' || s.type === 'narrative' || s.type === 'bar_chart';
  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.6, delay: Math.min(i, 4) * 0.06, ease: [0.22, 1, 0.36, 1] }}
      className={`min-w-0 rounded-3xl border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-slate-900/60 p-5 shadow-2xl shadow-slate-300/50 dark:shadow-black/40 backdrop-blur sm:p-6 ${wide ? 'lg:col-span-2' : ''}`}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white sm:text-lg">{tituloSecao(s)}</h2>
          {'descricao' in s && s.descricao ? <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{s.descricao}</p> : null}
        </div>
      </header>
      <SectionView s={s} datasets={spec.datasets} />
      {fonte ? <p className="mt-4 text-[11px] text-slate-500">Fonte: {fonte}</p> : null}
    </motion.section>
  );
}

export function Apresentacao({ spec, onClose }: { spec: CriacaoSpec; onClose: () => void }) {
  const secoes = useMemo(() => secoesRenderizaveis(spec), [spec]);
  const total = secoes.length + 1;
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState(1);
  const [auto, setAuto] = useState(false);
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  const go = useCallback(
    (d: number) => {
      setDir(d);
      setIdx((i) => Math.max(0, Math.min(total - 1, i + d)));
    },
    [total],
  );

  useEffect(() => {
    ref.current?.requestFullscreen?.().catch(() => undefined);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(-1); }
      else if (e.key === 'Escape') onClose();
      else if (e.key.toLowerCase() === 'p') setAuto((a) => !a);
    };
    const onFs = () => { if (!document.fullscreenElement) onClose(); };
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFs);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    };
  }, [go, onClose]);

  useEffect(() => {
    if (!auto) return;
    if (idx >= total - 1) { setAuto(false); return; }
    const t = setTimeout(() => go(1), 6000);
    return () => clearTimeout(t);
  }, [auto, idx, total, go]);

  const s = idx > 0 ? secoes[idx - 1] : null;
  const variants = reduce
    ? { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        enter: (d: number) => ({ opacity: 0, x: d * 80, scale: 0.98 }),
        center: { opacity: 1, x: 0, scale: 1 },
        exit: (d: number) => ({ opacity: 0, x: d * -80, scale: 0.98 }),
      };

  return (
    <div ref={ref} className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-white" role="dialog" aria-label="Modo apresentação">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(225,29,72,0.18),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(129,140,248,0.16),transparent_55%)]" />
      <div className="relative h-1 w-full bg-slate-100 dark:bg-white/5">
        <motion.div className="h-full bg-gradient-to-r from-rose-500 to-indigo-400" animate={{ width: `${((idx + 1) / total) * 100}%` }} transition={{ duration: reduce ? 0 : 0.5 }} />
      </div>
      <div className="relative flex flex-1 items-center justify-center px-6 py-8 sm:px-16">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={idx}
            custom={dir}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: reduce ? 0.15 : 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-6xl"
          >
            {s ? (
              <>
                <h2 className="mb-8 text-3xl font-bold tracking-tight sm:text-5xl">{tituloSecao(s)}</h2>
                <div className="[&_canvas]:!max-w-full">
                  <SectionView s={s} datasets={spec.datasets} />
                </div>
                {fonteDaSecao(s, spec.datasets) ? <p className="mt-6 text-xs text-slate-500">Fonte: {fonteDaSecao(s, spec.datasets)}</p> : null}
              </>
            ) : (
              <div className="text-center">
                <p className="mb-4 text-sm uppercase tracking-[0.3em] text-rose-600 dark:text-rose-400">Espaço Byla · Criações da IA</p>
                <h1 className="bg-gradient-to-br from-slate-900 to-slate-500 dark:from-white dark:to-slate-400 bg-clip-text text-5xl font-bold tracking-tight text-transparent sm:text-7xl">{spec.titulo}</h1>
                {spec.subtitulo ? <p className="mt-6 text-lg text-slate-500 dark:text-slate-400 sm:text-2xl">{spec.subtitulo}</p> : null}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <footer className="relative flex items-center justify-between gap-4 px-6 pb-5 text-sm text-slate-500 dark:text-slate-400">
        <div className="flex gap-2">
          <button type="button" onClick={() => go(-1)} disabled={idx === 0} className="rounded-full border border-slate-200 dark:border-white/10 px-4 py-1.5 hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-30" aria-label="Anterior">←</button>
          <button type="button" onClick={() => go(1)} disabled={idx === total - 1} className="rounded-full border border-slate-200 dark:border-white/10 px-4 py-1.5 hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-30" aria-label="Próximo">→</button>
          <button type="button" onClick={() => setAuto((a) => !a)} className={`rounded-full border px-4 py-1.5 ${auto ? 'border-rose-500 dark:border-rose-400 text-rose-600 dark:text-rose-300' : 'border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10'}`}>{auto ? '❚❚ Pausar' : '▶ Autoplay'}</button>
        </div>
        <div className="flex items-center gap-1.5" aria-label={`Slide ${idx + 1} de ${total}`}>
          {Array.from({ length: total }).map((_, i) => (
            <button key={i} type="button" aria-label={`Ir para slide ${i + 1}`} onClick={() => { setDir(i > idx ? 1 : -1); setIdx(i); }} className={`h-2 rounded-full transition-all ${i === idx ? 'w-6 bg-rose-500 dark:bg-rose-400' : 'w-2 bg-slate-300 dark:bg-white/20 hover:bg-slate-400 dark:hover:bg-white/40'}`} />
          ))}
          <span className="ml-3 tabular-nums">{idx + 1}/{total}</span>
        </div>
        <button type="button" onClick={onClose} className="rounded-full border border-slate-200 dark:border-white/10 px-4 py-1.5 hover:bg-slate-100 dark:hover:bg-white/10">Sair (Esc)</button>
      </footer>
    </div>
  );
}

export default function CriacoesIaPage() {
  const [params] = useSearchParams();
  const [prompt, setPrompt] = useState('');
  const [spec, setSpec] = useState<CriacaoSpec | null>(params.get('demo') === '1' ? DEMO_BALANCO_4_MESES : null);
  const [ultimoPrompt, setUltimoPrompt] = useState(params.get('demo') === '1' ? 'demo' : '');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [apresentando, setApresentando] = useState(params.get('apresentar') === '1');
  const [salvas, setSalvas] = useState<Salva[]>(lerSalvas);
  const reduce = useReducedMotion();

  const gerar = async (p: string) => {
    const texto = p.trim();
    if (texto.length < 3) return;
    setLoading(true);
    setErro(null);
    try {
      const r = await gerarCriacaoIa({ prompt: texto });
      setSpec(r.spec);
      setUltimoPrompt(texto);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao gerar.');
    } finally {
      setLoading(false);
    }
  };

  const salvar = () => {
    if (!spec) return;
    const nova: Salva = { id: `${Date.now()}`, prompt: ultimoPrompt || spec.titulo, spec, salvaEm: new Date().toISOString() };
    const lista = [nova, ...salvas].slice(0, 20);
    localStorage.setItem(LS_KEY, JSON.stringify(lista));
    setSalvas(lista);
  };

  const remover = (id: string) => {
    const lista = salvas.filter((s) => s.id !== id);
    localStorage.setItem(LS_KEY, JSON.stringify(lista));
    setSalvas(lista);
  };

  const secoes = spec ? secoesRenderizaveis(spec) : [];

  return (
    <div className="relative -m-4 min-h-[calc(100vh-4rem)] overflow-hidden bg-slate-50 dark:bg-[#020617] p-4 text-slate-900 dark:text-slate-100 sm:-m-6 sm:p-8">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(225,29,72,0.10),transparent_60%),radial-gradient(ellipse_at_bottom_right,rgba(99,102,241,0.12),transparent_60%)]" />
      <div className="relative mx-auto max-w-6xl">
        <motion.header initial={reduce ? false : { opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-600 dark:text-rose-400">Criações da IA · protótipo</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">Peça um painel. A IA monta, os números vêm do banco.</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">A IA só escolhe o layout (JSON validado). Todo valor exibido é calculado no servidor a partir do extrato oficial — nada é digitado pela IA.</p>
        </motion.header>

        <form
          onSubmit={(e) => { e.preventDefault(); void gerar(prompt); }}
          className="relative rounded-2xl border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-slate-900/70 p-3 shadow-xl shadow-slate-300/40 dark:shadow-black/30 backdrop-blur"
        >
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={500}
              placeholder="Ex.: balanço dos últimos 4 meses com destaque por modalidade"
              className="flex-1 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950/70 px-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-500 focus:border-rose-400/60 focus:outline-none"
              aria-label="Pedido para a IA"
            />
            <button type="submit" disabled={loading || prompt.trim().length < 3} className="rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-900/20 dark:shadow-rose-900/40 hover:brightness-110 disabled:opacity-40">
              {loading ? 'Gerando…' : 'Gerar'}
            </button>
            <button type="button" onClick={() => { setSpec(DEMO_BALANCO_4_MESES); setUltimoPrompt('demo'); setErro(null); }} className="rounded-xl border border-slate-300 dark:border-white/15 px-4 py-3 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5">
              Ver demo
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {SUGESTOES.map((s) => (
              <button key={s} type="button" onClick={() => { setPrompt(s); void gerar(s); }} className="rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-3 py-1 text-xs text-slate-600 dark:text-slate-300 hover:border-rose-400/40 hover:text-slate-900 dark:hover:text-white">
                {s}
              </button>
            ))}
          </div>
        </form>

        {erro ? <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">{erro}</div> : null}

        {salvas.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500">Salvas neste navegador:</span>
            {salvas.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] pl-3">
                <button type="button" onClick={() => setSpec(s.spec)} className="py-1 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">{s.spec.titulo}</button>
                <button type="button" onClick={() => remover(s.id)} aria-label="Remover" className="px-2 py-1 text-slate-500 hover:text-rose-600 dark:hover:text-rose-300">×</button>
              </span>
            ))}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            {[0, 1, 2, 3].map((i) => <div key={i} className={`h-56 animate-pulse rounded-3xl bg-slate-100 dark:bg-white/[0.04] ${i === 0 ? 'lg:col-span-2 h-32' : ''}`} />)}
          </div>
        ) : null}

        <AnimatePresence mode="wait">
          {spec && !loading ? (
            <motion.div key={spec.geradoEm + spec.titulo} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-8">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">{spec.titulo}</h2>
                  {spec.subtitulo ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{spec.subtitulo}</p> : null}
                  <span className={`mt-2 inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ${spec.origem === 'gemini' || spec.origem === 'groq' ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300' : spec.origem === 'demo' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-slate-500/20 text-slate-600 dark:text-slate-300'}`}>
                    {spec.origem === 'gemini' || spec.origem === 'groq' ? 'Layout pela IA' : spec.origem === 'demo' ? 'Demo · dados fictícios' : 'Layout padrão (sem IA)'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={salvar} className="rounded-xl border border-slate-300 dark:border-white/15 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5">Salvar</button>
                  <button type="button" onClick={() => setApresentando(true)} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200">▶ Apresentar</button>
                </div>
              </div>
              {spec.avisos.length > 0 ? (
                <ul className="mb-5 space-y-1 text-xs text-amber-700 dark:text-amber-200/80">{spec.avisos.map((a, i) => <li key={i}>• {a}</li>)}</ul>
              ) : null}
              <div className="grid gap-5 lg:grid-cols-2">
                {secoes.map((s, i) => <Card key={`${s.type}-${i}`} s={s} spec={spec} i={i} />)}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
      {apresentando && spec ? <Apresentacao spec={spec} onClose={() => setApresentando(false)} /> : null}
    </div>
  );
}
