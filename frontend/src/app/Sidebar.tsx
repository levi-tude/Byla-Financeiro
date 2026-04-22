import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import type { AppRole } from '../auth/types';

const navItems: Array<{ path: string; label: string; roles: AppRole[] }> = [
  { path: '/', label: 'Visão geral', roles: ['secretaria', 'admin'] },
  { path: '/conciliacao', label: 'Conciliação', roles: ['admin'] },
  { path: '/entradas', label: 'Entradas', roles: ['admin'] },
  { path: '/atividades', label: 'Atividades', roles: ['secretaria', 'admin'] },
  { path: '/alunos', label: 'Alunos', roles: ['secretaria', 'admin'] },
  { path: '/saidas', label: 'Saídas', roles: ['admin'] },
  { path: '/relatorios-ia', label: 'Relatórios IA', roles: ['admin'] },
  { path: '/fluxo-caixa', label: 'Fluxo de caixa', roles: ['secretaria', 'admin'] },
  { path: '/pagamentos-planilha', label: 'Pagamentos planilha', roles: ['secretaria', 'admin'] },
  { path: '/validacao-pagamentos-diaria', label: 'Validação de pagamentos', roles: ['secretaria', 'admin'] },
  { path: '/controle-caixa', label: 'Controle de caixa', roles: ['admin'] },
  { path: '/calendario-financeiro', label: 'Calendário financeiro', roles: ['admin'] },
];

type SidebarProps = {
  mobileOpen?: boolean;
  onNavigate?: () => void;
};

export function Sidebar({ mobileOpen = false, onNavigate }: SidebarProps) {
  const location = useLocation();
  const auth = useAuth();
  const role = auth.role;
  const visibleItems = navItems.filter((item) => (role ? item.roles.includes(role) : false));

  return (
    <aside
      className={`fixed md:static inset-y-0 left-0 z-40 flex h-screen md:h-auto md:min-h-screen w-56 flex-col border-r border-byla-navy-border bg-byla-navy transition-transform duration-200 ease-out md:translate-x-0 ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}
    >
      <div className="p-4 border-b border-byla-navy-border">
        <span className="text-white font-semibold text-lg tracking-wide">
          BYLA
        </span>
      </div>
      <nav className="flex-1 p-3 space-y-0.5">
        {visibleItems.map((item) => {
          const isActive = location.pathname === item.path;

          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => onNavigate?.()}
              className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-white/80 ${
                isActive
                  ? 'bg-byla-red/20 text-white border-l-2 border-byla-red'
                  : 'text-gray-300 hover:bg-byla-navy-light hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-byla-navy-border space-y-2">
        <div className="text-xs text-gray-300">
          {auth.email ? <span>{auth.email}</span> : null}
          {role ? <div className="uppercase tracking-wide text-[10px] mt-0.5">{role}</div> : null}
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
