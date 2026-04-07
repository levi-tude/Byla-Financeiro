import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Topbar } from '../app/Topbar';
import { KpiCard } from '../components/ui/KpiCard';
import { PieChartFormaPagamento } from '../components/charts/PieChartFormaPagamento';
import { CategoriasBancoDrillModal, type CategoriasGrupo } from '../components/CategoriasBancoDrillModal';
import { useEntradas } from '../hooks/useEntradas';
import { useMonthYear } from '../context/MonthYearContext';
import { getCategoriasBancoResumo } from '../services/backendApi';

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatDate(s: string): string {
  if (!s) return '–';
  return new Date(s).toLocaleDateString('pt-BR');
}

function firstDay(mes: number, ano: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}-01`;
}
function lastDay(mes: number, ano: number): string {
  const d = new Date(ano, mes, 0);
  return `${ano}-${String(mes).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function EntradasPage() {
  const { monthYear } = useMonthYear();
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const filtro = useMemo(() => ({ dataInicio: dataInicio || undefined, dataFim: dataFim || undefined }), [dataInicio, dataFim]);
  const { rows, isLoading, error } = useEntradas(filtro);
  const [filtroPessoa, setFiltroPessoa] = useState('');
  const [drillOpen, setDrillOpen] = useState(false);
  const [drillGrupo, setDrillGrupo] = useState<CategoriasGrupo>('modalidade');
  const [drillChave, setDrillChave] = useState<string | null>(null);
  const [drillTitulo, setDrillTitulo] = useState('');

  const resumoEntradaBanco = useQuery({
    queryKey: ['categorias-banco-resumo', 'entrada', monthYear.mes, monthYear.ano],
    queryFn: () => getCategoriasBancoResumo(monthYear.mes, monthYear.ano, 'entrada'),
  });

  const aplicarMesSelecionado = useCallback(() => {
    setDataInicio(firstDay(monthYear.mes, monthYear.ano));
    setDataFim(lastDay(monthYear.mes, monthYear.ano));
  }, [monthYear.mes, monthYear.ano]);
  const aplicarMesAnterior = useCallback(() => {
    const prev = monthYear.mes <= 1 ? { mes: 12, ano: monthYear.ano - 1 } : { mes: monthYear.mes - 1, ano: monthYear.ano };
    setDataInicio(firstDay(prev.mes, prev.ano));
    setDataFim(lastDay(prev.mes, prev.ano));
  }, [monthYear.mes, monthYear.ano]);

  // Sincronizar período com o mês selecionado no topo (ao mudar o mês, atualiza as datas)
  useEffect(() => {
    setDataInicio(firstDay(monthYear.mes, monthYear.ano));
    setDataFim(lastDay(monthYear.mes, monthYear.ano));
  }, [monthYear.mes, monthYear.ano]);

  const rowsFiltradas = useMemo(() => {
    const q = filtroPessoa.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => (r.pessoa || '').toLowerCase().includes(q));
  }, [rows, filtroPessoa]);

  const totalEntradas = rows.reduce((s, r) => s + r.valor, 0);
  const ticketMedio = rows.length > 0 ? totalEntradas / rows.length : 0;

  const porFormaPagamento = useMemo(() => {
    const normalize = (s: string): string => {
      const t = (s || '').trim().toUpperCase();
      if (!t) return 'Outros';
      if (t.includes('PIX')) return 'PIX';
      if (t.includes('DÉBITO') || t.includes('DEBITO')) return 'Débito';
      if (t.includes('CRÉDITO') || t.includes('CREDITO')) return 'Crédito';
      if (t.includes('TED') || t.includes('DOC')) return 'TED/DOC';
      if (t.includes('DINHEIRO') || t.includes('ESPÉCIE')) return 'Dinheiro';
      if (t.includes('BOLETO')) return 'Boleto';
      if (t.includes('TRANSFERÊNCIA') || t.includes('TRANSFERENCIA')) return 'Transferência';
      return t.length > 25 ? t.slice(0, 22) + '…' : t;
    };
    const map: Record<string, number> = {};
    for (const r of rows) {
      const key = normalize(r.forma_pagamento_banco || '');
      map[key] = (map[key] || 0) + r.valor;
    }
    const sorted = Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    const topN = 8;
    if (sorted.length <= topN) return sorted;
    const top = sorted.slice(0, topN);
    const outros = sorted.slice(topN).reduce((s, x) => s + x.value, 0);
    return [...top, { name: 'Outros', value: outros }];
  }, [rows]);

  const abrirDrill = (grupo: CategoriasGrupo, nome: string, titulo: string) => {
    setDrillGrupo(grupo);
    setDrillChave(nome);
    setDrillTitulo(titulo);
    setDrillOpen(true);
  };

  return (
    <div className="p-6">
      <CategoriasBancoDrillModal
        open={drillOpen}
        onClose={() => {
          setDrillOpen(false);
          setDrillChave(null);
        }}
        mes={monthYear.mes}
        ano={monthYear.ano}
        tipo="entrada"
        grupo={drillGrupo}
        chave={drillChave}
        tituloGrupo={drillTitulo}
      />

      <Topbar title="Entradas – detalhe" subtitle="Fluxo por período e forma de pagamento" />
      {error && (
        <div className="mb-4 p-4 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-800">Não foi possível carregar os dados.</div>
      )}
      <div className="flex flex-wrap gap-2 mt-4 items-center">
        <button type="button" onClick={aplicarMesSelecionado} className="rounded border border-indigo-600 bg-indigo-50 text-indigo-700 px-3 py-1.5 text-sm font-medium hover:bg-indigo-100">
          Mês selecionado (topo)
        </button>
        <button type="button" onClick={aplicarMesAnterior} className="rounded border border-gray-400 bg-gray-50 text-gray-700 px-3 py-1.5 text-sm font-medium hover:bg-gray-100">
          Mês anterior
        </button>
        <span className="text-gray-500 text-sm">ou</span>
        <input type="date" className="rounded border border-gray-300 px-2 py-1 text-sm" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} aria-label="Data início" />
        <input type="date" className="rounded border border-gray-300 px-2 py-1 text-sm" value={dataFim} onChange={(e) => setDataFim(e.target.value)} aria-label="Data fim" />
        <input
          type="search"
          placeholder="Filtrar por pessoa ou descrição…"
          value={filtroPessoa}
          onChange={(e) => setFiltroPessoa(e.target.value)}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm min-w-[200px]"
          aria-label="Filtrar por pessoa"
        />
      </div>
      <div className="grid gap-4 md:grid-cols-3 mt-4">
        <KpiCard label="Total (período)" value={formatCurrency(totalEntradas)} accentColor="primary" isLoading={isLoading} />
        <KpiCard label="Nº transações" value={String(rows.length)} accentColor="primary" isLoading={isLoading} />
        <KpiCard label="Ticket médio" value={formatCurrency(ticketMedio)} accentColor="primary" isLoading={isLoading} />
      </div>
      <div className="mt-6 bg-white rounded-xl shadow-sm p-4">
        <h2 className="text-sm font-medium text-gray-700 mb-2">Entradas por forma de pagamento</h2>
        <PieChartFormaPagamento data={porFormaPagamento} isLoading={isLoading} />
      </div>

      <div className="mt-6 bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
        <div className="bg-emerald-50 border-b border-emerald-100 px-4 py-3">
          <h2 className="text-base font-semibold text-emerald-950">Categorização no banco (oficial)</h2>
          <p className="text-sm text-emerald-900 mt-0.5">
            Agregado pelo mês selecionado no topo (calendário global), independente do intervalo de datas abaixo. Clique para ver o detalhe.
          </p>
        </div>
        <div className="p-4 grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-800 mb-2">Por modalidade</h3>
            {resumoEntradaBanco.isLoading ? (
              <p className="text-sm text-slate-500">Carregando…</p>
            ) : resumoEntradaBanco.error ? (
              <p className="text-sm text-rose-700">
                {resumoEntradaBanco.error instanceof Error ? resumoEntradaBanco.error.message : 'Erro ao carregar.'}
              </p>
            ) : (resumoEntradaBanco.data?.por_modalidade ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">Sem modalidades no mês.</p>
            ) : (
              <ul className="space-y-1.5 max-h-64 overflow-y-auto">
                {(resumoEntradaBanco.data?.por_modalidade ?? []).map((b) => (
                  <li key={b.nome}>
                    <button
                      type="button"
                      onClick={() => abrirDrill('modalidade', b.nome, 'Por modalidade')}
                      className="w-full flex justify-between gap-2 text-left rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-emerald-50/80 transition-colors"
                    >
                      <span className="text-slate-900 font-medium truncate">{b.nome}</span>
                      <span className="text-slate-700 tabular-nums shrink-0">
                        {b.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}{' '}
                        <span className="text-slate-400 font-normal">({b.qtd})</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800 mb-2">Por categoria</h3>
            {resumoEntradaBanco.isLoading ? (
              <p className="text-sm text-slate-500">Carregando…</p>
            ) : resumoEntradaBanco.error ? (
              <p className="text-sm text-rose-700">
                {resumoEntradaBanco.error instanceof Error ? resumoEntradaBanco.error.message : 'Erro ao carregar.'}
              </p>
            ) : (resumoEntradaBanco.data?.por_categoria ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">Sem categorias no mês.</p>
            ) : (
              <ul className="space-y-1.5 max-h-64 overflow-y-auto">
                {(resumoEntradaBanco.data?.por_categoria ?? []).map((b) => (
                  <li key={b.nome}>
                    <button
                      type="button"
                      onClick={() => abrirDrill('categoria', b.nome, 'Por categoria')}
                      className="w-full flex justify-between gap-2 text-left rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-emerald-50/80 transition-colors"
                    >
                      <span className="text-slate-900 font-medium truncate">{b.nome}</span>
                      <span className="text-slate-700 tabular-nums shrink-0">
                        {b.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}{' '}
                        <span className="text-slate-400 font-normal">({b.qtd})</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 bg-white rounded-xl shadow-sm p-4 overflow-hidden flex flex-col">
        <h2 className="text-sm font-medium text-gray-700 mb-2">Últimas entradas</h2>
        <div className="overflow-x-auto overflow-y-auto max-h-[400px] min-h-0">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : rowsFiltradas.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">{rows.length === 0 ? 'Nenhum registro.' : 'Nenhum resultado para o filtro.'}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500 font-medium">
                <th className="pb-2 pr-2">Data</th>
                <th className="pb-2 pr-2">Pessoa</th>
                <th className="pb-2 pr-2 text-right">Valor</th>
                <th className="pb-2">Forma pag.</th>
              </tr>
            </thead>
            <tbody>
              {rowsFiltradas.slice(0, 150).map((r) => (
                <tr key={r.id_unico || r.id} className="border-b border-gray-100">
                  <td className="py-2 pr-2">{formatDate(r.data)}</td>
                  <td className="py-2 pr-2">{r.pessoa || '–'}</td>
                  <td className="py-2 pr-2 text-right">{formatCurrency(r.valor)}</td>
                  <td className="py-2">{r.forma_pagamento_banco || '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        </div>
      </div>
    </div>
  );
}
