import { useState, useEffect } from 'react';
import { getFontes, type FontesStatusResponse } from '../services/backendApi';

export function useFontes(): {
  fontes: FontesStatusResponse | null;
  isLoading: boolean;
  error: string | null;
} {
  const [fontes, setFontes] = useState<FontesStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!(import.meta.env.VITE_BACKEND_URL ?? '').trim()) {
      setFontes(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setError(null);
    setFontes(null);
    setIsLoading(true);
    getFontes()
      .then((data) => {
        if (!cancelled) setFontes(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return { fontes, isLoading, error };
}
