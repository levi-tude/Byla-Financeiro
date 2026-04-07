import { useQuery } from '@tanstack/react-query';
import { getFluxoCompleto } from '../services/backendApi';

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL ?? '').trim();

export function useFluxoCompleto(mes?: number, ano?: number) {
  const q = useQuery({
    queryKey: ['fluxo-completo', mes ?? null, ano ?? null],
    queryFn: () => getFluxoCompleto(mes, ano),
    enabled: !!BACKEND_URL,
  });

  const res = q.data;
  const c = res?.combinado;

  let errorMsg: string | null = null;
  if (q.error) {
    errorMsg = q.error instanceof Error ? q.error.message : String(q.error);
  } else if (res?.fallback_message) {
    errorMsg = null;
  } else if (res?.sheet_error) {
    errorMsg = res.sheet_error;
  }

  return {
    entradaTotal: c?.entradaTotal ?? null,
    saidaTotal: c?.saidaTotal ?? null,
    saidaSomaSecoesPrincipais: c?.saidaSomaSecoesPrincipais ?? null,
    saidaParceirosTotal: c?.saidaParceirosTotal ?? null,
    saidaFixasTotal: c?.saidaFixasTotal ?? null,
    lucroTotal: c?.lucroTotal ?? null,
    linhas: c?.linhas ?? [],
    porColuna: c?.porColuna ?? [],
    saidasBlocos: c?.saidasBlocos ?? [],
    isLoading: !!BACKEND_URL && (q.isPending || q.isFetching),
    error: errorMsg,
    fallbackMessage: res?.fallback_message ?? null,
  };
}
