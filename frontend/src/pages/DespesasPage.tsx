import { useMemo } from 'react';
import { Topbar } from '../app/Topbar';
import { useMonthYear } from '../context/MonthYearContext';
import { KpiCard } from '../components/ui/KpiCard';
import { useResumoMensal } from '../hooks/useResumoMensal';
import { useSaidas } from '../hooks/useSaidas';
import { useFluxoCompleto } from '../hooks/useFluxoCompleto';

/** Linhas da planilha que são totais gerais (ex.: Entrada total, Saída total, Lucro total). */
function isLinhaTotalGeral(label: string): boolean {
  const u = label.toUpperCase();
  return (
    u.includes('ENTRADA TOTAL') ||
    u.includes('SAÍDA TOTAL') ||
    u.includes('SAIDA TOTAL') ||
    u.includes('LUCRO') || // trata qualquer linha com "LUCRO" como total/resumo
    u.includes('RESULTADO') ||
    u === 'TOTAL'
  );
}

/** Define se um cabeçalho de coluna da planilha representa um bloco de SAÍDAS. */
function tituloBlocoSaida(cabecalho: string): string | null {
  const u = cabecalho.toUpperCase().trim();
  if (!u) return null;
  if (u.includes('TOTAL SAÍDAS') || u.includes('TOTAL SAIDAS')) return 'Total Saídas (Parceiros)';
  if (u.includes('GASTOS FIXOS')) return 'Gastos Fixos';
  if (u.includes('SAÍDAS ALUGUEL') || u.includes('SAIDAS ALUGUEL')) return 'Saídas Aluguel';
  if (u.includes('SAÍDAS') || u.includes('SAIDAS') || u.includes('DESPESAS')) return cabecalho.trim() || 'Saídas';
  return null;
}

export function DespesasPage() {
  const { monthYear } = useMonthYear();
  const { resumoMensal } = useResumoMensal();
  const { rows: saidas, isLoading, error } = useSaidas();
  const {
    porColuna: planilhaPorColuna,
    isLoading: planilhaLoading,
  } = useFluxoCompleto(monthYear.mes, monthYear.ano);

  const mesLabel = `${String(monthYear.mes).padStart(2, '0')}/${String(monthYear.ano).slice(-2)}`;

  const rowMes = resumoMensal.find((r) => r.mes === monthYear.mes && r.ano === monthYear.ano) ?? null;
  const totalSaidasOficial = rowMes?.total_saidas ?? 0;

  const blocosSaidasPlanilha = useMemo(() => {
    const out: { titulo: string; linhas: { label: string; valor: string; valorNum?: number }[] }[] = [];

    for (const col of planilhaPorColuna ?? []) {
      if (!col || col.length === 0) continue;

      let blocoAtual: { titulo: string; linhas: { label: string; valor: string; valorNum?: number }[] } | null = null;

      const flush = () => {
        if (blocoAtual && blocoAtual.linhas.length > 0) {
          out.push(blocoAtual);
        }
        blocoAtual = null;
      };

      for (const linha of col) {
        const label = (linha.label ?? '').trim();
        if (!label) continue;

        // Se for um cabeçalho de bloco de saída (TOTAL SAÍDAS, GASTOS FIXOS, SAÍDAS ALUGUEL...), inicia novo bloco
        const titulo = tituloBlocoSaida(label);
        if (titulo) {
          flush();
          blocoAtual = { titulo, linhas: [] };
          continue;
        }

        // Se ainda não estamos em um bloco de SAÍDAS, ignorar (pode ser coluna de entradas)
        if (!blocoAtual) continue;

        // Ignorar linhas de totais gerais e linhas negativas (como lucros/resultados)
        if (isLinhaTotalGeral(label)) continue;
        if (linha.valorNum == null || linha.valorNum < 0) continue;

        blocoAtual.linhas.push(linha);
      }

      flush();
    }

    return out;
  }, [planilhaPorColuna]);

  const saidasPlanilha = useMemo(
    () => blocosSaidasPlanilha.flatMap((b) => b.linhas),
    [blocosSaidasPlanilha]
  );

  const totalSaidasPlanilha = useMemo(
    () => saidasPlanilha.reduce((acc, l) => acc + (l.valorNum ?? 0), 0),
    [saidasPlanilha]
  );

  const totalFuncionariosPlanilha = useMemo(() => {
    let total = 0;
    for (const bloco of blocosSaidasPlanilha) {
      for (const l of bloco.linhas) {
        const u = (l.label ?? '').toUpperCase();
        if (u.includes('FUNCION')) {
          total += l.valorNum ?? 0;
        }
      }
    }
    return total;
  }, [blocosSaidasPlanilha]);

  return (
    <div className="p-6 space-y-8">
      <Topbar
        title="Despesas do BYLA"
        subtitle={`Visão das saídas por funcionário, categoria e centro de custo – mês ${mesLabel}.`}
      />

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800">
          Não foi possível carregar as despesas. {error}
        </div>
      )}

      <section className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-slate-900">Resumo de saídas do mês</h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Visão geral das saídas oficiais (Supabase) e das saídas registradas na planilha CONTROLE DE CAIXA.
          </p>
        </div>
        <div className="p-4 grid gap-4 md:grid-cols-3">
          <KpiCard
            label={`Saídas oficiais (Supabase) – ${mesLabel}`}
            value={totalSaidasOficial.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
            accentColor="danger"
            isLoading={isLoading}
          />
          <KpiCard
            label="Saídas registradas na planilha (Controle de Caixa)"
            value={totalSaidasPlanilha.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
            accentColor="primary"
            isLoading={planilhaLoading}
          />
          <KpiCard
            label="Funcionários (planilha – linha 'Funcionários')"
            value={totalFuncionariosPlanilha.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
            accentColor="secondary"
            isLoading={planilhaLoading}
          />
        </div>
      </section>

      {saidas.length > 0 && (
        <section className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
          <div className="bg-rose-50 border-b border-rose-100 px-4 py-3">
            <h2 className="text-lg font-semibold text-rose-900">Saídas oficiais do mês (Supabase)</h2>
            <p className="text-sm text-rose-800 mt-0.5">
              Lista de saídas (transações tipo <code>saida</code>) já com EA, Blead e repasses externos filtrados.
            </p>
          </div>
          <div className="p-4 border-t border-slate-200 max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-rose-50 sticky top-0">
                <tr>
                  <th className="text-left py-2.5 px-3 font-medium text-rose-900">Data</th>
                  <th className="text-left py-2.5 px-3 font-medium text-rose-900">Pessoa</th>
                  <th className="text-right py-2.5 px-3 font-medium text-rose-900">Valor</th>
                  <th className="text-left py-2.5 px-3 font-medium text-rose-900">Descrição</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={4} className="py-4 px-3 text-center text-slate-500">
                      Carregando saídas…
                    </td>
                  </tr>
                ) : saidas.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 px-3 text-center text-slate-500">
                      Nenhuma saída registrada para este mês.
                    </td>
                  </tr>
                ) : (
                  saidas.slice(0, 200).map((r) => (
                    <tr key={r.id} className="border-t border-slate-200 hover:bg-rose-50/40">
                      <td className="py-2.5 px-3 text-slate-800">{r.data}</td>
                      <td className="py-2.5 px-3 text-slate-900">{r.pessoa}</td>
                      <td className="py-2.5 px-3 text-right font-medium text-rose-900 tabular-nums">
                        {r.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">{r.descricao ?? '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Seção de despesas por funcionário (planilha) deixada em branco por enquanto, para ser trabalhada depois. */}

      {saidasPlanilha.length > 0 && (
        <section className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
          <div className="bg-amber-50 border-b border-amber-100 px-4 py-3">
            <h2 className="text-lg font-semibold text-amber-900">Saídas pela planilha CONTROLE DE CAIXA</h2>
            <p className="text-sm text-amber-800 mt-0.5">
              Saídas (despesas) lidas diretamente da planilha CONTROLE DE CAIXA para o mês {mesLabel}, separadas por bloco (Total Saídas, Gastos Fixos, Saídas Aluguel…).
            </p>
          </div>
          <div className="p-4 border-t border-slate-200 max-h-80 overflow-y-auto">
            {blocosSaidasPlanilha.map((b, idx) => (
              <div key={idx} className="mb-4 last:mb-0 bg-white rounded-lg border border-amber-200 overflow-hidden">
                <div className="bg-amber-100 px-3 py-2 border-b border-amber-200">
                  <span className="text-sm font-semibold text-amber-900">{b.titulo}</span>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-amber-50 sticky top-0">
                    <tr>
                      <th className="text-left py-2.5 px-3 font-medium text-amber-900">Categoria / Descrição</th>
                      <th className="text-right py-2.5 px-3 font-medium text-amber-900">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.linhas.map((l, i) => (
                      <tr key={i} className="border-t border-amber-100 hover:bg-amber-50/50">
                        <td className="py-2.5 px-3 text-slate-900">{l.label}</td>
                        <td className="py-2.5 px-3 text-right font-medium text-slate-900 tabular-nums">
                          {l.valorNum != null
                            ? l.valorNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                            : l.valor ?? '–'}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-amber-200 bg-amber-50/80">
                      <td className="py-2.5 px-3 text-amber-900 font-semibold">
                        Total {b.titulo}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-amber-900 tabular-nums">
                        {b.linhas
                          .reduce((acc, l) => acc + (l.valorNum ?? 0), 0)
                          .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
            {planilhaLoading && (
              <p className="px-3 py-2 text-xs text-slate-500">Carregando dados da planilha CONTROLE DE CAIXA…</p>
            )}
          </div>
        </section>
      )}

    </div>
  );
}
