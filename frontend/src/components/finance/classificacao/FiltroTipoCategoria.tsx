import {
  agruparPorBlocoChave,
  encodeFiltroBloco,
  FILTRO_TIPO_PENDENTE,
  FILTRO_TIPO_TODAS,
  type CategoriaOpcao,
} from './utils';

export function FiltroTipoCategoria({
  value,
  onChange,
  categorias,
  label = 'Filtrar por tipo',
}: {
  value: string;
  onChange: (value: string) => void;
  categorias: CategoriaOpcao[];
  label?: string;
}) {
  const blocos = agruparPorBlocoChave(categorias);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="filtro-tipo-categoria" className="text-xs font-medium text-slate-500">
        {label}:
      </label>
      <select
        id="filtro-tipo-categoria"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-[12rem] max-w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
      >
        <option value={FILTRO_TIPO_TODAS}>Todos os tipos</option>
        <option value={FILTRO_TIPO_PENDENTE}>Sem categoria (pendente)</option>
        {blocos.map(({ blocoTemplateKey, blocoTitulo, linhas }) => (
          <optgroup key={blocoTemplateKey} label={blocoTitulo}>
            <option value={encodeFiltroBloco(blocoTemplateKey)}>Bloco inteiro — {blocoTitulo}</option>
            {linhas.map((c) => (
              <option key={c.templateKey} value={c.templateKey}>
                {c.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
