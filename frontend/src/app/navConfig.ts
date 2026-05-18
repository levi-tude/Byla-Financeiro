import type { AppRole } from '../auth/types';

export type NavItem = {
  path: string;
  label: string;
  roles: AppRole[];
  /** Destaque visual no menu (item principal do perfil). */
  primary?: boolean;
};

export type NavSection = {
  id: string;
  label: string;
  /** Seção aparece quando o perfil tiver acesso a pelo menos um item. */
  roles: AppRole[];
  items: NavItem[];
};

/** Rotas antigas descontinuadas — redirecionam ao fluxo operacional. */
export const deprecatedConsultaPaths = ['/alunos', '/pagamentos-planilha'] as const;

export const navSections: NavSection[] = [
  {
    id: 'operacao',
    label: 'Operação',
    roles: ['secretaria', 'admin'],
    items: [
      {
        path: '/fluxo-caixa',
        label: 'Fluxo de caixa',
        roles: ['secretaria', 'admin'],
        primary: true,
      },
    ],
  },
  {
    id: 'financeiro',
    label: 'Finanças',
    roles: ['admin'],
    items: [
      { path: '/', label: 'Visão geral', roles: ['admin'] },
      { path: '/transacoes', label: 'Transações', roles: ['admin'] },
      { path: '/controle-caixa', label: 'Controle de caixa', roles: ['admin'] },
      { path: '/validacao-pagamentos-diaria', label: 'Validação de pagamentos', roles: ['admin'] },
      { path: '/conciliacao', label: 'Conciliação', roles: ['admin'] },
      { path: '/calendario-financeiro', label: 'Calendário financeiro', roles: ['admin'] },
      { path: '/fluxo-divergencias', label: 'Divergências (sistema × planilha)', roles: ['admin'] },
    ],
  },
  {
    id: 'relatorios',
    label: 'Relatórios',
    roles: ['admin'],
    items: [
      { path: '/relatorios-ia', label: 'Relatórios IA', roles: ['admin'] },
      { path: '/performance-atividades', label: 'Performance por atividade', roles: ['admin'] },
    ],
  },
];

export function navSectionsForRole(role: AppRole | null): Array<NavSection & { items: NavItem[] }> {
  if (!role) return [];
  return navSections
    .filter((section) => section.roles.includes(role))
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.roles.includes(role)),
    }))
    .filter((section) => section.items.length > 0);
}

export function isNavPathActive(pathname: string, itemPath: string): boolean {
  if (itemPath === '/') return pathname === '/';
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}
