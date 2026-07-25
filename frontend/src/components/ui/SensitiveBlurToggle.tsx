import { useSensitiveBlur } from '../../context/SensitiveBlurContext';

export function SensitiveBlurToggle() {
  const { active, toggle, available } = useSensitiveBlur();

  if (!available) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium shadow-sm focus-visible:outline focus-visible:ring-2 focus-visible:ring-indigo-500 ${
        active
          ? 'border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-950/60 dark:text-amber-100 dark:hover:bg-amber-950'
          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
      }`}
      title="Oculta valores, nomes e outros dados sensíveis para prints (só em desenvolvimento)"
      aria-pressed={active}
      aria-label={active ? 'Mostrar dados sensíveis' : 'Ocultar dados sensíveis para print'}
    >
      {active ? 'Dados ocultos' : 'Ocultar dados'}
    </button>
  );
}
