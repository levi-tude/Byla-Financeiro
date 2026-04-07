import { useQuery } from '@tanstack/react-query';
import { getFontes, type FontesStatusResponse } from '../services/backendApi';

export function useFontes(): {
  fontes: FontesStatusResponse | null;
  isLoading: boolean;
  error: string | null;
} {
  const hasBackend = !!(import.meta.env.VITE_BACKEND_URL ?? '').trim();
  const q = useQuery({
    queryKey: ['fontes'],
    queryFn: getFontes,
    enabled: hasBackend,
  });

  return {
    fontes: q.data ?? null,
    isLoading: hasBackend && (q.isPending || q.isFetching),
    error: q.error instanceof Error ? q.error.message : q.error ? String(q.error) : null,
  };
}
