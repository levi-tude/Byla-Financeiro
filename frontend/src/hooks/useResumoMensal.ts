import { useState, useEffect } from 'react';
import { getResumoMensal, getUltimoMesResumo } from '../services/resumoMensal';
import type { ResumoMensalRow } from '../types/resumo';

export function useResumoMensal() {
  const [resumoMensal, setResumoMensal] = useState<ResumoMensalRow[]>([]);
  const [ultimoMes, setUltimoMes] = useState<ResumoMensalRow | null>(null);
  const [mesAnterior, setMesAnterior] = useState<ResumoMensalRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const [lista, ultimo] = await Promise.all([
          getResumoMensal(),
          getUltimoMesResumo(),
        ]);
        if (cancelled) return;
        setResumoMensal(lista);
        setUltimoMes(ultimo);
        setMesAnterior(lista.length >= 2 ? lista[1] : null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { resumoMensal, ultimoMes, mesAnterior, isLoading, error };
}
