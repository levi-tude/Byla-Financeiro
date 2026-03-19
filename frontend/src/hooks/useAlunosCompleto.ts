import { useState, useEffect } from 'react';
import { getAlunosCompleto } from '../services/backendApi';
import { supabase } from '../services/supabase';

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL ?? '').trim();

export interface AlunoRow {
  [key: string]: string | number | unknown;
}

export type PorAba = Record<string, { rows: AlunoRow[]; colunas: string[]; por_modalidade: Record<string, AlunoRow[]> }>;

export function useAlunosCompleto() {
  const [combinado, setCombinado] = useState<AlunoRow[]>([]);
  const [porAba, setPorAba] = useState<PorAba | null>(null);
  const [origem, setOrigem] = useState<'planilha' | 'supabase' | 'merge' | null>(null);
  const [abasLidas, setAbasLidas] = useState<string[] | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (BACKEND_URL) {
        try {
          const res = await getAlunosCompleto();
          if (!cancelled) {
            setCombinado((res.combinado ?? []) as AlunoRow[]);
            setPorAba((res.por_aba ?? null) as PorAba | null);
            setOrigem(res.origem);
            setAbasLidas(res.abas_lidas);
            setError(res.sheet_error ?? null);
          }
        } catch (e) {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : 'Erro ao carregar backend');
            setCombinado([]);
          }
        } finally {
          if (!cancelled) setIsLoading(false);
        }
        return;
      }

      try {
        if (!supabase) {
          if (!cancelled) {
            setCombinado([]);
            setIsLoading(false);
          }
          return;
        }
        const { data, error: sbError } = await supabase.from('alunos').select('id, nome').order('nome');
        if (sbError) throw sbError;
        const rows = (data ?? []).map((r: { id: string; nome: string }) => ({
          id: r.id,
          nome: r.nome,
          CLIENTE: r.nome,
        }));
        if (!cancelled) {
          setCombinado(rows);
          setOrigem('supabase');
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Erro ao carregar');
          setCombinado([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return { combinado, porAba, origem, abasLidas, isLoading, error };
}
