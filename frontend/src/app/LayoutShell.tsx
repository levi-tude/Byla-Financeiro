import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { MonthYearPicker } from '../components/ui/MonthYearPicker';
import { KeyboardShortcutsModal } from '../components/ui/KeyboardShortcutsModal';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { useAuth } from '../auth/AuthContext';

const SIDEBAR_STORAGE_KEY = 'byla-sidebar-open';

function readSidebarOpenPreference(): boolean {
  try {
    const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (saved === 'false') return false;
    if (saved === 'true') return true;
  } catch {
    /* ignore */
  }
  return true;
}

export function LayoutShell() {
  const [sidebarOpen, setSidebarOpen] = useState(readSidebarOpenPreference);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const auth = useAuth();

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarOpen));
    } catch {
      /* ignore */
    }
  }, [sidebarOpen]);

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
    <div className="flex h-screen overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Fechar menu"
          className="fixed inset-0 z-30 bg-slate-900/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
      <Sidebar
        open={sidebarOpen}
        onNavigate={() => {
          if (window.matchMedia('(max-width: 767px)').matches) setSidebarOpen(false);
        }}
      />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-slate-100 dark:bg-slate-950">
        <div className="sticky top-0 z-20 flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-slate-100/95 px-3 py-2 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95">
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-expanded={sidebarOpen}
            aria-controls="app-sidebar"
            aria-label={sidebarOpen ? 'Ocultar menu lateral' : 'Mostrar menu lateral'}
            title={sidebarOpen ? 'Ocultar menu lateral' : 'Mostrar menu lateral'}
          >
            {sidebarOpen ? '◀ Menu' : '☰ Menu'}
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
