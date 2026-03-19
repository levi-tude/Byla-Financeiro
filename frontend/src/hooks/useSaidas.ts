import { useState, useEffect } from 'react';
import { useMonthYear } from '../context/MonthYearContext';
import { getTransacoesPorMes, type TransacaoItem } from '../services/backendApi';

export function useSaidas() {
  const { monthYear } = useMonthYear();
  const [rows, setRows] = useState<TransacaoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    getTransacoesPorMes(monthYear.mes, monthYear.ano, 'saida')
      .then((res) => {
        if (!cancelled) setRows(res.itens);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [monthYear.mes, monthYear.ano]);

  return { rows, isLoading, error };
}

