import { useMonthYear } from '../../context/MonthYearContext';

export function MonthYearPicker() {
  const { monthYear, setMonthYear, opcoes } = useMonthYear();
  const value = `${monthYear.mes}-${monthYear.ano}`;
  const idxAtual = opcoes.findIndex((o) => o.mes === monthYear.mes && o.ano === monthYear.ano);

  const goMesAnterior = () => {
    if (idxAtual >= 0 && idxAtual + 1 < opcoes.length) {
      const proximo = opcoes[idxAtual + 1];
      setMonthYear(proximo.mes, proximo.ano);
    }
  };

  const goMesSeguinte = () => {
    if (idxAtual > 0) {
      const anterior = opcoes[idxAtual - 1];
      setMonthYear(anterior.mes, anterior.ano);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={goMesAnterior}
        disabled={!(idxAtual >= 0 && idxAtual + 1 < opcoes.length)}
        className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
        title="Mês anterior"
      >
        ◀
      </button>
      <label className="whitespace-nowrap text-sm text-gray-600 dark:text-slate-400">Mês:</label>
      <select
        className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-800 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        value={value}
        onChange={(e) => {
          const [mes, ano] = e.target.value.split('-').map(Number);
          if (mes && ano) setMonthYear(mes, ano);
        }}
        aria-label="Selecionar mês e ano"
      >
        {opcoes.map((o) => (
          <option key={`${o.ano}-${o.mes}`} value={`${o.mes}-${o.ano}`}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={goMesSeguinte}
        disabled={idxAtual <= 0}
        className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
        title="Mês seguinte"
      >
        ▶
      </button>
    </div>
  );
}
