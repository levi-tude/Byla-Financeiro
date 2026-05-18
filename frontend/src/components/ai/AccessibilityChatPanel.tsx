import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { chatAcessibilidadeIA } from '../../services/backendApi';
import { useToast } from '../../context/ToastContext';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { canNavigateToRoute } from '../../ai/allowedRoutesByRole';
import type { AppRole } from '../../auth/types';
import type { AssistantActionNavigate, AssistantRequestContext, AssistantResponse, ChatMessage } from './types';

type AccessibilityChatPanelProps = {
  open: boolean;
  onClose: () => void;
  role: AppRole | null;
  context: AssistantRequestContext;
};

const QUICK_HINTS = [
  'Lançar entrada',
  'Lançar saída',
  'Abrir Fluxo de Caixa',
  'Resumo por pagamento',
  'Saldo não bateu',
];
const HISTORY_LIMIT = 10;

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function AccessibilityChatPanel({ open, onClose, role, context }: AccessibilityChatPanelProps) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: uid(),
      role: 'assistant',
      text: 'Oi! Sou o Assistente do Byla. Posso te orientar no Fluxo de Caixa e nas telas da secretaria. Pergunte o que precisa ou use os atalhos abaixo.',
      createdAt: Date.now(),
    },
  ]);
  const [pendingAction, setPendingAction] = useState<AssistantActionNavigate | null>(null);
  const [assistantQuickReplies, setAssistantQuickReplies] = useState<string[]>(QUICK_HINTS);

  const quickReplies = useMemo(() => {
    return assistantQuickReplies.length > 0 ? assistantQuickReplies : QUICK_HINTS;
  }, [assistantQuickReplies]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const runNavigation = (action: AssistantActionNavigate, needsConfirmation: boolean) => {
    if (!canNavigateToRoute(role, action.to)) {
      showToast('Essa tela não está disponível para seu perfil.', 'error');
      return;
    }
    // Regra operacional: sempre confirmar antes de navegação sugerida pelo assistente.
    if (needsConfirmation || action.type === 'navigate') {
      setPendingAction(action);
      return;
    }
    navigate(action.to);
  };

  const handleAssistantResponse = (response: AssistantResponse) => {
    setMessages((prev) =>
      [...prev, { id: uid(), role: 'assistant' as const, text: response.message, createdAt: Date.now() }].slice(
        -HISTORY_LIMIT
      )
    );
    const mainAction = response.actions[0];
    setAssistantQuickReplies(
      response.quickReplies && response.quickReplies.length > 0 ? response.quickReplies.slice(0, 5) : QUICK_HINTS
    );
    if (mainAction?.type === 'navigate') {
      runNavigation(mainAction, response.needsConfirmation);
    }
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setInput('');
    setSending(true);
    setMessages((prev) =>
      [...prev, { id: uid(), role: 'user' as const, text: trimmed, createdAt: Date.now() }].slice(-HISTORY_LIMIT)
    );
    try {
      const response = await chatAcessibilidadeIA({
        message: trimmed,
        context: {
          route: context.route,
          role,
          monthYear: context.monthYear,
        },
      });
      handleAssistantResponse(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao consultar assistente.';
      showToast(message, 'error');
      setMessages((prev) =>
        [
          ...prev,
          {
            id: uid(),
            role: 'assistant' as const,
            text: 'Não consegui responder agora. Tente novamente em alguns segundos.',
            createdAt: Date.now(),
          },
        ].slice(-HISTORY_LIMIT)
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[88] bg-slate-900/40" role="presentation" onClick={onClose} />
      <section
        className="fixed bottom-22 left-2 right-2 z-[89] max-h-[80vh] rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 md:bottom-24 md:left-auto md:right-6 md:w-[420px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assistente-byla-titulo"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <div>
            <p id="assistente-byla-titulo" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Assistente do Byla
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Dúvidas e atalhos para a secretaria</p>
          </div>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={onClose}
          >
            Fechar
          </button>
        </header>

        <div className="max-h-[46vh] space-y-2 overflow-y-auto px-4 py-3">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-lg px-3 py-2 text-sm ${
                m.role === 'user'
                  ? 'ml-10 bg-indigo-600 text-white'
                  : 'mr-10 border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
              }`}
            >
              <span className="whitespace-pre-wrap leading-relaxed">{m.text}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-700">
          <div className="mb-2 flex flex-wrap gap-2">
            {quickReplies.map((hint) => (
              <button
                key={hint}
                type="button"
                onClick={() => void sendMessage(hint)}
                className="rounded-full border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
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
              placeholder="Digite sua dúvida..."
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={sending}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {sending ? 'Enviando...' : 'Enviar'}
            </button>
          </form>
        </div>
      </section>

      <ConfirmDialog
        open={Boolean(pendingAction)}
        title="Confirmar navegação"
        message={`Deseja abrir a tela "${pendingAction?.label ?? ''}" agora?`}
        confirmLabel="Abrir tela"
        onCancel={() => setPendingAction(null)}
        onConfirm={() => {
          const action = pendingAction;
          setPendingAction(null);
          if (!action) return;
          navigate(action.to);
        }}
      />
    </>
  );
}
