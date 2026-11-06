import { useMonthYear } from '../../context/MonthYearContext';

type MonthYearPickerProps = {
  /** Layout compacto para cabeçalho mobile. */
  compact?: boolean;
};

export function MonthYearPicker({ compact = false }: MonthYearPickerProps) {
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

  const goNovoMes = () => {
    const dt = new Date(monthYear.ano, monthYear.mes, 1);
    setMonthYear(dt.getMonth() + 1, dt.getFullYear());
  };

  const btn =
    'inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-gray-300 bg-white text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200';

  return (
    <div className={`flex min-w-0 items-center ${compact ? 'gap-1' : 'gap-2'}`}>
      <button
        type="button"
        onClick={goMesAnterior}
        disabled={!(idxAtual >= 0 && idxAtual + 1 < opcoes.length)}
        className={btn}
        title="Mês anterior"
        aria-label="Mês anterior"
      >
        ◀
      </button>
      {!compact ? (
        <label className="whitespace-nowrap text-sm text-gray-600 dark:text-slate-400">Mês:</label>
      ) : null}
      <select
        className={`min-h-11 rounded-md border border-gray-300 bg-white text-sm text-gray-800 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 ${
          compact ? 'max-w-[7.5rem] px-1.5 py-1' : 'px-2 py-1.5'
        }`}
        value={value}
        onChange={(e) => {
          const [mes, ano] = e.target.value.split('-').map(Number);
          if (mes && ano) setMonthYear(mes, ano);
        }}
        aria-label="Selecionar mês e ano"
      >
        {opcoes.map((o) => (
          <option key={`${o.ano}-${o.mes}`} value={`${o.mes}-${o.ano}`}>
            {compact ? o.label.replace(/^(\w{3})[a-zç]*\s*/i, '$1 ') : o.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={goMesSeguinte}
        disabled={idxAtual <= 0}
        className={btn}
        title="Mês seguinte"
        aria-label="Mês seguinte"
      >
        ▶
      </button>
      <button
        type="button"
        onClick={goNovoMes}
        className={`min-h-11 rounded-md border border-indigo-300 bg-indigo-50 font-medium text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200 ${
          compact ? 'px-2 text-xs' : 'px-2 text-xs'
        }`}
        title="Ir para o próximo mês"
        aria-label="Novo mês"
      >
        {compact ? '+ Mês' : '+ Novo mês'}
      </button>
    </div>
  );
}
