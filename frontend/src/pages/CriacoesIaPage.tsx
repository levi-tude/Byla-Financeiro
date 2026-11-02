/**
 * Criações da IA — painel/apresentação gerados a partir de um spec JSON validado.
 * A IA NÃO escreve código nem HTML: escolhe seções e referencia datasets; o servidor hidrata os números.
 * Bibliotecas: ECharts (Apache-2.0), echarts-for-react (MIT), Motion (MIT),
 * NumberTicker/BorderBeam adaptados de Magic UI (MIT). Tudo carregado só nesta rota (lazy).
 */
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  abrirCriacaoSalva,
  apagarCriacaoSalva,
  gerarCriacaoIa,
  listarCriacoesSalvas,
  salvarCriacaoIa,
  type CriacaoSalvaResumo,
  type CriacaoVisibilidade,
} from '../services/backendApi';
import { DEMO_BALANCO_4_MESES } from '../criacoes/demoSpec';
import { fonteDaSecao, larguraTotal, SectionView } from '../criacoes/SectionView';
import { secoesRenderizaveis, type CriacaoSpec, type Secao } from '../criacoes/types';
import { Apresentacao, tituloSecao } from '../criacoes/Apresentacao';
import { lerSpecDoChat } from '../criacoes/chatHandoff';

const SUGESTOES = ['Balanço dos últimos 4 meses', 'Entradas por modalidade deste mês', 'Compare agosto com setembro', 'Meios de pagamento do mês'];

function Card({ s, spec, i, wide }: { s: Secao; spec: CriacaoSpec; i: number; wide: boolean }) {
  const reduce = useReducedMotion();
  const fonte = fonteDaSecao(s, spec.datasets);
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

export default function CriacoesIaPage() {
  const [params] = useSearchParams();
  const [prompt, setPrompt] = useState('');
  const [spec, setSpec] = useState<CriacaoSpec | null>(() =>
    params.get('demo') === '1' ? DEMO_BALANCO_4_MESES : params.get('from') === 'chat' ? lerSpecDoChat() : null,
  );
  const [ultimoPrompt, setUltimoPrompt] = useState(params.get('demo') === '1' ? 'demo' : '');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [apresentando, setApresentando] = useState(params.get('apresentar') === '1');
  const [salvas, setSalvas] = useState<CriacaoSalvaResumo[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [formSalvar, setFormSalvar] = useState<{ titulo: string; visibilidade: CriacaoVisibilidade } | null>(null);
  const [msgSalvas, setMsgSalvas] = useState<string | null>(null);

  const recarregarSalvas = useCallback(async () => {
    try {
      const r = await listarCriacoesSalvas();
      setSalvas(r.items);
    } catch (e) {
      setMsgSalvas(e instanceof Error ? e.message : 'Falha ao carregar as visões salvas.');
    }
  }, []);

  useEffect(() => {
    void recarregarSalvas();
  }, [recarregarSalvas]);
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

  const salvar = async () => {
    if (!spec || !formSalvar) return;
    setSalvando(true);
    setMsgSalvas(null);
    try {
      await salvarCriacaoIa({
        titulo: formSalvar.titulo.trim(),
        prompt: ultimoPrompt && ultimoPrompt !== 'demo' ? ultimoPrompt.slice(0, 500) : undefined,
        visibilidade: formSalvar.visibilidade,
        spec,
      });
      setFormSalvar(null);
      setMsgSalvas(formSalvar.visibilidade === 'compartilhada' ? 'Visão salva e compartilhada com admin e gestão.' : 'Visão salva (só você vê).');
      await recarregarSalvas();
    } catch (e) {
      setMsgSalvas(e instanceof Error ? e.message : 'Falha ao salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const abrir = async (id: string) => {
    setMsgSalvas(null);
    try {
      const r = await abrirCriacaoSalva(id);
      setSpec(r.item.spec);
      setUltimoPrompt(r.item.prompt ?? '');
    } catch (e) {
      setMsgSalvas(e instanceof Error ? e.message : 'Falha ao abrir.');
    }
  };

  const remover = async (s: CriacaoSalvaResumo) => {
    if (!window.confirm(`Apagar a visão "${s.titulo}"?`)) return;
    try {
      await apagarCriacaoSalva(s.id);
      await recarregarSalvas();
    } catch (e) {
      setMsgSalvas(e instanceof Error ? e.message : 'Falha ao apagar.');
    }
  };

  const secoes = spec ? secoesRenderizaveis(spec) : [];

  return (
    <div className="relative -m-4 min-h-[calc(100vh-4rem)] overflow-hidden bg-slate-50 dark:bg-[#020617] p-4 text-slate-900 dark:text-slate-100 sm:-m-6 sm:p-8">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(225,29,72,0.10),transparent_60%),radial-gradient(ellipse_at_bottom_right,rgba(99,102,241,0.12),transparent_60%)]" />
      <div className="relative mx-auto max-w-6xl">
        <motion.header initial={reduce ? false : { opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">Criações da IA · protótipo</p>
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

        {msgSalvas ? <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">{msgSalvas}</p> : null}

        {salvas.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500">Visões salvas:</span>
            {salvas.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] pl-3">
                <button type="button" onClick={() => void abrir(s.id)} className="py-1 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">{s.titulo}</button>
                <span className="text-[10px] text-slate-400" title={s.visibilidade === 'compartilhada' ? 'Compartilhada com admin e gestão' : 'Privada (só você)'}>
                  {s.visibilidade === 'compartilhada' ? 'compartilhada' : 'privada'}
                </span>
                {s.minha ? (
                  <button type="button" onClick={() => void remover(s)} aria-label={`Apagar ${s.titulo}`} className="px-2 py-1 text-slate-500 hover:text-rose-600 dark:hover:text-rose-300">×</button>
                ) : <span className="pr-3" />}
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
                  <button type="button" onClick={() => setFormSalvar({ titulo: (spec.titulo || '').slice(0, 120), visibilidade: 'privada' })} className="rounded-xl border border-slate-300 dark:border-white/15 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5">Salvar</button>
                  <button type="button" onClick={() => setApresentando(true)} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200">▶ Apresentar</button>
                </div>
              </div>
              {formSalvar ? (
                <form
                  onSubmit={(e) => { e.preventDefault(); void salvar(); }}
                  className="mb-5 flex flex-col gap-3 rounded-2xl border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-slate-900/70 p-4 text-sm sm:flex-row sm:items-end"
                >
                  <label className="flex flex-1 flex-col gap-1">
                    <span className="text-xs text-slate-500">Nome da visão</span>
                    <input
                      value={formSalvar.titulo}
                      onChange={(e) => setFormSalvar({ ...formSalvar, titulo: e.target.value })}
                      maxLength={120}
                      className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950/70 px-3 py-2"
                    />
                  </label>
                  <fieldset className="flex gap-4">
                    <legend className="mb-1 text-xs text-slate-500">Quem vê</legend>
                    <label className="inline-flex items-center gap-1">
                      <input type="radio" name="visibilidade" checked={formSalvar.visibilidade === 'privada'} onChange={() => setFormSalvar({ ...formSalvar, visibilidade: 'privada' })} />
                      Só eu (privada)
                    </label>
                    <label className="inline-flex items-center gap-1">
                      <input type="radio" name="visibilidade" checked={formSalvar.visibilidade === 'compartilhada'} onChange={() => setFormSalvar({ ...formSalvar, visibilidade: 'compartilhada' })} />
                      Admin e gestão (compartilhada)
                    </label>
                  </fieldset>
                  <div className="flex gap-2">
                    <button type="submit" disabled={salvando || formSalvar.titulo.trim().length < 3} className="rounded-xl bg-rose-600 px-4 py-2 font-semibold text-white disabled:opacity-40">
                      {salvando ? 'Salvando…' : 'Salvar visão'}
                    </button>
                    <button type="button" onClick={() => setFormSalvar(null)} className="rounded-xl border border-slate-300 dark:border-white/15 px-4 py-2">Cancelar</button>
                  </div>
                </form>
              ) : null}
              {spec.avisos.length > 0 ? (
                <ul className="mb-5 space-y-1 text-xs text-amber-700 dark:text-amber-200/80">{spec.avisos.map((a, i) => <li key={i}>• {a}</li>)}</ul>
              ) : null}
              <div className="grid gap-5 lg:grid-cols-2">
                {secoes.map((s, i) => <Card key={`${s.type}-${i}`} s={s} spec={spec} i={i} wide={larguraTotal(secoes, i)} />)}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
      {apresentando && spec ? <Apresentacao spec={spec} onClose={() => setApresentando(false)} /> : null}
    </div>
  );
}
