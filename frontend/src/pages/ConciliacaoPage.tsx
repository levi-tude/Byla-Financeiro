import { useState, useMemo } from 'react';
import { Topbar } from '../app/Topbar';
import { KpiCard } from '../components/ui/KpiCard';
import { useConciliacao } from '../hooks/useConciliacao';
import { useMonthYear } from '../context/MonthYearContext';
import type { ReconciliacaoFiltro } from '../services/conciliacao';

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatDate(s: string): string {
  if (!s) return '–';
  return new Date(s).toLocaleDateString('pt-BR');
}

export function ConciliacaoPage() {
  const { monthYear } = useMonthYear();
  const [filtro, setFiltro] = useState<ReconciliacaoFiltro>({ status: 'todos' });
  const filtroComMes = useMemo<ReconciliacaoFiltro>(
    () => ({ ...filtro, mes: monthYear.mes, ano: monthYear.ano }),
    [filtro, monthYear.mes, monthYear.ano]
  );
  const { rows, kpis, isLoading, error } = useConciliacao(filtroComMes);

  return (
    <div className="p-6">
      <Topbar title="Conciliação e inadimplência" subtitle={`Cadastro vs banco – mês ${monthYear.mes}/${monthYear.ano} (altere no seletor do topo)`} />
      {error && (
        <div className="mb-4 p-4 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-800">Não foi possível carregar os dados.</div>
      )}
      <div className="flex flex-wrap gap-2 mt-4">
        <select
          className="rounded border border-gray-300 px-2 py-1 text-sm"
          value={filtro.status ?? 'todos'}
          onChange={(e) => setFiltro({ ...filtro, status: e.target.value as ReconciliacaoFiltro['status'] })}
        >
          <option value="todos">Todos</option>
          <option value="pendente">Apenas pendentes</option>
          <option value="confirmado">Apenas confirmados</option>
        </select>
      </div>
      <div className="grid gap-4 md:grid-cols-3 mt-4">
        <KpiCard label="Alunos pendentes" value={String(kpis.qtdPendentes)} accentColor="danger" isLoading={isLoading} />
        <KpiCard label="Valor em aberto" value={formatCurrency(kpis.valorPendente)} accentColor="danger" isLoading={isLoading} />
        <KpiCard label="Taxa de adimplência" value={(kpis.taxaAdimplencia * 100).toFixed(1) + '%'} accentColor="success" isLoading={isLoading} />
      </div>
      <div className="mt-6 bg-white rounded-xl shadow-sm p-4 overflow-x-auto">
        <h2 className="text-sm font-medium text-gray-700 mb-2">Lista de mensalidades</h2>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">Nenhum registro encontrado.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500 font-medium">
                <th className="pb-2 pr-2">Atividade</th>
                <th className="pb-2 pr-2">Aluno</th>
                <th className="pb-2 pr-2 text-right">Valor</th>
                <th className="pb-2 pr-2">Data ref.</th>
                <th className="pb-2 pr-2">Pagador (cad.)</th>
                <th className="pb-2">Confirmado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.aluno_plano_id} className={'border-b border-gray-100' + (!r.confirmado_banco ? ' bg-rose-50/50' : '')}>
                  <td className="py-2 pr-2">{r.atividade_nome}</td>
                  <td className="py-2 pr-2">{r.aluno_nome}</td>
                  <td className="py-2 pr-2 text-right">{formatCurrency(r.valor)}</td>
                  <td className="py-2 pr-2">{formatDate(r.data_pagamento)}</td>
                  <td className="py-2 pr-2">{r.nome_pagador_cadastro || '–'}</td>
                  <td className="py-2">{r.confirmado_banco ? 'Sim' : 'Não'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
