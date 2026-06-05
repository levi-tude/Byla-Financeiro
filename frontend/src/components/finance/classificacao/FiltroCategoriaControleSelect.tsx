import {
  agruparPorBlocoChave,
  encodeFiltroBloco,
  FILTRO_TIPO_PENDENTE,
  FILTRO_TIPO_TODAS,
  type CategoriaOpcao,
} from './utils';

export type CategoriaControleFamilia = 'entrada' | 'saida';

export function encodeCategoriaControleValue(familia: CategoriaControleFamilia, templateKey: string): string {
  return `${familia}::${templateKey}`;
}

export function encodeCategoriaControleBloco(
  familia: CategoriaControleFamilia,
  blocoTemplateKey: string,
): string {
  return `${familia}::${encodeFiltroBloco(blocoTemplateKey)}`;
}

export function FiltroCategoriaControleSelect({
  value,
  onChange,
  entradas,
  saidas,
  tipoTransacao = 'todos',
  label = 'Tipo no Controle',
  layout = 'inline',
  id = 'filtro-categoria-controle',
  selectClassName = '',
}: {
  value: string;
  onChange: (value: string) => void;
  entradas: CategoriaOpcao[];
  saidas: CategoriaOpcao[];
  tipoTransacao?: 'todos' | 'entrada' | 'saida';
  label?: string;
  layout?: 'inline' | 'stacked';
  id?: string;
  selectClassName?: string;
}) {
  const blocosEntrada = agruparPorBlocoChave(entradas);
  const blocosSaida = agruparPorBlocoChave(saidas);
  const mostrarEntradas = tipoTransacao === 'todos' || tipoTransacao === 'entrada';
  const mostrarSaidas = tipoTransacao === 'todos' || tipoTransacao === 'saida';

  const selectClasses =
    selectClassName ||
    (layout === 'stacked'
      ? 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100'
      : 'min-w-[12rem] max-w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100');

  const select = (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={selectClasses}
    >
      <option value={FILTRO_TIPO_TODAS}>Todos os tipos</option>
      <option value={FILTRO_TIPO_PENDENTE}>Sem categoria (pendente)</option>
      {mostrarEntradas &&
        blocosEntrada.map(({ blocoTemplateKey, blocoTitulo, linhas }) => (
          <optgroup key={`entrada-${blocoTemplateKey}`} label={`Entradas · ${blocoTitulo}`}>
            <option value={encodeCategoriaControleBloco('entrada', blocoTemplateKey)}>
              Bloco inteiro — {blocoTitulo}
            </option>
            {linhas.map((c) => (
              <option key={`entrada-${c.templateKey}`} value={encodeCategoriaControleValue('entrada', c.templateKey)}>
                {c.label}
              </option>
            ))}
          </optgroup>
        ))}
      {mostrarSaidas &&
        blocosSaida.map(({ blocoTemplateKey, blocoTitulo, linhas }) => (
          <optgroup key={`saida-${blocoTemplateKey}`} label={`Saídas · ${blocoTitulo}`}>
            <option value={encodeCategoriaControleBloco('saida', blocoTemplateKey)}>
              Bloco inteiro — {blocoTitulo}
            </option>
            {linhas.map((c) => (
              <option key={`saida-${c.templateKey}`} value={encodeCategoriaControleValue('saida', c.templateKey)}>
                {c.label}
              </option>
            ))}
          </optgroup>
        ))}
    </select>
  );

  if (layout === 'stacked') {
    return (
      <div>
        <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
          {label}
        </label>
        {select}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={id} className="text-xs font-medium text-slate-500">
        {label}:
      </label>
      {select}
    </div>
  );
}

/** Reseta filtro se incompatível com o tipo de transação selecionado. */
export function filtroCategoriaCompativelComTipo(
  filtro: string,
  tipo: 'todos' | 'entrada' | 'saida',
): boolean {
  if (!filtro || filtro === FILTRO_TIPO_TODAS || filtro === FILTRO_TIPO_PENDENTE) return true;
  if (tipo === 'todos') return true;
  return filtro.startsWith(`${tipo}::`);
}
