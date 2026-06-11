import { useEffect, useRef, useState } from 'react';
import {
  agruparPorBlocoChave,
  FILTRO_TIPO_PENDENTE,
  type CategoriaOpcao,
} from './utils';
import {
  encodeCategoriaControleBloco,
  encodeCategoriaControleValue,
} from './FiltroCategoriaControleSelect';

export type CategoriasFiltroModo = 'incluir' | 'excluir';

/** Resolve o rótulo legível de um valor de filtro (`_pendente`, `entrada::key`, `saida::bloco:key`). */
export function labelCategoriaFiltro(
  valor: string,
  entradas: CategoriaOpcao[],
  saidas: CategoriaOpcao[],
): string {
  if (valor === FILTRO_TIPO_PENDENTE) return 'Sem categoria (pendente)';
  const match = valor.match(/^(entrada|saida)::(.+)$/);
  if (!match) return valor;
  const familia = match[1] as 'entrada' | 'saida';
  const rest = match[2];
  const cats = familia === 'entrada' ? entradas : saidas;
  if (rest.startsWith('bloco:')) {
    const blocoKey = rest.slice('bloco:'.length);
    const bloco = agruparPorBlocoChave(cats).find((b) => b.blocoTemplateKey === blocoKey);
    return bloco ? `Bloco — ${bloco.blocoTitulo}` : rest;
  }
  return cats.find((c) => c.templateKey === rest)?.label ?? rest;
}

/** Remove valores incompatíveis com o tipo de transação selecionado. */
export function categoriasCompativeisComTipo(
  valores: string[],
  tipo: 'todos' | 'entrada' | 'saida',
): string[] {
  if (tipo === 'todos') return valores;
  return valores.filter((v) => v === FILTRO_TIPO_PENDENTE || v.startsWith(`${tipo}::`));
}

function CheckboxLinha({
  checked,
  onToggle,
  children,
  destaque = false,
}: {
  checked: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  destaque?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 ${
        destaque ? 'font-medium text-slate-800 dark:text-slate-200' : 'text-slate-700 dark:text-slate-300'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
      />
      <span className="min-w-0 truncate">{children}</span>
    </label>
  );
}

export function FiltroCategoriasMulti({
  selecionadas,
  modo,
  onChange,
  entradas,
  saidas,
  tipoTransacao = 'todos',
}: {
  selecionadas: string[];
  modo: CategoriasFiltroModo;
  onChange: (selecionadas: string[], modo: CategoriasFiltroModo) => void;
  entradas: CategoriaOpcao[];
  saidas: CategoriaOpcao[];
  tipoTransacao?: 'todos' | 'entrada' | 'saida';
}) {
  const [aberto, setAberto] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setAberto(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [aberto]);

  const toggleValor = (valor: string) => {
    const nova = selecionadas.includes(valor)
      ? selecionadas.filter((v) => v !== valor)
      : [...selecionadas, valor];
    onChange(nova, modo);
  };

  const blocosEntrada = agruparPorBlocoChave(entradas);
  const blocosSaida = agruparPorBlocoChave(saidas);
  const mostrarEntradas = tipoTransacao === 'todos' || tipoTransacao === 'entrada';
  const mostrarSaidas = tipoTransacao === 'todos' || tipoTransacao === 'saida';

  const modoBtn = (m: CategoriasFiltroModo, label: string) => (
    <button
      type="button"
      onClick={() => onChange(selecionadas, m)}
      className={`rounded-md px-2 py-1 text-xs font-medium ${
        modo === m
          ? m === 'excluir'
            ? 'bg-rose-600 text-white'
            : 'bg-indigo-600 text-white'
          : 'border border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800'
      }`}
    >
      {label}
    </button>
  );

  const renderBlocos = (
    familia: 'entrada' | 'saida',
    blocos: ReturnType<typeof agruparPorBlocoChave>,
    tituloFamilia: string,
  ) =>
    blocos.map(({ blocoTemplateKey, blocoTitulo, linhas }) => {
      const valorBloco = encodeCategoriaControleBloco(familia, blocoTemplateKey);
      return (
        <div key={`${familia}-${blocoTemplateKey}`} className="mt-2">
          <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {tituloFamilia} · {blocoTitulo}
          </p>
          <CheckboxLinha
            checked={selecionadas.includes(valorBloco)}
            onToggle={() => toggleValor(valorBloco)}
            destaque
          >
            Bloco inteiro — {blocoTitulo}
          </CheckboxLinha>
          {linhas.map((c) => {
            const valor = encodeCategoriaControleValue(familia, c.templateKey);
            return (
              <CheckboxLinha
                key={valor}
                checked={selecionadas.includes(valor)}
                onToggle={() => toggleValor(valor)}
              >
                {c.label}
              </CheckboxLinha>
            );
          })}
        </div>
      );
    });

  return (
    <div ref={rootRef} className="relative">
      <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Categorias</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {modoBtn('incluir', 'Incluir só estas')}
        {modoBtn('excluir', 'Excluir estas')}
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
          aria-expanded={aberto}
        >
          {selecionadas.length === 0
            ? 'Selecionar categorias…'
            : `${selecionadas.length} selecionada(s)`}
          <span className="ml-1 text-xs text-slate-400">▾</span>
        </button>
        {selecionadas.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([], modo)}
            className="text-xs text-slate-500 underline hover:text-slate-700 dark:hover:text-slate-300"
          >
            Limpar
          </button>
        )}
      </div>

      {selecionadas.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {selecionadas.map((valor) => (
            <span
              key={valor}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                modo === 'excluir'
                  ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200'
                  : 'border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-200'
              }`}
            >
              {modo === 'excluir' ? 'Excluir: ' : ''}
              {labelCategoriaFiltro(valor, entradas, saidas)}
              <button
                type="button"
                onClick={() => toggleValor(valor)}
                className="font-semibold hover:opacity-70"
                aria-label={`Remover ${labelCategoriaFiltro(valor, entradas, saidas)}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {aberto && (
        <div className="absolute left-0 top-full z-30 mt-1 max-h-80 w-80 max-w-[90vw] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <CheckboxLinha
            checked={selecionadas.includes(FILTRO_TIPO_PENDENTE)}
            onToggle={() => toggleValor(FILTRO_TIPO_PENDENTE)}
            destaque
          >
            Sem categoria (pendente)
          </CheckboxLinha>
          {mostrarEntradas && renderBlocos('entrada', blocosEntrada, 'Entradas')}
          {mostrarSaidas && renderBlocos('saida', blocosSaida, 'Saídas')}
          {!mostrarEntradas && blocosSaida.length === 0 && mostrarSaidas && (
            <p className="px-2 py-1 text-xs text-slate-500">Nenhuma categoria disponível.</p>
          )}
        </div>
      )}
    </div>
  );
}
