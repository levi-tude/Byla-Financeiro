import { useQuery } from '@tanstack/react-query';
import { useMonthYear } from '../context/MonthYearContext';
import { getTransacoesPorMes, type TransacaoItem } from '../services/backendApi';

export function useSaidas() {
  const { monthYear } = useMonthYear();
  const q = useQuery({
    queryKey: ['transacoes-saidas', monthYear.mes, monthYear.ano],
    queryFn: () => getTransacoesPorMes(monthYear.mes, monthYear.ano, 'saida'),
  });

  return {
    rows: (q.data?.itens ?? []) as TransacaoItem[],
    isLoading: q.isPending || q.isFetching,
    error: q.error instanceof Error ? q.error : q.error ? new Error(String(q.error)) : null,
  };
}
