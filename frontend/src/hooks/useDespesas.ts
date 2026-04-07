import { useQuery } from '@tanstack/react-query';
import { getDespesas, type DespesaItem } from '../services/backendApi';
import { useMonthYear } from '../context/MonthYearContext';

export function useDespesas() {
  const { monthYear } = useMonthYear();
  const q = useQuery({
    queryKey: ['despesas', monthYear.mes, monthYear.ano],
    queryFn: () => getDespesas(monthYear.mes, monthYear.ano),
  });

  const itens: DespesaItem[] = q.data?.itens ?? [];
  const resumo = q.data?.resumo ?? { total_geral: 0, por_funcionario: [], por_categoria: [] };

  return {
    itens,
    resumo,
    isLoading: q.isPending || q.isFetching,
    error: q.error instanceof Error ? q.error.message : q.error ? String(q.error) : null,
    mes: monthYear.mes,
    ano: monthYear.ano,
  };
}
