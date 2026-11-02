/** Modo apresentação (slides em tela cheia) — usado em Criações da IA e nos cartões do chat. */
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fonteDaSecao, SectionView } from './SectionView';
import { secoesRenderizaveis, type CriacaoSpec, type Secao } from './types';

export function tituloSecao(s: Secao) {
  return s.type === 'narrative' ? s.titulo ?? 'Leitura' : s.titulo;
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
    <div ref={ref} className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-white" role="dialog" aria-label="Modo apresentação" data-byla-overlay>
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
                  <SectionView s={s} datasets={spec.datasets} estatico />
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

