/**
 * Origem dos dados conforme REGRAS_FONTES_SUPABASE_PLANILHAS.md.
 * Domínio puro.
 */

export type OrigemDados = 'planilha' | 'supabase' | 'merge';

export function descricaoOrigem(origem: OrigemDados): string {
  switch (origem) {
    case 'planilha':
      return 'Planilha (fonte principal para cadastro)';
    case 'supabase':
      return 'Supabase (fallback ou fonte oficial financeira)';
    case 'merge':
      return 'Combinado (Supabase + planilha)';
    default:
      return String(origem);
  }
}
