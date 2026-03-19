import { useState, useEffect } from 'react';
import { getReconciliacaoMensalidades, getKpisInadimplencia } from '../services/conciliacao';
import type { ReconciliacaoMensalidadeRow } from '../types/conciliacao';
import type { ReconciliacaoFiltro } from '../services/conciliacao';

export function useConciliacao(filtro: ReconciliacaoFiltro = {}) {
  const [rows, setRows] = useState<ReconciliacaoMensalidadeRow[]>([]);
  const [kpis, setKpis] = useState({ qtdPendentes: 0, valorPendente: 0, total: 0, taxaAdimplencia: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [list, k] = await Promise.all([
          getReconciliacaoMensalidades(filtro),
          getKpisInadimplencia(filtro),
        ]);
        if (!cancelled) {
          setRows(list);
          setKpis(k);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [filtro.ano, filtro.mes, filtro.atividade, filtro.status]);

  return { rows, kpis, isLoading, error };
}
