import { useState, useEffect } from 'react';
import { getEntradasOficiais } from '../services/entradas';
import type { EntradaOficialRow } from '../types/entradas';
import type { EntradasFiltro } from '../services/entradas';

export function useEntradas(filtro: EntradasFiltro = {}) {
  const [rows, setRows] = useState<EntradaOficialRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const list = await getEntradasOficiais(filtro);
        if (!cancelled) setRows(list);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [filtro.dataInicio, filtro.dataFim, filtro.formaPagamento]);

  return { rows, isLoading, error };
}
