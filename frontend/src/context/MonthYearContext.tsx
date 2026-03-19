import { createContext, useContext, useState, useMemo, useCallback, type ReactNode } from 'react';

export interface MonthYear {
  mes: number;
  ano: number;
}

const defaultMonthYear = (): MonthYear => {
  const d = new Date();
  return { mes: d.getMonth() + 1, ano: d.getFullYear() };
};

type MonthYearContextValue = {
  monthYear: MonthYear;
  setMonthYear: (m: number, a: number) => void;
  /** Opções para o seletor: últimos 24 meses (mes, ano) */
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
  for (let i = 0; i < 24; i++) {
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
