import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { MonthYearPicker } from '../components/ui/MonthYearPicker';
import { KeyboardShortcutsModal } from '../components/ui/KeyboardShortcutsModal';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { SensitiveBlurToggle } from '../components/ui/SensitiveBlurToggle';
import { useAuth } from '../auth/AuthContext';
import { useMonthYear } from '../context/MonthYearContext';
import { AccessibilityChatButton } from '../components/ai/AccessibilityChatButton';
import { AccessibilityChatPanel } from '../components/ai/AccessibilityChatPanel';

const SIDEBAR_STORAGE_KEY = 'byla-sidebar-open';
/** Desktop visual parity from lg (1024px) up — below that, mobile casca. */
const DESKTOP_MQ = '(min-width: 1024px)';
const MOBILE_MQ = '(max-width: 1023px)';

function readSidebarOpenPreference(): boolean {
  const isDesktop =
    typeof window !== 'undefined' && window.matchMedia(DESKTOP_MQ).matches;
  try {
    const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (saved === 'false') return false;
    if (saved === 'true') return isDesktop;
  } catch {
    /* ignore */
  }
  return isDesktop;
}

function useIsMobileNav(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_MQ).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return isMobile;
}

export function LayoutShell() {
  const [sidebarOpen, setSidebarOpen] = useState(readSidebarOpenPreference);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [consultaOpen, setConsultaOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const isMobileNav = useIsMobileNav();
  const auth = useAuth();
  const location = useLocation();
  const { monthYear } = useMonthYear();
  const wasMobileNavRef = useRef(isMobileNav);
  const moreRef = useRef<HTMLDivElement | null>(null);

  const podeConsulta = auth.role === 'admin' || auth.role === 'gestor';
  const monthYearLabel = `${String(monthYear.mes).padStart(2, '0')}/${monthYear.ano}`;

  useEffect(() => {
    if (!wasMobileNavRef.current && isMobileNav) {
      setSidebarOpen(false);
    }
    wasMobileNavRef.current = isMobileNav;
  }, [isMobileNav]);

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
      if (t instanceof HTMLSelectElement) return;
      if ((t as HTMLElement).isContentEditable) return;
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [moreOpen]);

  return (
    <div className="flex min-h-screen overflow-x-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {sidebarOpen && isMobileNav ? (
        <button
          type="button"
          aria-label="Fechar menu"
          className="fixed inset-0 z-[45] bg-slate-900/40"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
      <Sidebar
        open={sidebarOpen}
        isMobile={isMobileNav}
        onNavigate={() => {
          if (isMobileNav) setSidebarOpen(false);
        }}
        showChromeExtras={isMobileNav}
        onOpenShortcuts={() => {
          setShortcutsOpen(true);
          if (isMobileNav) setSidebarOpen(false);
        }}
      />
      <main className="flex min-w-0 flex-1 flex-col overflow-x-hidden bg-slate-100 dark:bg-slate-950">
        <div className="sticky top-0 z-20 flex min-h-[52px] shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-slate-100/95 px-3 py-2 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95">
          <button
            type="button"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-expanded={sidebarOpen}
            aria-controls="app-sidebar"
            aria-label={sidebarOpen ? 'Ocultar menu lateral' : 'Mostrar menu lateral'}
            title={sidebarOpen ? 'Ocultar menu lateral' : 'Mostrar menu lateral'}
          >
            {sidebarOpen ? '◀ Menu' : '☰ Menu'}
          </button>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            {/* Desktop (≥lg): mesma barra de antes */}
            <div className="hidden items-center gap-3 lg:flex">
              <SensitiveBlurToggle />
              <ThemeToggle />
              <button
                type="button"
                onClick={() => setShortcutsOpen(true)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 focus-visible:outline focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                title="Atalhos de teclado"
              >
                Atalhos{' '}
                <kbd className="ml-1 rounded border border-slate-200 bg-slate-50 px-1 font-sans dark:border-slate-600 dark:bg-slate-900">
                  ?
                </kbd>
              </button>
            </div>
            {/* Mobile/tablet: menu … com tema/atalhos */}
            <div className="relative lg:hidden" ref={moreRef}>
              <button
                type="button"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-lg font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                aria-expanded={moreOpen}
                aria-haspopup="menu"
                aria-label="Mais opções"
                onClick={() => setMoreOpen((v) => !v)}
              >
                …
              </button>
              {moreOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 z-30 mt-2 w-52 rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-600 dark:bg-slate-900"
                >
                  <div className="space-y-2 p-1">
                    <SensitiveBlurToggle />
                    <ThemeToggle />
                    <button
                      type="button"
                      role="menuitem"
                      className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                      onClick={() => {
                        setMoreOpen(false);
                        setShortcutsOpen(true);
                      }}
                    >
                      Atalhos de teclado
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            <MonthYearPicker compact={isMobileNav} />
          </div>
        </div>
        <div
          className={`byla-outlet min-w-0 overflow-x-hidden p-0 text-slate-900 dark:text-slate-100 ${
            podeConsulta ? 'pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]' : ''
          }`}
        >
          <Outlet />
        </div>
      </main>
      <KeyboardShortcutsModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        role={auth.role}
      />
      {podeConsulta ? (
        <>
          {!consultaOpen ? <AccessibilityChatButton onClick={() => setConsultaOpen(true)} /> : null}
          <AccessibilityChatPanel
            open={consultaOpen}
            onClose={() => setConsultaOpen(false)}
            context={{
              route: location.pathname,
              role: auth.role,
              monthYear: monthYearLabel,
            }}
          />
        </>
      ) : null}
    </div>
  );
}
