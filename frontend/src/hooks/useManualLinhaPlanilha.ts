import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'byla_manual_linha_planilha_v1';

type MonthBucket = Record<string, string>;

function keyMes(ano: number, mes: number) {
  return `${ano}-${mes}`;
}

function loadBucket(ano: number, mes: number): MonthBucket {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const all = JSON.parse(raw) as Record<string, MonthBucket>;
    return all[keyMes(ano, mes)] ?? {};
  } catch {
    return {};
  }
}

function saveBucket(ano: number, mes: number, bucket: MonthBucket) {
  const raw = localStorage.getItem(STORAGE_KEY);
  const all = raw ? (JSON.parse(raw) as Record<string, MonthBucket>) : {};
  all[keyMes(ano, mes)] = bucket;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

/** Overrides de linha CONTROLE por id de transação — só neste navegador (localStorage). */
export function useManualLinhaPlanilha(ano: number, mes: number) {
  const [overrides, setOverrides] = useState<MonthBucket>(() => loadBucket(ano, mes));

  useEffect(() => {
    setOverrides(loadBucket(ano, mes));
  }, [ano, mes]);

  const setLinha = useCallback(
    (transacaoId: string, linha: string | null) => {
      setOverrides((prev) => {
        const next = { ...prev };
        if (linha === null || linha === '') delete next[transacaoId];
        else next[transacaoId] = linha;
        saveBucket(ano, mes, next);
        return next;
      });
    },
    [ano, mes]
  );

  const clearMes = useCallback(() => {
    setOverrides({});
    saveBucket(ano, mes, {});
  }, [ano, mes]);

  return { overrides, setLinha, clearMes };
}
