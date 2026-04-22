import { Topbar } from '../app/Topbar';
import { ApiErrorPanel } from '../components/ui/ApiErrorPanel';
import { KpiCard } from '../components/ui/KpiCard';
import { BarChartAtividade } from '../components/charts/BarChartAtividade';
import { useAtividades } from '../hooks/useAtividades';
import { useMonthYear } from '../context/MonthYearContext';
import { useMemo } from 'react';

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

export function AtividadesPage() {
  const { monthYear } = useMonthYear();
  const { resumo, isLoading, error } = useAtividades(undefined, monthYear.mes, monthYear.ano);

  const receitaPorAtividade = useMemo(
    () => resumo.map((r) => ({ name: r.atividade_nome, value: r.total_valor })),
    [resumo]
  );
  const alunosPorAtividade = useMemo(
    () => resumo.map((r) => ({ name: r.atividade_nome, value: r.total_alunos })),
    [resumo]
  );

  const topReceita = resumo.length ? resumo.reduce((a, b) => (a.total_valor >= b.total_valor ? a : b)) : null;
  const topAlunos = resumo.length ? resumo.reduce((a, b) => (a.total_alunos >= b.total_alunos ? a : b)) : null;
  const totalReceita = resumo.reduce((s, r) => s + r.total_valor, 0);

  return (
    <div className="p-6">
      <Topbar
        title="Atividades e performance"
        subtitle={`Receita e alunos por modalidade – mês ${monthYear.mes}/${monthYear.ano}. Dados desta tela vêm do Supabase (tabela de atividades e visão de alunos por atividade).`}
      />
      {error && (
        <div className="mb-4">
          <ApiErrorPanel
            message="Não foi possível carregar os dados de atividades. Verifique a conexão e o Supabase."
            technical={error.message}
          />
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-3 mt-4">
        <KpiCard
          label="Atividade com maior receita"
          value={topReceita ? `${topReceita.atividade_nome}: ${formatCurrency(topReceita.total_valor)}` : '–'}
          accentColor="primary"
          isLoading={isLoading}
        />
        <KpiCard
          label="Atividade com mais alunos"
          value={topAlunos ? `${topAlunos.atividade_nome}: ${topAlunos.total_alunos}` : '–'}
          accentColor="primary"
          isLoading={isLoading}
        />
        <KpiCard label="Receita total (mensalidades)" value={formatCurrency(totalReceita)} accentColor="success" isLoading={isLoading} />
      </div>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="bg-white rounded-xl shadow-sm p-4">
          <BarChartAtividade data={receitaPorAtividade} isLoading={isLoading} title="Receita por atividade" valueLabel="Receita" />
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <BarChartAtividade
            data={alunosPorAtividade}
            isLoading={isLoading}
            title="Alunos por atividade"
            valueLabel="Alunos"
            formatValue={(v) => String(v)}
          />
        </div>
      </div>
      <div className="mt-6 bg-white rounded-xl shadow-sm p-4 overflow-x-auto">
        <h2 className="text-sm font-medium text-gray-700 mb-1">Resumo por atividade</h2>
        <p className="text-xs text-gray-500 mb-3">
          Fonte dos dados: Supabase (tabela <code>atividades</code> e visão <code>v_alunos_por_atividade</code>), filtrados pelo mês selecionado.
        </p>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : resumo.length === 0 ? (
          <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Nenhuma atividade com dados para <strong>{monthYear.mes}/{monthYear.ano}</strong>. Troque o mês no topo do painel ou confira se há lançamentos no Supabase.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500 font-medium">
                <th className="pb-2 pr-2">Atividade</th>
                <th className="pb-2 pr-2 text-right">Alunos</th>
                <th className="pb-2 pr-2 text-right">Mensalidades</th>
                <th className="pb-2 pr-2 text-right">Total valor</th>
                <th className="pb-2 text-right">Ticket médio</th>
              </tr>
            </thead>
            <tbody>
              {resumo.map((r) => (
                <tr key={r.atividade_id} className="border-b border-gray-100">
                  <td className="py-2 pr-2 font-medium">{r.atividade_nome}</td>
                  <td className="py-2 pr-2 text-right">{r.total_alunos}</td>
                  <td className="py-2 pr-2 text-right">{r.total_mensalidades}</td>
                  <td className="py-2 pr-2 text-right">{formatCurrency(r.total_valor)}</td>
                  <td className="py-2 text-right">
                    {r.total_alunos > 0 ? formatCurrency(r.total_valor / r.total_alunos) : '–'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
