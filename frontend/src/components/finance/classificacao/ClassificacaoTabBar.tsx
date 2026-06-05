export function ClassificacaoTabBar<T extends string>({
  tabs,
  active,
  onChange,
  className = 'mt-4',
}: {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {tabs.map(({ id, label }) => (
        <button
          type="button"
          key={id}
          onClick={() => onChange(id)}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            active === id
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
