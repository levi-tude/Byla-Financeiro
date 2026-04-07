import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAlunosCompleto } from '../services/backendApi';
import { supabase } from '../services/supabase';

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL ?? '').trim();

export interface AlunoRow {
  [key: string]: string | number | unknown;
}

export type PorAba = Record<string, { rows: AlunoRow[]; colunas: string[]; por_modalidade: Record<string, AlunoRow[]> }>;

export function useAlunosCompleto() {
  const backendQuery = useQuery({
    queryKey: ['alunos-completo'],
    queryFn: getAlunosCompleto,
    enabled: !!BACKEND_URL,
  });

  const [fallbackRows, setFallbackRows] = useState<AlunoRow[]>([]);
  const [fallbackError, setFallbackError] = useState<string | null>(null);
  const [fallbackLoading, setFallbackLoading] = useState(false);

  useEffect(() => {
    if (BACKEND_URL) return;
    let cancelled = false;

    async function loadFallback() {
      setFallbackLoading(true);
      setFallbackError(null);
      try {
        if (!supabase) {
          if (!cancelled) setFallbackRows([]);
          return;
        }
        const { data, error: sbError } = await supabase.from('alunos').select('id, nome').order('nome');
        if (sbError) throw sbError;
        const rows = (data ?? []).map((r: { id: string; nome: string }) => ({
          id: r.id,
          nome: r.nome,
          CLIENTE: r.nome,
        }));
        if (!cancelled) setFallbackRows(rows);
      } catch (e) {
        if (!cancelled) {
          setFallbackError(e instanceof Error ? e.message : 'Erro ao carregar');
          setFallbackRows([]);
        }
      } finally {
        if (!cancelled) setFallbackLoading(false);
      }
    }

    loadFallback();
    return () => {
      cancelled = true;
    };
  }, []);

  if (BACKEND_URL) {
    return {
      combinado: (backendQuery.data?.combinado ?? []) as AlunoRow[],
      porAba: (backendQuery.data?.por_aba ?? null) as PorAba | null,
      origem: backendQuery.data?.origem ?? null,
      abasLidas: backendQuery.data?.abas_lidas,
      isLoading: backendQuery.isPending || backendQuery.isFetching,
      error:
        backendQuery.data?.sheet_error ??
        (backendQuery.error instanceof Error ? backendQuery.error.message : backendQuery.error ? String(backendQuery.error) : null),
    };
  }

  return {
    combinado: fallbackRows,
    porAba: null,
    origem: 'supabase' as const,
    abasLidas: undefined,
    isLoading: fallbackLoading,
    error: fallbackError,
  };
}
