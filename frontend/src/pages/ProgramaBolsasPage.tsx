import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Topbar } from '../app/Topbar';
import { EmptyState, ErrorPanel } from '../components/finance/StateBlocks';
import { getProgramaBolsas, type ProgramaBolsaItem } from '../services/backendApi';

function formatValor(v: number | null): string {
  if (v == null) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function ItemRow({ item }: { item: ProgramaBolsaItem }) {
  return (
    <li className="border-b border-slate-200/80 py-3 last:border-0 dark:border-slate-700/80">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="font-medium text-slate-900 dark:text-slate-50">{item.alunoNome}</p>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
            Modalidade: {item.modalidadeOriginal || '—'}
          </p>
        </div>
        <span
          className="shrink-0 rounded-md bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-950/50 dark:text-sky-200"
          title="Participante do Programa de Bolsas"
        >
          Bolsa{item.plano ? ` · ${item.plano}` : ''}
        </span>
      </div>
      <dl className="mt-2 grid gap-1 text-sm text-slate-600 dark:text-slate-400 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">Valor ref.</dt>
          <dd>{formatValor(item.valorReferencia)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">Vencimento</dt>
          <dd>{item.venc || '—'}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">Responsáveis</dt>
          <dd>{item.responsaveis || '—'}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">WhatsApp</dt>
          <dd>{item.wpp || '—'}</dd>
        </div>
      </dl>
    </li>
  );
}

export function ProgramaBolsasPage() {
  const [busca, setBusca] = useState('');
  const query = useQuery({
    queryKey: ['programa-bolsas'],
    queryFn: getProgramaBolsas,
  });

  const filtrados = useMemo(() => {
    const itens = query.data?.itens ?? [];
    const q = busca.trim().toLowerCase();
    if (!q) return itens;
    return itens.filter((item) => {
      const hay = [
        item.alunoNome,
        item.modalidadeOriginal,
        item.plano,
        item.observacoes,
        item.responsaveis,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [query.data?.itens, busca]);

  return (
    <div className="min-h-full">
      <Topbar title="Programa de Bolsas" />
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <header className="mb-6">
          <p className="text-xs font-medium uppercase tracking-wide text-sky-700 dark:text-sky-300">
            Ligado à BYLA DANÇA
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Programa de Bolsas
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
            Visão do programa — não é uma turma nova. As pessoas já estão nas modalidades da BYLA DANÇA;
            aqui você vê quem tem bolsa e em qual modalidade (observações da planilha).
          </p>
          <p className="mt-3">
            <Link
              to="/fluxo-caixa"
              className="text-sm font-medium text-sky-700 underline-offset-2 hover:underline dark:text-sky-300"
            >
              Abrir Fluxo · BYLA DANÇA
            </Link>
          </p>
        </header>

        <div className="mb-4">
          <label className="sr-only" htmlFor="busca-bolsas">
            Buscar por nome ou modalidade
          </label>
          <input
            id="busca-bolsas"
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou modalidade…"
            className="w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none ring-sky-500/30 focus:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
          />
        </div>

        {query.isLoading ? (
          <p className="text-sm text-slate-500">Carregando lista do programa…</p>
        ) : query.isError ? (
          <ErrorPanel
            message={
              query.error instanceof Error
                ? `Não foi possível carregar o Programa de Bolsas: ${query.error.message}`
                : 'Não foi possível carregar o Programa de Bolsas.'
            }
          />
        ) : filtrados.length === 0 ? (
          <EmptyState
            message={
              busca
                ? 'Ninguém encontrado com essa busca. Tente outro nome ou limpe a busca.'
                : 'Nenhuma pessoa no Programa de Bolsas. Confira se o bloco PROGRAMA DE BOLSAS está na planilha BYLA DANÇA.'
            }
          />
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white px-4 dark:border-slate-700 dark:bg-slate-950/40">
            <p className="border-b border-slate-100 py-3 text-sm text-slate-500 dark:border-slate-800">
              {filtrados.length}{' '}
              {filtrados.length === 1 ? 'pessoa' : 'pessoas'}
              {busca ? ' (filtrado)' : ''}
            </p>
            <ul>
              {filtrados.map((item) => (
                <ItemRow key={`${item.alunoNome}\0${item.modalidadeOriginal ?? ''}`} item={item} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
