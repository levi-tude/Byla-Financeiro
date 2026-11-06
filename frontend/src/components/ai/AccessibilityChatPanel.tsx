import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { chatConsultaByla } from '../../services/backendApi';
import { useToast } from '../../context/ToastContext';
import type { AssistantRequestContext, ChatMessage } from './types';

/** ECharts/Motion só carregam quando chega o primeiro cartão visual. */
const SpecCard = lazy(() => import('../../criacoes/SpecCard'));

type ConsultaBylaPanelProps = {
  open: boolean;
  onClose: () => void;
  context: AssistantRequestContext;
};

/** Espelha o menu do backend (`CONSULTA_MENU_LABELS`). */
export const CONSULTA_MENU_LABELS = [
  'Resumo do mês',
  'Resumo da semana',
  'Resumo do dia',
  'Resumo por período',
  'Entradas por modalidade',
  'Controle oficial vs sistema',
  'Resumo por categoria do extrato',
  'Resumo por meio de pagamento',
  'Pendentes de conciliação',
  'Pagamentos do Fluxo no dia',
  'Movimentos do banco no dia',
  'Sem vínculo na validação',
  'Situação do aluno…',
  'Lançamento de R$ … ?',
];

const HISTORY_LIMIT = 12;
/** Máx. de mensagens anteriores enviadas ao backend (o servidor valida o mesmo limite). */
const HISTORY_SEND_LIMIT = 10;

function buildHistory(msgs: ChatMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  return msgs
    .filter((m) => m.text.trim().length > 0 && !m.text.startsWith('Oi! Sou o Consulta Byla'))
    .slice(-HISTORY_SEND_LIMIT)
    .map((m) => ({ role: m.role, content: m.text.trim().slice(0, 2000) }));
}

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function AccessibilityChatPanel({ open, onClose, context }: ConsultaBylaPanelProps) {
  const { showToast } = useToast();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: uid(),
      role: 'assistant',
      text: 'Oi! Sou o Consulta Byla. Posso trazer resumos e listas do sistema (só leitura). Use os atalhos ou digite uma pergunta.',
      createdAt: Date.now(),
    },
  ]);
  /** Só afeta o layout desktop (≥lg). No celular o chat já é tela cheia. */
  const [expandido, setExpandido] = useState(false);
  const [quickReplies, setQuickReplies] = useState<string[]>(CONSULTA_MENU_LABELS.slice(0, 8));
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const replies = useMemo(
    () => (quickReplies.length > 0 ? quickReplies : CONSULTA_MENU_LABELS.slice(0, 8)),
    [quickReplies],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.fullscreenElement || document.querySelector('[data-byla-overlay]')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Trava o scroll do body no celular enquanto o chat está aberto.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Ancora na última mensagem (abertura e cada resposta).
  useLayoutEffect(() => {
    if (!open) return;
    messagesEndRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [open, messages, sending]);

  if (!open) return null;

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setInput('');
    setSending(true);
    setMessages((prev) =>
      [...prev, { id: uid(), role: 'user' as const, text: trimmed, createdAt: Date.now() }].slice(-HISTORY_LIMIT),
    );
    try {
      const response = await chatConsultaByla({
        message: trimmed,
        context: {
          route: context.route,
          role: context.role ?? null,
          monthYear: context.monthYear,
        },
        history: buildHistory(messages),
      });
      setMessages((prev) =>
        [
          ...prev,
          {
            id: uid(),
            role: 'assistant' as const,
            text: response.message,
            createdAt: Date.now(),
            visual: response.visual ?? null,
          },
        ].slice(-HISTORY_LIMIT),
      );
      setQuickReplies(
        response.quickReplies?.length ? response.quickReplies.slice(0, 10) : CONSULTA_MENU_LABELS.slice(0, 8),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao consultar.';
      showToast(message, 'error');
      setMessages((prev) =>
        [
          ...prev,
          {
            id: uid(),
            role: 'assistant' as const,
            text: 'Sem conexão com o servidor da Byla agora (a resposta nem chegou). Verifique a internet e use um atalho do menu.',
            createdAt: Date.now(),
          },
        ].slice(-HISTORY_LIMIT),
      );
    } finally {
      setSending(false);
      // Reabre o teclado no celular após enviar (comportamento de app de conversa).
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  return (
    <>
      {/* Overlay só no desktop — no mobile o painel já é tela cheia. */}
      <div
        className="fixed inset-0 z-[88] hidden bg-slate-900/40 lg:block"
        role="presentation"
        onClick={onClose}
      />
      <section
        className={`fixed z-[89] flex flex-col overflow-hidden border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 ${
          expandido
            ? // Desktop expandido
              'inset-0 h-dvh max-h-dvh lg:inset-6 lg:left-auto lg:h-auto lg:max-h-[calc(100dvh-3rem)] lg:w-[min(960px,calc(100vw-3rem))] lg:rounded-xl'
            : // Mobile: app de conversa em tela cheia (dvh). Desktop: cartão flutuante.
              'inset-0 h-dvh max-h-dvh rounded-none lg:inset-auto lg:bottom-24 lg:left-auto lg:right-6 lg:h-auto lg:max-h-[min(80vh,720px)] lg:w-[440px] lg:rounded-xl'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="consulta-byla-titulo"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho compacto */}
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-3 py-2.5 dark:border-slate-700 sm:px-4">
          <div className="min-w-0">
            <p id="consulta-byla-titulo" className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">
              Consulta Byla
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              Só leitura · {context.monthYear ?? 'mês atual'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-pressed={expandido}
              aria-label={expandido ? 'Reduzir janela' : 'Expandir janela'}
              title={expandido ? 'Reduzir janela' : 'Expandir janela'}
              className="hidden min-h-11 items-center rounded-lg px-2.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 lg:inline-flex"
              onClick={() => setExpandido((v) => !v)}
            >
              {expandido ? 'Reduzir' : 'Expandir'}
            </button>
            <button
              type="button"
              aria-label="Fechar Consulta Byla"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={onClose}
            >
              Fechar
            </button>
          </div>
        </header>

        {/* Mensagens: flex-1 + scroll; conteúdo ancorado embaixo quando há poucas msgs */}
        <div
          ref={messagesScrollRef}
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-3 sm:px-4"
        >
          <div className="flex min-h-full flex-col justify-end gap-2">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed sm:max-w-[85%] ${
                  m.role === 'user'
                    ? 'ml-auto bg-indigo-600 text-white'
                    : 'mr-auto border border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
                }`}
              >
                <span className="whitespace-pre-wrap break-words">{m.text}</span>
                {m.role === 'assistant' && m.visual ? (
                  <div className="mt-2 max-w-full min-w-0 overflow-x-auto">
                    <Suspense fallback={<p className="text-xs text-slate-500">Carregando visual…</p>}>
                      <SpecCard spec={m.visual} compacto={!expandido} />
                    </Suspense>
                  </div>
                ) : null}
              </div>
            ))}
            {sending ? (
              <div className="mr-auto rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800">
                Consultando…
              </div>
            ) : null}
            <div ref={messagesEndRef} aria-hidden="true" className="h-px w-full shrink-0" />
          </div>
        </div>

        {/* Composer fixo no rodapé — safe-area; atalhos em linha horizontal */}
        <div
          className="shrink-0 border-t border-slate-200 bg-white px-3 pt-2 dark:border-slate-700 dark:bg-slate-900 sm:px-4"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
        >
          <div
            className="-mx-1 mb-2 flex gap-2 overflow-x-auto overscroll-x-contain px-1 pb-1 [scrollbar-width:thin]"
            role="list"
            aria-label="Atalhos de pergunta"
          >
            {replies.map((hint) => (
              <button
                key={hint}
                type="button"
                role="listitem"
                onClick={() => void sendMessage(hint)}
                disabled={sending}
                className="inline-flex shrink-0 items-center rounded-full border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {hint}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage(input);
            }}
            className="flex items-end gap-2"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ex.: resumo do mês, situação do aluno…"
              enterKeyHint="send"
              autoComplete="off"
              autoCorrect="on"
              // text-base (16px) evita zoom automático do iOS no focus
              className="min-h-11 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {sending ? '…' : 'Enviar'}
            </button>
          </form>
        </div>
      </section>
    </>
  );
}
