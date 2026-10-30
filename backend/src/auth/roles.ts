/**
 * 'gestor' = só leitura (por ora: apenas o chat Consulta Byla). Nenhuma rota de escrita aceita gestor.
 * Para existir no banco precisa da migração scripts/supabase-profiles-role-gestor.sql (aprovação do Levi).
 */
export const APP_ROLES = ['admin', 'secretaria', 'gestor'] as const;

/** Papéis que podem usar o Consulta Byla (aplicado no servidor em routes/api.ts). */
export const CONSULTA_ROLES: readonly AppRole[] = ['admin', 'gestor'];

/** Prefixos liberados para CONSULTA_ROLES (gestor só acessa estes). */
export const CONSULTA_PREFIXES = ['/ai/consulta', '/ai/criacoes'] as const;

export type AppRole = (typeof APP_ROLES)[number];

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === 'string' && (APP_ROLES as readonly string[]).includes(value);
}

export type AuthUserContext = {
  userId: string;
  email: string | null;
  role: AppRole;
};
