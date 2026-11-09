/**
 * Cartão visual de uma resposta do Consulta Byla. Renderiza o MESMO spec JSON das Criações da IA
 * (nunca código). Ações: Tela cheia, Apresentar, Salvar (privada/compartilhada), Abrir no Criações da IA.
 * Carregado sob demanda (lazy) para não pesar o bundle principal com ECharts.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { salvarCriacaoIa, type CriacaoVisibilidade } from '../services/backendApi';
import { Apresentacao, tituloSecao } from './Apresentacao';
import { guardarSpecDoChat } from './chatHandoff';
import { fonteDaSecao, larguraTotal, SectionView } from './SectionView';
import { secoesRenderizaveis, type CriacaoSpec, type Secao } from './types';

const btn =
  'rounded-full border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700';

function Bloco({ s, spec }: { s: Secao; spec: CriacaoSpec }) {
  const fonte = fonteDaSecao(s, spec.datasets);
  return (
    <section className="min-w-0 max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <h4 className="mb-2 text-xs font-semibold text-slate-800 dark:text-slate-100">{tituloSecao(s)}</h4>
      <div className="min-w-0 max-w-full overflow-x-auto">
        <SectionView s={s} datasets={spec.datasets} />
      </div>
      {fonte ? <p className="mt-2 text-[10px] text-slate-500">Fonte: {fonte}</p> : null}
    </section>
  );
}

function TelaCheia({ spec, onClose }: { spec: CriacaoSpec; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[95] overflow-y-auto bg-slate-50 p-4 dark:bg-slate-950 sm:p-8" role="dialog" aria-modal="true" aria-label={spec.titulo} data-byla-overlay>
      <div className="mx-auto max-w-6xl">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">{spec.titulo}</h2>
            {spec.subtitulo ? <p className="text-sm text-slate-500 dark:text-slate-400">{spec.subtitulo}</p> : null}
          </div>
          <button type="button" className={btn} onClick={onClose}>Fechar (Esc)</button>
        </header>
        <div className="grid gap-4 lg:grid-cols-2">
          {secoesRenderizaveis(spec).map((s, i, arr) => (
            <div key={i} className={larguraTotal(arr, i) ? 'lg:col-span-2' : ''}>
              <Bloco s={s} spec={spec} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SpecCard({ spec, compacto = true }: { spec: CriacaoSpec; compacto?: boolean }) {
  const navigate = useNavigate();
  const secoes = secoesRenderizaveis(spec);
  const [cheia, setCheia] = useState(false);
  const [apresentando, setApresentando] = useState(false);
  const [form, setForm] = useState<{ titulo: string; visibilidade: CriacaoVisibilidade } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const visiveis = compacto ? secoes.slice(0, 2) : secoes;

  const salvar = async () => {
    if (!form) return;
    setSalvando(true);
    setMsg(null);
    try {
      await salvarCriacaoIa({ titulo: form.titulo.trim(), visibilidade: form.visibilidade, spec });
      setMsg(form.visibilidade === 'compartilhada' ? 'Salvo e compartilhado com admin e gestão.' : 'Salvo (só você vê).');
      setForm(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Falha ao salvar.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="mt-2 space-y-2" data-testid="consulta-visual">
      <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{spec.titulo}</p>
      {visiveis.map((s, i) => (
        <Bloco key={i} s={s} spec={spec} />
      ))}
      {secoes.length > visiveis.length ? (
        <p className="text-[11px] text-slate-500">+{secoes.length - visiveis.length} visual(is) em Tela cheia</p>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={btn} onClick={() => setCheia(true)}>Tela cheia</button>
        <button type="button" className={btn} onClick={() => setApresentando(true)}>Apresentar</button>
        <button type="button" className={btn} onClick={() => setForm(form ? null : { titulo: spec.titulo.slice(0, 120), visibilidade: 'privada' })}>Salvar</button>
        <button
          type="button"
          className={btn}
          onClick={() => {
            guardarSpecDoChat(spec);
            navigate('/criacoes-ia?from=chat');
          }}
        >
          Abrir no Criações da IA
        </button>
      </div>
      {form ? (
        <form
          className="space-y-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700"
          onSubmit={(e) => {
            e.preventDefault();
            void salvar();
          }}
        >
          <input
            aria-label="Título"
            value={form.titulo}
            minLength={3}
            maxLength={120}
            required
            onChange={(e) => setForm({ ...form, titulo: e.target.value })}
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 dark:text-slate-300">
            {(['privada', 'compartilhada'] as const).map((v) => (
              <label key={v} className="flex items-center gap-1">
                <input type="radio" name={`vis-${spec.geradoEm}`} checked={form.visibilidade === v} onChange={() => setForm({ ...form, visibilidade: v })} />
                {v === 'privada' ? 'Só eu' : 'Compartilhar com admin/gestão'}
              </label>
            ))}
            <button type="submit" disabled={salvando || form.titulo.trim().length < 3} className="ml-auto rounded bg-indigo-600 px-2.5 py-1 font-medium text-white disabled:opacity-50">
              {salvando ? 'Salvando…' : 'Confirmar'}
            </button>
          </div>
        </form>
      ) : null}
      {msg ? <p className="text-[11px] text-slate-500" role="status">{msg}</p> : null}
      {cheia ? <TelaCheia spec={spec} onClose={() => setCheia(false)} /> : null}
      {apresentando ? <Apresentacao spec={spec} onClose={() => setApresentando(false)} /> : null}
    </div>
  );
}
