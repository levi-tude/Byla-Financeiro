import { getSupabase } from './supabaseClient.js';
import { definirPadroesExternos } from './transacoesFiltro.js';
import { log } from './logger.js';

/**
 * Lê os padrões ativos de `public.regras_externos` (só SELECT) e aplica no filtro oficial.
 * Se a tabela não existir (migração ainda não aplicada) ou der erro, mantém o fallback do código.
 */
export async function carregarRegrasExternos(): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) return 0;
  const { data, error } = await supabase.from('regras_externos').select('padrao').eq('ativo', true);
  if (error) {
    log('warn', { msg: 'regras_externos indisponível; usando fallback do código', error: error.message });
    return 0;
  }
  const padroes = (data ?? []).map((r: { padrao: string | null }) => String(r.padrao ?? ''));
  definirPadroesExternos(padroes);
  return padroes.length;
}

/** Carrega na subida e a cada 10 min. */
export function iniciarRegrasExternos(intervaloMs = 10 * 60 * 1000): void {
  void carregarRegrasExternos().catch(() => undefined);
  const t = setInterval(() => void carregarRegrasExternos().catch(() => undefined), intervaloMs);
  t.unref?.();
}
