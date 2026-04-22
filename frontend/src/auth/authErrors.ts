/** Mensagens amigáveis para erros comuns do Supabase Auth */
export function formatAuthErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  if (lower.includes('rate limit') || lower.includes('email rate')) {
    return (
      'Limite de e-mails atingido (proteção do Supabase). Aguarde cerca de 1 hora antes de pedir outro link, ' +
      'ou configure um SMTP próprio em Authentication → Emails → SMTP no painel do Supabase para limites maiores.'
    );
  }

  return raw;
}
