import { useEffect, useMemo, useState } from 'react';
import { chatConsultaByla } from '../../services/backendApi';
import { useToast } from '../../context/ToastContext';
import type { AssistantRequestContext, ChatMessage } from './types';

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
  const [quickReplies, setQuickReplies] = useState<string[]>(CONSULTA_MENU_LABELS.slice(0, 8));

  const replies = useMemo(
    () => (quickReplies.length > 0 ? quickReplies : CONSULTA_MENU_LABELS.slice(0, 8)),
    [quickReplies],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

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
          role: 'admin',
          monthYear: context.monthYear,
        },
      });
      setMessages((prev) =>
        [
          ...prev,
          { id: uid(), role: 'assistant' as const, text: response.message, createdAt: Date.now() },
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
            text: 'Não consegui consultar os dados agora. Tente de novo em alguns segundos.',
            createdAt: Date.now(),
          },
        ].slice(-HISTORY_LIMIT),
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[88] bg-slate-900/40" role="presentation" onClick={onClose} />
      <section
        className="fixed bottom-22 left-2 right-2 z-[89] max-h-[80vh] rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 md:bottom-24 md:left-auto md:right-6 md:w-[440px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="consulta-byla-titulo"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <div>
            <p id="consulta-byla-titulo" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Consulta Byla
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Só leitura · competência {context.monthYear ?? 'atual'}
            </p>
          </div>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={onClose}
          >
            Fechar
          </button>
        </header>

        <div className="max-h-[42vh] space-y-2 overflow-y-auto px-4 py-3">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-lg px-3 py-2 text-sm ${
                m.role === 'user'
                  ? 'ml-10 bg-indigo-600 text-white'
                  : 'mr-8 border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
              }`}
            >
              <span className="whitespace-pre-wrap leading-relaxed">{m.text}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-700">
          <div className="mb-2 flex max-h-28 flex-wrap gap-2 overflow-y-auto">
            {replies.map((hint) => (
              <button
                key={hint}
                type="button"
                onClick={() => void sendMessage(hint)}
                disabled={sending}
                className="rounded-full border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
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
            className="flex gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ex.: situação do aluno Ana, R$ 250…"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={sending}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {sending ? '…' : 'Enviar'}
            </button>
          </form>
        </div>
      </section>
    </>
  );
}
