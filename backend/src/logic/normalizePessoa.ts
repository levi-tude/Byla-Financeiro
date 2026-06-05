/**
 * Espelho de public.byla_norm_pessoa(text) — minúsculas, trim, espaços colapsados.
 */
export function normalizePessoa(t: string | null | undefined): string {
  return String(t ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}
