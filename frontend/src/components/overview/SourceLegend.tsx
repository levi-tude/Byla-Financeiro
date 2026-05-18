export function SourceLegend() {
  const items = [
    {
      key: 'fechamento',
      label: 'Fechamento',
      hint: 'Entradas, saídas e lucro que você fecha no mês',
      className:
        'bg-indigo-50 text-indigo-900 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-100 dark:border-indigo-800',
    },
    {
      key: 'extrato',
      label: 'Extrato',
      hint: 'Movimentações reais na conta bancária',
      className:
        'bg-rose-50 text-rose-900 border-rose-200 dark:bg-rose-950/40 dark:text-rose-100 dark:border-rose-800',
    },
    {
      key: 'fluxo',
      label: 'Fluxo',
      hint: 'Mensalidades e operação por aluno',
      className:
        'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-100 dark:border-emerald-800',
    },
  ] as const;

  return (
    <div className="flex flex-wrap gap-2" role="list" aria-label="Legenda das fontes de dados">
      {items.map((item) => (
        <span
          key={item.key}
          role="listitem"
          title={item.hint}
          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${item.className}`}
        >
          {item.label}
        </span>
      ))}
    </div>
  );
}
