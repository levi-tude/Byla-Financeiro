import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { isNavPathActive, navSectionsForRole } from './navConfig';
import { ThemeToggle } from '../components/ui/ThemeToggle';

type SidebarProps = {
  open?: boolean;
  isMobile?: boolean;
  onNavigate?: () => void;
  /** Tema + atalhos no rodapé da gaveta (mobile). */
  showChromeExtras?: boolean;
  onOpenShortcuts?: () => void;
};

export function Sidebar({
  open = true,
  isMobile = false,
  onNavigate,
  showChromeExtras = false,
  onOpenShortcuts,
}: SidebarProps) {
  const location = useLocation();
  const auth = useAuth();
  const role = auth.role;
  const sections = navSectionsForRole(role);

  const mobileClasses = isMobile
    ? `fixed inset-y-0 left-0 z-50 h-full w-56 overflow-hidden ${
        open ? 'translate-x-0' : '-translate-x-full pointer-events-none'
      }`
    : `sticky top-0 self-start h-screen max-h-[100dvh] shrink-0 overflow-hidden ${
        open
          ? 'w-56 opacity-100'
          : 'w-0 overflow-hidden border-r-0 opacity-0 pointer-events-none'
      }`;

  return (
    <aside
      id="app-sidebar"
      aria-hidden={!open}
      className={`flex flex-col border-r border-byla-navy-border bg-byla-navy transition-all duration-200 ease-out ${mobileClasses}`}
    >
      <div className="shrink-0 border-b border-byla-navy-border p-4">
        <Link
          to="/perfil"
          onClick={() => onNavigate?.()}
          className="group flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-byla-navy-light focus-visible:outline focus-visible:ring-2 focus-visible:ring-white/80"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-sm font-semibold text-white">
            {(auth.email?.trim().charAt(0) || 'U').toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-lg font-semibold tracking-wide text-white">BYLA</span>
            <span className="block truncate text-[11px] text-gray-300">{auth.email ?? 'Meu perfil'}</span>
          </span>
        </Link>
      </div>

      <nav
        className="byla-sidebar-nav min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-3"
        aria-label="Menu principal"
      >
        {sections.map((section) => (
          <div key={section.id}>
            <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item, itemIndex) => {
                const isActive = isNavPathActive(location.pathname, item.path);
                const prevGroup = section.items[itemIndex - 1]?.group;
                const showGroup = item.group && item.group !== prevGroup;
                return (
                  <li key={item.path}>
                    {showGroup ? (
                      <p className="mb-1 mt-2 px-3 text-[10px] font-semibold text-gray-400 first:mt-0">
                        {item.group}
                      </p>
                    ) : null}
                    <Link
                      to={item.path}
                      onClick={() => onNavigate?.()}
                      className={`block min-h-11 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-white/80 ${
                        isActive
                          ? 'border-l-2 border-byla-red bg-byla-red/20 text-white'
                          : item.primary
                            ? 'text-white hover:bg-byla-navy-light hover:text-white'
                            : 'text-gray-300 hover:bg-byla-navy-light hover:text-white'
                      }`}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 space-y-2 border-t border-byla-navy-border p-3">
        {showChromeExtras ? (
          <div className="space-y-2 rounded-lg bg-white/5 p-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => onOpenShortcuts?.()}
              className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-gray-200 hover:bg-byla-navy-light hover:text-white"
            >
              Atalhos de teclado
            </button>
          </div>
        ) : null}
        <div className="text-xs text-gray-300">
          {auth.email ? <span className="break-all">{auth.email}</span> : null}
          {role ? <div className="mt-0.5 text-[10px] capitalize">{role}</div> : null}
        </div>
        <button
          type="button"
          onClick={() => auth.signOut()}
          className="w-full min-h-11 rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-200 hover:bg-byla-navy-light hover:text-white"
        >
          Sair
        </button>
      </div>
    </aside>
  );
}
