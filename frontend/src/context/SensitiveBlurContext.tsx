import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const STORAGE_KEY = 'byla-sensitive-blur-active';
const ROOT_CLASS = 'byla-sensitive-blur-active';

/** Disponível apenas em desenvolvimento (localhost). */
export const SENSITIVE_BLUR_DEV_ONLY = import.meta.env.DEV;

type SensitiveBlurContextValue = {
  active: boolean;
  toggle: () => void;
  setActive: (value: boolean) => void;
  available: boolean;
};

const SensitiveBlurContext = createContext<SensitiveBlurContextValue | null>(null);

function readStored(): boolean {
  if (!SENSITIVE_BLUR_DEV_ONLY) return false;
  try {
    return sessionStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function SensitiveBlurProvider({ children }: { children: ReactNode }) {
  const [active, setActiveState] = useState(readStored);

  const setActive = useCallback((value: boolean) => {
    if (!SENSITIVE_BLUR_DEV_ONLY) return;
    setActiveState(value);
    try {
      sessionStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => {
    setActive(!active);
  }, [active, setActive]);

  useEffect(() => {
    if (!SENSITIVE_BLUR_DEV_ONLY) return;
    document.documentElement.classList.toggle(ROOT_CLASS, active);
    return () => {
      document.documentElement.classList.remove(ROOT_CLASS);
    };
  }, [active]);

  const value = useMemo(
    () => ({
      active,
      toggle,
      setActive,
      available: SENSITIVE_BLUR_DEV_ONLY,
    }),
    [active, setActive, toggle],
  );

  return (
    <SensitiveBlurContext.Provider value={value}>{children}</SensitiveBlurContext.Provider>
  );
}

export function useSensitiveBlur(): SensitiveBlurContextValue {
  const ctx = useContext(SensitiveBlurContext);
  if (!ctx) {
    return {
      active: false,
      toggle: () => undefined,
      setActive: () => undefined,
      available: false,
    };
  }
  return ctx;
}
