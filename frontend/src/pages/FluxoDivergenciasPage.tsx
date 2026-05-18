import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Topbar } from '../app/Topbar';
import { ApiErrorPanel } from '../components/ui/ApiErrorPanel';
import { useMonthYear } from '../context/MonthYearContext';
import { getFluxoOperacionalDivergencias, type FluxoDivergenciasResponse } from '../services/backendApi';

export function FluxoDivergenciasPage() {
  const { monthYear } = useMonthYear();
  const [data, setData] = useState<FluxoDivergenciasResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const r = await getFluxoOperacionalDivergencias(monthYear.mes, monthYear.ano);
        if (!cancelled) setData(r);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [monthYear.mes, monthYear.ano]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Topbar
        title="Divergências: sistema × planilha"
        subtitle={`Comparativo para ${monthYear.mes}/${monthYear.ano}. Use o mês no topo do painel. Corrija no fluxo operacional; a planilha Google é só referência durante a migração.`}
      />
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        Operação diária:{' '}
        <Link to="/fluxo-caixa" className="font-medium text-indigo-700 hover:underline dark:text-indigo-400">
          Fluxo de caixa
        </Link>
        . Validação com o banco:{' '}
        <Link to="/validacao-pagamentos-diaria" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
          Validação de pagamentos
        </Link>
        .
      </p>

      {error && (
        <div className="mt-4">
          <ApiErrorPanel message="Não foi possível carregar divergências." technical={error} />
        </div>
      )}

      {loading && <p className="mt-6 text-sm text-slate-500">Carregando…</p>}

      {data && !loading && (
        <div className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs font-medium text-slate-500">Alunos no sistema</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{data.alunos.totalBanco}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs font-medium text-slate-500">Alunos na planilha</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {data.planilhaHabilitada ? data.alunos.totalPlanilha : '—'}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs font-medium text-slate-500">Pagamentos (competência)</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{data.pagamentos.totalBanco}</p>
              <p className="text-xs text-slate-500">planilha: {data.pagamentos.totalPlanilha}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs font-medium text-slate-500">Delta pagamentos</p>
              <p
                className={`mt-1 text-2xl font-semibold ${
                  data.pagamentos.delta === 0 ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {data.pagamentos.delta > 0 ? '+' : ''}
                {data.pagamentos.delta}
              </p>
            </div>
          </div>

          {data.errosPlanilha.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-semibold">Avisos ao ler a planilha</p>
              <ul className="mt-1 list-disc pl-5">
                {data.errosPlanilha.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          <DivergenciaTabela titulo="Só no sistema (cadastre na planilha ou ignore se descontinuado)" itens={data.alunos.soNoBanco} />
          <DivergenciaTabela titulo="Só na planilha (migrar ou cadastrar no fluxo)" itens={data.alunos.soNaPlanilha} />
        </div>
      )}
    </div>
  );
}

function DivergenciaTabela({
  titulo,
  itens,
}: {
  titulo: string;
  itens: FluxoDivergenciasResponse['alunos']['soNoBanco'];
}) {
  if (itens.length === 0) {
    return (
      <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/50">
        {titulo}: nenhum registro listado (limite 200 por lista).
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto dark:border-slate-700 dark:bg-slate-900">
      <h2 className="px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100">{titulo}</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-t border-slate-100 text-left text-slate-500 dark:border-slate-700">
            <th className="px-4 py-2">Aba</th>
            <th className="px-4 py-2">Modalidade</th>
            <th className="px-4 py-2">Linha</th>
            <th className="px-4 py-2">Aluno</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((r) => (
            <tr key={`${r.origem}-${r.aba}-${r.linha}-${r.aluno}`} className="border-t border-slate-50 dark:border-slate-800">
              <td className="px-4 py-2">{r.aba}</td>
              <td className="px-4 py-2">{r.modalidade}</td>
              <td className="px-4 py-2">{r.linha || '—'}</td>
              <td className="px-4 py-2 font-medium">{r.aluno}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
