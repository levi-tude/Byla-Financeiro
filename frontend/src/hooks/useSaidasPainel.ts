import { useQuery } from '@tanstack/react-query';
import { useMonthYear } from '../context/MonthYearContext';
import { getSaidasPainel, type SaidasPainelResponse } from '../services/backendApi';

const BACKEND = Boolean((import.meta.env.VITE_BACKEND_URL ?? '').trim());

export function useSaidasPainel() {
  const { monthYear } = useMonthYear();
  const q = useQuery({
    queryKey: ['saidas-painel', monthYear.mes, monthYear.ano],
    queryFn: () => getSaidasPainel(monthYear.mes, monthYear.ano),
    enabled: BACKEND,
  });

  return {
    data: (q.data ?? null) as SaidasPainelResponse | null,
    isLoading: BACKEND && (q.isPending || q.isFetching),
    error: q.error instanceof Error ? q.error : q.error ? new Error(String(q.error)) : null,
    mes: monthYear.mes,
    ano: monthYear.ano,
  };
}
