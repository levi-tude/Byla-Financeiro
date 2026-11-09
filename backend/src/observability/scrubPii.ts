/** Remove CPF, telefone e e-mail de textos/objetos antes de enviar ao Sentry. */
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const PHONE = /(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?9?\d{4}[-\s]?\d{4}\b/g;
const SENSITIVE_KEYS = /^(cpf|telefone|phone|celular|whatsapp|email|e-mail|authorization|cookie|password|senha|token)$/i;

export function scrubString(s: string): string {
  return s.replace(EMAIL, '[email]').replace(CPF, '[cpf]').replace(PHONE, '[telefone]');
}

export function scrubPii<T>(value: T, depth = 0): T {
  if (depth > 8 || value == null) return value;
  if (typeof value === 'string') return scrubString(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => scrubPii(v, depth + 1)) as unknown as T;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.test(k) ? '[removido]' : scrubPii(v, depth + 1);
    }
    return out as T;
  }
  return value;
}
