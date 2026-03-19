import { useState, useEffect } from 'react';
import { getDespesas, type DespesaItem, type DespesasResponse } from '../services/backendApi';
import { useMonthYear } from '../context/MonthYearContext';

export function useDespesas() {
  const { monthYear } = useMonthYear();
  const [dados, setDados] = useState<DespesasResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    getDespesas(monthYear.mes, monthYear.ano)
      .then((res) => {
        if (!cancelled) setDados(res);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [monthYear.mes, monthYear.ano]);

  const itens: DespesaItem[] = dados?.itens ?? [];
  const resumo = dados?.resumo ?? { total_geral: 0, por_funcionario: [], por_categoria: [] };

  return { itens, resumo, isLoading, error, mes: monthYear.mes, ano: monthYear.ano };
}

