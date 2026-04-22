import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { MonthYearPicker } from '../components/ui/MonthYearPicker';
import { KeyboardShortcutsModal } from '../components/ui/KeyboardShortcutsModal';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { useAuth } from '../auth/AuthContext';

export function LayoutShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const auth = useAuth();

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
      if ((t as HTMLElement).isContentEditable) return;
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {menuOpen ? (
        <button
          type="button"
          aria-label="Fechar menu"
          className="fixed inset-0 z-30 bg-slate-900/40 md:hidden"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}
      <Sidebar mobileOpen={menuOpen} onNavigate={() => setMenuOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col overflow-auto bg-slate-100 dark:bg-slate-950">
        <div className="sticky top-0 z-20 flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-slate-100/95 px-3 py-2 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95">
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 md:hidden dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
          >
            Menu
          </button>
          <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setShortcutsOpen(true)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 focus-visible:outline focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              title="Atalhos de teclado"
            >
              Atalhos <kbd className="ml-1 rounded border border-slate-200 bg-slate-50 px-1 font-sans dark:border-slate-600 dark:bg-slate-900">?</kbd>
            </button>
            <MonthYearPicker />
          </div>
        </div>
        <div className="byla-outlet flex min-h-0 flex-1 flex-col p-0 text-slate-900 dark:text-slate-100">
          <Outlet />
        </div>
      </main>
      <KeyboardShortcutsModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        role={auth.role}
      />
    </div>
  );
}
