import { useState, useEffect } from 'react';
import { getFluxoCompleto } from '../services/backendApi';

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL ?? '').trim();

export function useFluxoCompleto(mes?: number, ano?: number) {
  const [entradaTotal, setEntradaTotal] = useState<number | null>(null);
  const [saidaTotal, setSaidaTotal] = useState<number | null>(null);
  const [lucroTotal, setLucroTotal] = useState<number | null>(null);
  const [linhas, setLinhas] = useState<{ label: string; valor: string; valorNum?: number }[]>([]);
  const [porColuna, setPorColuna] = useState<{ label: string; valor: string; valorNum?: number }[][]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!BACKEND_URL) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setFallbackMessage(null);
    getFluxoCompleto(mes, ano)
      .then((res) => {
        if (cancelled) return;
        const c = res.combinado;
        setEntradaTotal(c.entradaTotal ?? null);
        setSaidaTotal(c.saidaTotal ?? null);
        setLucroTotal(c.lucroTotal ?? null);
        setLinhas(c.linhas ?? []);
        setPorColuna(c.porColuna ?? []);
        if (res.fallback_message) setFallbackMessage(res.fallback_message);
        else if (res.sheet_error) setError(res.sheet_error);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erro ao carregar fluxo');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [mes, ano]);

  return { entradaTotal, saidaTotal, lucroTotal, linhas, porColuna, isLoading, error, fallbackMessage };
}
