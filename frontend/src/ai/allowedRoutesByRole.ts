import type { AppRole } from '../auth/types';

/** Rotas que o assistente e a navegação podem usar por perfil secretária. */
const secretariaRoutes = new Set(['/', '/fluxo-caixa', '/perfil']);

const adminRoutes = new Set<string>([
  ...secretariaRoutes,
  '/transacoes',
  '/entradas',
  '/saidas',
  '/despesas',
  '/relatorios-ia',
  '/performance-atividades',
  '/controle-caixa',
  '/calendario-financeiro',
  '/validacao-pagamentos-diaria',
]);

function normalizeRoute(path: string): string {
  const clean = String(path ?? '').trim().split('?')[0].split('#')[0];
  if (!clean) return '/';
  return clean.startsWith('/') ? clean : `/${clean}`;
}

export function canNavigateToRoute(role: AppRole | null, path: string): boolean {
  const normalized = normalizeRoute(path);
  if (role === 'admin') return adminRoutes.has(normalized);
  if (role === 'secretaria') return secretariaRoutes.has(normalized);
  return false;
}
