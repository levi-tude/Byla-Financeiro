import { createContext, useContext, useState, useMemo, useCallback, type ReactNode } from 'react';

export interface MonthYear {
  mes: number;
  ano: number;
}

const defaultMonthYear = (): MonthYear => {
  if (typeof window !== 'undefined') {
    const raw = window.localStorage.getItem('byla:month-year');
    if (raw) {
      const [mesRaw, anoRaw] = raw.split('-').map(Number);
      if (
        Number.isInteger(mesRaw) &&
        mesRaw >= 1 &&
        mesRaw <= 12 &&
        Number.isInteger(anoRaw) &&
        anoRaw >= 2000 &&
        anoRaw <= 2100
      ) {
        return { mes: mesRaw, ano: anoRaw };
      }
    }
  }
  const d = new Date();
  return { mes: d.getMonth() + 1, ano: d.getFullYear() };
};

type MonthYearContextValue = {
  monthYear: MonthYear;
  setMonthYear: (m: number, a: number) => void;
  /** Opções para o seletor: janela ampla para consulta histórica */
  opcoes: { mes: number; ano: number; label: string }[];
};

const MonthYearContext = createContext<MonthYearContextValue | null>(null);

const MESES_NOMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function buildOpcoes(): { mes: number; ano: number; label: string }[] {
  const d = new Date();
  const anoAtual = d.getFullYear();
  const mesAtual = d.getMonth() + 1;
  const out: { mes: number; ano: number; label: string }[] = [];
  let ano = anoAtual;
  let mes = mesAtual;
  for (let i = 0; i < 120; i++) {
    out.push({
      mes,
      ano,
      label: `${MESES_NOMES[mes - 1]}/${String(ano).slice(-2)}`,
    });
    mes--;
    if (mes < 1) {
      mes = 12;
      ano--;
    }
  }
  return out;
}

const OPCOES = buildOpcoes();

export function MonthYearProvider({ children }: { children: ReactNode }) {
  const [monthYear, setState] = useState<MonthYear>(defaultMonthYear);
  const setMonthYear = useCallback((mes: number, ano: number) => {
    if (!Number.isInteger(mes) || mes < 1 || mes > 12) return;
    if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) return;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('byla:month-year', `${mes}-${ano}`);
    }
    setState({ mes, ano });
  }, []);
  const value = useMemo<MonthYearContextValue>(
    () => ({
      monthYear,
      setMonthYear,
      opcoes: OPCOES,
    }),
    [monthYear, setMonthYear]
  );
  return (
    <MonthYearContext.Provider value={value}>
      {children}
    </MonthYearContext.Provider>
  );
}

export function useMonthYear(): MonthYearContextValue {
  const ctx = useContext(MonthYearContext);
  if (!ctx) {
    const d = new Date();
    return {
      monthYear: { mes: d.getMonth() + 1, ano: d.getFullYear() },
      setMonthYear: () => {},
      opcoes: OPCOES,
    };
  }
  return ctx;
}
