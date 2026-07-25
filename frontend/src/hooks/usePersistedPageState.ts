import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

const STORAGE_PREFIX = 'byla:page-state:v1:';
const DEBOUNCE_MS = 150;

function storageKey(pageKey: string): string {
  return `${STORAGE_PREFIX}${pageKey}`;
}

function readStored<T extends Record<string, unknown>>(pageKey: string, initial: T): T {
  try {
    const raw = sessionStorage.getItem(storageKey(pageKey));
    if (!raw) return initial;
    const parsed = JSON.parse(raw) as Partial<T>;
    return { ...initial, ...parsed };
  } catch {
    return initial;
  }
}

/** UI de navegação por página — persiste em sessionStorage até fechar a aba. */
export function usePersistedPageState<T extends Record<string, unknown>>(
  pageKey: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const initialRef = useRef(initial);
  const [state, setState] = useState<T>(() => readStored(pageKey, initialRef.current));
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try {
        sessionStorage.setItem(storageKey(pageKey), JSON.stringify(state));
      } catch {
        /* private mode / quota */
      }
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [pageKey, state]);

  return [state, setState];
}
