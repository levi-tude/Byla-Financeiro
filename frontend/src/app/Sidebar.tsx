import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { isNavPathActive, navSectionsForRole } from './navConfig';

type SidebarProps = {
  mobileOpen?: boolean;
  onNavigate?: () => void;
};

export function Sidebar({ mobileOpen = false, onNavigate }: SidebarProps) {
  const location = useLocation();
  const auth = useAuth();
  const role = auth.role;
  const sections = navSectionsForRole(role);

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex h-screen w-56 shrink-0 flex-col border-r border-byla-navy-border bg-byla-navy transition-transform duration-200 ease-out md:static md:h-full md:max-h-screen md:translate-x-0 ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}
    >
      <div className="p-4 border-b border-byla-navy-border">
        <Link
          to="/perfil"
          onClick={() => onNavigate?.()}
          className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-byla-navy-light focus-visible:outline focus-visible:ring-2 focus-visible:ring-white/80"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-sm font-semibold text-white">
            {(auth.email?.trim().charAt(0) || 'U').toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-white font-semibold text-lg tracking-wide">BYLA</span>
            <span className="block truncate text-[11px] text-gray-300">{auth.email ?? 'Meu perfil'}</span>
          </span>
        </Link>
      </div>
      <nav className="flex-1 p-3 space-y-4" aria-label="Menu principal">
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
                      <p className="mb-1 mt-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400 first:mt-0">
                        {item.group}
                      </p>
                    ) : null}
                    <Link
                      to={item.path}
                      onClick={() => onNavigate?.()}
                      className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-white/80 ${
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
      <div className="p-3 border-t border-byla-navy-border space-y-2">
        <div className="text-xs text-gray-300">
          {auth.email ? <span>{auth.email}</span> : null}
          {role ? <div className="mt-0.5 uppercase tracking-wide text-[10px]">{role}</div> : null}
        </div>
        <button
          type="button"
          onClick={() => auth.signOut()}
          className="w-full px-3 py-2 rounded-lg text-sm font-medium text-gray-200 hover:bg-byla-navy-light hover:text-white text-left"
        >
          Sair
        </button>
      </div>
    </aside>
  );
}
