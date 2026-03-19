import { useMonthYear } from '../../context/MonthYearContext';

export function MonthYearPicker() {
  const { monthYear, setMonthYear, opcoes } = useMonthYear();
  const value = `${monthYear.mes}-${monthYear.ano}`;

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-gray-600 whitespace-nowrap">Mês:</label>
      <select
        className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-800 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
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
    </div>
  );
}
