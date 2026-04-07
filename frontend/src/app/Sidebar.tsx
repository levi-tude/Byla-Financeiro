import { Link, useLocation } from 'react-router-dom';

const navItems = [
  { path: '/', label: 'Visão geral' },
  { path: '/conciliacao', label: 'Conciliação' },
  { path: '/entradas', label: 'Entradas' },
  { path: '/atividades', label: 'Atividades' },
  { path: '/alunos', label: 'Alunos' },
  { path: '/saidas', label: 'Saídas' },
  { path: '/relatorios-ia', label: 'Relatórios IA' },
  { path: '/pagamentos-planilha', label: 'Pagamentos planilha' },
  { path: '/validacao-pagamentos-diaria', label: 'Validação de pagamentos' },
  { path: '/calendario-financeiro', label: 'Calendário financeiro' },
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

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
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
    </aside>
  );
}
