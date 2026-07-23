/**
 * Base URL usada em links de recupera├º├úo de senha (deve estar em
 * Supabase ÔåÆ Authentication ÔåÆ URL Configuration ÔåÆ Redirect URLs).
 */
export function getAuthSiteOrigin(): string {
  const fromEnv = import.meta.env.VITE_SITE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

export function getPasswordRecoveryRedirectUrl(): string {
  return `${getAuthSiteOrigin()}/redefinir-senha`;
}
