import { Link, useLocation } from 'react-router-dom';

const navItems = [
  { path: '/', label: 'Visão geral' },
  { path: '/conciliacao', label: 'Conciliação' },
  { path: '/entradas', label: 'Entradas' },
  { path: '/atividades', label: 'Atividades' },
  { path: '/alunos', label: 'Alunos' },
  { path: '/despesas', label: 'Despesas' },
  { path: '/relatorios-ia', label: 'Relatórios IA' },
];

export function Sidebar() {
  const location = useLocation();

  return (
    <aside className="w-56 min-h-screen bg-byla-navy flex flex-col border-r border-byla-navy-border">
      <div className="p-4 border-b border-byla-navy-border">
        <span className="text-white font-semibold text-lg tracking-wide">
          BYLA
        </span>
      </div>
      <nav className="flex-1 p-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const isDisabled = item.disabled;

          return (
            <Link
              key={item.path}
              to={item.disabled ? '#' : item.path}
              className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isDisabled
                  ? 'text-gray-500 cursor-not-allowed opacity-60'
                  : isActive
                    ? 'bg-byla-red/20 text-white border-l-2 border-byla-red'
                    : 'text-gray-300 hover:bg-byla-navy-light hover:text-white'
              }`}
              onClick={(e) => isDisabled && e.preventDefault()}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
