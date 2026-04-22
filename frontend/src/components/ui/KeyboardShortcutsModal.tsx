import { useEffect } from 'react';
import { Link } from 'react-router-dom';

type Props = {
  open: boolean;
  onClose: () => void;
  role: 'admin' | 'secretaria' | null;
};

export function KeyboardShortcutsModal({ open, onClose, role }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const linksSecretaria = [
    { to: '/alunos', label: 'Alunos' },
    { to: '/fluxo-caixa', label: 'Fluxo de caixa' },
    { to: '/pagamentos-planilha', label: 'Pagamentos planilha' },
    { to: '/validacao-pagamentos-diaria', label: 'Validação de pagamentos' },
    { to: '/atividades', label: 'Atividades' },
  ];
  const linksAdmin = [
    { to: '/', label: 'Visão geral' },
    { to: '/conciliacao', label: 'Conciliação' },
    { to: '/entradas', label: 'Entradas' },
    { to: '/saidas', label: 'Saídas' },
    { to: '/relatorios-ia', label: 'Relatórios IA' },
    { to: '/controle-caixa', label: 'Controle de caixa' },
    { to: '/calendario-financeiro', label: 'Calendário financeiro' },
    ...linksSecretaria,
  ];
  const links = role === 'admin' ? linksAdmin : linksSecretaria;

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-900/50 dark:bg-black/60 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-600 dark:bg-slate-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="shortcuts-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Atalhos e navegação rápida
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Pressione <kbd className="rounded border bg-slate-100 px-1.5 py-0.5 text-xs dark:border-slate-600 dark:bg-slate-800">?</kbd> (teclado US:{' '}
          <kbd className="rounded border bg-slate-100 px-1.5 py-0.5 text-xs dark:border-slate-600 dark:bg-slate-800">Shift + /</kbd>) para abrir esta janela.{' '}
          <kbd className="rounded border bg-slate-100 px-1.5 py-0.5 text-xs dark:border-slate-600 dark:bg-slate-800">Esc</kbd> fecha.
        </p>
        <ul className="mt-4 space-y-2 text-sm">
          {links.map((l) => (
            <li key={l.to}>
              <Link
                to={l.to}
                className="font-medium text-indigo-700 hover:underline focus-visible:outline focus-visible:ring-2 focus-visible:ring-indigo-400 rounded dark:text-indigo-400"
                onClick={onClose}
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-lg border border-slate-300 bg-white py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
