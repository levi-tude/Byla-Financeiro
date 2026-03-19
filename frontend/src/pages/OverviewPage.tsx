import { useMemo, useState, useEffect } from 'react';
import { Topbar } from '../app/Topbar';
import { KpiCard } from '../components/ui/KpiCard';
import { MonthlyTrendChart } from '../components/charts/MonthlyTrendChart';
import { ResumoMensalTable } from '../components/ui/ResumoMensalTable';
import { MonthYearPicker } from '../components/ui/MonthYearPicker';
import { useResumoMensal } from '../hooks/useResumoMensal';
import { useMonthYear } from '../context/MonthYearContext';
import { useFluxoCompleto } from '../hooks/useFluxoCompleto';
import { useFontes } from '../hooks/useFontes';
import { getTransacoesPorMes, type TransacaoItem } from '../services/backendApi';
import type { ResumoMensalRow } from '../types/resumo';

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL ?? '').trim();

const MESES_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MESES_EXTENSO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function formatMesAno(mes: number, ano: number): string {
  return `${MESES_CURTO[mes - 1]}/${ano.toString().slice(-2)}`;
}

/** Nome da aba CONTROLE DE CAIXA para o mês selecionado (aba = mês seguinte; ex.: Março → aba ABRIL 26). */
function nomeAbaPlanilha(mes: number, ano: number): string {
  let mesAba = mes + 1;
  let anoAba = ano;
  if (mesAba > 12) {
    mesAba = 1;
    anoAba = ano + 1;
  }
  return `${MESES_EXTENSO[mesAba - 1].toUpperCase()} ${anoAba.toString().slice(-2)}`;
}

function variation(current: number | undefined, prev: number | undefined): number | undefined {
  if (current == null || prev == null || prev === 0) return undefined;
  return (current - prev) / prev;
}

function findRow(resumo: ResumoMensalRow[], mes: number, ano: number): ResumoMensalRow | null {
  return resumo.find((r) => r.mes === mes && r.ano === ano) ?? null;
}

function previousMonth(mes: number, ano: number): { mes: number; ano: number } {
  if (mes <= 1) return { mes: 12, ano: ano - 1 };
  return { mes: mes - 1, ano };
}

/** Linhas da planilha que são totais gerais (ex.: Entrada total, Saída total, Lucro total). */
function isLinhaTotalGeral(label: string): boolean {
  const u = label.toUpperCase();
  return (
    u.includes('ENTRADA TOTAL') ||
    u.includes('SAÍDA TOTAL') ||
    u.includes('SAIDA TOTAL') ||
    u.includes('LUCRO TOTAL') ||
    u.includes('RESULTADO') ||
    u === 'LUCRO' ||
    u === 'TOTAL'
  );
}

/** Classifica linha como ENTRADA (receita), SAÍDA (despesa), TOTAL (totais) ou OUTRO. */
function tipoCategoria(label: string): 'entrada' | 'saida' | 'total' | 'outro' {
  const u = label.toUpperCase();
  if (u.includes('ENTRADA TOTAL') && !u.includes('SAÍDA') && !u.includes('SAIDA')) return 'total';
  if (u.includes('SAÍDA TOTAL') || u.includes('SAIDA TOTAL')) return 'total';
  if (u.includes('LUCRO TOTAL') || u === 'LUCRO' || (u.includes('RESULTADO') && u.length < 25)) return 'total';
  if (u.includes('ENTRADA') && !u.includes('TOTAL') || u.includes('RECEITA') || u.includes('MENSALIDADE') || u.includes('PILATES') || u.includes('DANÇA') || u.includes('DANCA') || u.includes('TEATRO') || u.includes('YOGA') || u.includes('MENSALIDADE')) return 'entrada';
  if (u.includes('SAÍDA') && !u.includes('TOTAL') || u.includes('SAIDA') && !u.includes('TOTAL') || u.includes('DESPESA') || u.includes('CUSTO') || u.includes('PAGAMENTO') || u.includes('SALÁRIO') || u.includes('SALARIO') || u.includes('IMPOSTO') || u.includes('FORNECEDOR')) return 'saida';
  return 'outro';
}

/** Classifica um bloco (primeira linha = cabeçalho da coluna na planilha) como ENTRADA ou SAÍDA e retorna título. */
function classificarBlocoPorCabecalho(primeiraLinhaLabel: string): { titulo: string; tipo: 'entrada' | 'saida' } {
  const u = primeiraLinhaLabel.toUpperCase().trim().replace(/\s+/g, ' ');
  if (u.includes('ENTRADAS PARCEIROS') || u.includes('ENTRADA PARCEIROS')) return { titulo: 'Entradas Parceiros', tipo: 'entrada' };
  if (u.includes('ENTRADAS ALUGUEL') || u.includes('ALUGUEL') && u.includes('COWORKING') || (u.includes('ALUGUEL') && u.includes('ENTRADAS'))) return { titulo: 'Entradas Aluguel / Coworking', tipo: 'entrada' };
  if (u.includes('TOTAL SAÍDAS') || u.includes('TOTAL SAIDAS')) return { titulo: 'Total Saídas (Parceiros)', tipo: 'saida' };
  if (u.includes('GASTOS FIXOS')) return { titulo: 'Gastos Fixos', tipo: 'saida' };
  if (u.includes('SAÍDAS ALUGUEL') || u.includes('SAIDAS ALUGUEL')) return { titulo: 'Saídas Aluguel', tipo: 'saida' };
  if (u.includes('SAÍDA') || u.includes('SAIDA')) return { titulo: primeiraLinhaLabel.trim() || 'Saídas', tipo: 'saida' };
  if (u.includes('ENTRADA') && !u.includes('TOTAL')) return { titulo: primeiraLinhaLabel.trim() || 'Entradas', tipo: 'entrada' };
  return { titulo: primeiraLinhaLabel.trim() || 'Outros', tipo: 'saida' };
}

/** Verifica se o label é um cabeçalho de seção (Entradas Parceiros, Total Saídas, etc.). */
function isCabecalhoSecao(label: string): boolean {
  const u = label.toUpperCase().trim();
  return (
    u.includes('ENTRADAS PARCEIROS') || u.includes('ENTRADA PARCEIROS') ||
    u.includes('ENTRADAS ALUGUEL') || (u.includes('ALUGUEL') && u.includes('COWORKING')) ||
    u.includes('TOTAL SAÍDAS') || u.includes('TOTAL SAIDAS') ||
    u.includes('GASTOS FIXOS') ||
    u.includes('SAÍDAS ALUGUEL') || u.includes('SAIDAS ALUGUEL')
  );
}

/** A partir de porColuna: cada coluna pode ter VÁRIOS blocos (ex.: H-I com Entradas Aluguel e depois Saídas Aluguel). */
function blocosPorColuna(porColuna: { label: string; valor: string; valorNum?: number }[][]): {
  entradas: { titulo: string; linhas: { label: string; valor: string; valorNum?: number }[] }[];
  saidas: { titulo: string; linhas: { label: string; valor: string; valorNum?: number }[] }[];
} {
  const entradas: { titulo: string; linhas: { label: string; valor: string; valorNum?: number }[] }[] = [];
  const saidas: { titulo: string; linhas: { label: string; valor: string; valorNum?: number }[] }[] = [];
  for (const col of porColuna) {
    if (col.length === 0) continue;
    let blocoAtual: { titulo: string; tipo: 'entrada' | 'saida'; linhas: { label: string; valor: string; valorNum?: number }[] } | null = null;
    const flush = () => {
      if (blocoAtual && blocoAtual.linhas.length > 0) {
        if (blocoAtual.tipo === 'entrada') entradas.push({ titulo: blocoAtual.titulo, linhas: blocoAtual.linhas });
        else saidas.push({ titulo: blocoAtual.titulo, linhas: blocoAtual.linhas });
      }
      blocoAtual = null;
    };
    for (const linha of col) {
      const label = (linha.label ?? '').trim();
      if (!label) continue;
      if (isLinhaTotalGeral(label)) {
        flush();
        continue;
      }
      if (isCabecalhoSecao(label)) {
        flush();
        const { titulo, tipo } = classificarBlocoPorCabecalho(label);
        blocoAtual = { titulo, tipo, linhas: [] };
        continue;
      }
      if (blocoAtual) blocoAtual.linhas.push(linha);
    }
    flush();
  }
  return { entradas, saidas };
}

export function OverviewPage() {
  const { monthYear } = useMonthYear();
  const { resumoMensal, isLoading, error } = useResumoMensal();
  const {
    entradaTotal: planilhaEntrada,
    saidaTotal: planilhaSaida,
    lucroTotal: planilhaLucro,
    linhas: planilhaLinhas,
    porColuna: planilhaPorColuna,
    isLoading: planilhaLoading,
    error: planilhaError,
    fallbackMessage: planilhaFallback,
  } = useFluxoCompleto(monthYear.mes, monthYear.ano);
  const { fontes, isLoading: fontesLoading } = useFontes();

  const [filtroModalidade, setFiltroModalidade] = useState('');
  const [showDetalheEntradas, setShowDetalheEntradas] = useState(false);
  const [showDetalheSaidas, setShowDetalheSaidas] = useState(false);
  const [detalheEntradas, setDetalheEntradas] = useState<TransacaoItem[] | null>(null);
  const [detalheSaidas, setDetalheSaidas] = useState<TransacaoItem[] | null>(null);
  const [loadingDetalheEntradas, setLoadingDetalheEntradas] = useState(false);
  const [loadingDetalheSaidas, setLoadingDetalheSaidas] = useState(false);

  useEffect(() => {
    if (!showDetalheEntradas) return;
    let cancelled = false;
    setLoadingDetalheEntradas(true);
    getTransacoesPorMes(monthYear.mes, monthYear.ano, 'entrada')
      .then((r) => {
        if (!cancelled) setDetalheEntradas(r.itens);
      })
      .catch(() => {
        if (!cancelled) setDetalheEntradas([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingDetalheEntradas(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showDetalheEntradas, monthYear.mes, monthYear.ano]);

  useEffect(() => {
    if (!showDetalheSaidas) return;
    let cancelled = false;
    setLoadingDetalheSaidas(true);
    getTransacoesPorMes(monthYear.mes, monthYear.ano, 'saida')
      .then((r) => {
        if (!cancelled) setDetalheSaidas(r.itens);
      })
      .catch(() => {
        if (!cancelled) setDetalheSaidas([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingDetalheSaidas(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showDetalheSaidas, monthYear.mes, monthYear.ano]);

  const mesEmFoco = useMemo(
    () => findRow(resumoMensal, monthYear.mes, monthYear.ano),
    [resumoMensal, monthYear.mes, monthYear.ano]
  );
  const prev = previousMonth(monthYear.mes, monthYear.ano);
  const mesAnterior = useMemo(
    () => findRow(resumoMensal, prev.mes, prev.ano),
    [resumoMensal, prev.mes, prev.ano]
  );

  const temDadosSupabase = !!mesEmFoco && resumoMensal.length > 0;
  const varEntradas = variation(mesEmFoco?.total_entradas, mesAnterior?.total_entradas);
  const varSaidas = variation(mesEmFoco?.total_saidas, mesAnterior?.total_saidas);
  const varSaldo = variation(mesEmFoco?.saldo_mes, mesAnterior?.saldo_mes);

  const trendData = useMemo(
    () =>
      resumoMensal.map((row) => ({
        label: formatMesAno(row.mes, row.ano),
        totalEntradas: row.total_entradas,
        totalSaidas: row.total_saidas,
        saldoMes: row.saldo_mes,
      })),
    [resumoMensal]
  );

  const linhasPorModalidade = useMemo(() => {
    const lista = (planilhaLinhas ?? []).filter(
      (l) => l.label && !isLinhaTotalGeral(l.label) && (l.valorNum != null || (l.valor && String(l.valor).trim()))
    );
    const filtro = filtroModalidade.trim().toLowerCase();
    if (!filtro) return lista;
    return lista.filter((l) => l.label.toLowerCase().includes(filtro));
  }, [planilhaLinhas, filtroModalidade]);

  const linhasEntradas = useMemo(
    () => (planilhaLinhas ?? []).filter((l) => l.label && tipoCategoria(l.label) === 'entrada' && (l.valorNum != null || (l.valor && String(l.valor).trim()))),
    [planilhaLinhas]
  );
  const linhasSaidas = useMemo(
    () => (planilhaLinhas ?? []).filter((l) => l.label && tipoCategoria(l.label) === 'saida' && (l.valorNum != null || (l.valor && String(l.valor).trim()))),
    [planilhaLinhas]
  );
  const linhasTotais = useMemo(
    () => (planilhaLinhas ?? []).filter((l) => l.label && tipoCategoria(l.label) === 'total' && (l.valorNum != null || (l.valor && String(l.valor).trim()))),
    [planilhaLinhas]
  );
  const linhasOutros = useMemo(
    () => (planilhaLinhas ?? []).filter((l) => l.label && tipoCategoria(l.label) === 'outro' && (l.valorNum != null || (l.valor && String(l.valor).trim()))),
    [planilhaLinhas]
  );

  const planilhaPorSecao = useMemo(() => {
    if (planilhaPorColuna && planilhaPorColuna.length > 0) {
      return blocosPorColuna(planilhaPorColuna);
    }
    return { entradas: [], saidas: [] };
  }, [planilhaPorColuna]);

  const mesRealExtenso = `${MESES_EXTENSO[monthYear.mes - 1]}/${monthYear.ano}`;
  const abaPlanilha = nomeAbaPlanilha(monthYear.mes, monthYear.ano);

  const somaListaEntradas = useMemo(
    () => (detalheEntradas ?? []).reduce((acc, r) => acc + Number(r.valor), 0),
    [detalheEntradas]
  );
  const somaListaSaidas = useMemo(
    () => (detalheSaidas ?? []).reduce((acc, r) => acc + Number(r.valor), 0),
    [detalheSaidas]
  );
  const totalResumoEntradas = mesEmFoco?.total_entradas ?? 0;
  const totalResumoSaidas = mesEmFoco?.total_saidas ?? 0;
  const epsilon = 0.02;
  const entradasConferem = Math.abs(totalResumoEntradas - somaListaEntradas) <= epsilon;
  const saidasConferem = Math.abs(totalResumoSaidas - somaListaSaidas) <= epsilon;
  const podeConferirEntradas = detalheEntradas !== null;
  const podeConferirSaidas = detalheSaidas !== null;

  const subtitulo = temDadosSupabase
    ? `Mês: ${formatMesAno(monthYear.mes, monthYear.ano)}`
    : resumoMensal.length > 0
      ? `Nenhum dado Supabase para ${formatMesAno(monthYear.mes, monthYear.ano)}`
      : 'Sem dados ainda';

  return (
    <div className="p-6 space-y-8">
      <Topbar title="Visão geral financeira" subtitle={subtitulo} />

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800">
          Não foi possível carregar os dados do Supabase. Verifique o .env e tente novamente.
        </div>
      )}

      {/* Status das fontes */}
      {BACKEND_URL && (
        <section className="bg-white rounded-xl shadow-sm p-4">
          <h2 className="text-sm font-medium text-gray-700 mb-2">Status das fontes de dados</h2>
          {fontesLoading ? (
            <p className="text-sm text-gray-500">Verificando Supabase e planilhas…</p>
          ) : fontes ? (
            <div className="grid gap-3 sm:grid-cols-3 text-sm">
              <div className={`rounded-lg border p-3 ${fontes.supabase.ok ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
                <div className="font-medium text-gray-800">Supabase</div>
                <div className="text-gray-600">{fontes.supabase.papel}</div>
                <div className="mt-1 font-medium">{fontes.supabase.ok ? '✓ Conectado' : '✗ Indisponível'}</div>
              </div>
              <div className={`rounded-lg border p-3 ${fontes.planilha1.ok ? 'border-green-200 bg-green-50' : fontes.planilha1.configurado ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}>
                <div className="font-medium text-gray-800">{fontes.planilha1.nome}</div>
                <div className="text-gray-600">{fontes.planilha1.papel}</div>
                <div className="mt-1 font-medium">{fontes.planilha1.ok ? '✓ Dados OK' : fontes.planilha1.configurado ? `✗ ${fontes.planilha1.erro || 'Erro'}` : '— Não configurado'}</div>
              </div>
              <div className={`rounded-lg border p-3 ${fontes.planilha2.ok ? 'border-green-200 bg-green-50' : fontes.planilha2.configurado ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}>
                <div className="font-medium text-gray-800">{fontes.planilha2.nome}</div>
                <div className="text-gray-600">{fontes.planilha2.papel}</div>
                <div className="mt-1 font-medium">{fontes.planilha2.ok ? '✓ Dados OK' : fontes.planilha2.configurado ? `✗ ${fontes.planilha2.erro || 'Erro'}` : '— Não configurado'}</div>
              </div>
            </div>
          ) : null}
        </section>
      )}

      {/* ========== SEÇÃO 1: SÓ PLANILHA (CONTROLE DE CAIXA) ========== */}
      <section className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
        <div className="bg-indigo-50 border-b border-indigo-100 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-indigo-900">Controle financeiro – só pela planilha</h2>
            <p className="text-sm text-indigo-700 mt-0.5">
              Planilha <strong>CONTROLE DE CAIXA</strong>. Na planilha, a <strong>aba do mês seguinte</strong> contém o fechamento do mês selecionado.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm font-medium text-indigo-800">Mês:</span>
            <MonthYearPicker />
          </div>
        </div>
        <div className="p-4">
          <div className="mb-4 p-4 bg-indigo-100/80 border border-indigo-200 rounded-xl">
            <p className="text-sm font-semibold text-indigo-900">
              Período exibido: <span className="underline">{mesRealExtenso}</span>
            </p>
            <p className="text-sm text-indigo-800 mt-1">
              Na planilha CONTROLE DE CAIXA estes dados estão na aba <strong>“{abaPlanilha}”</strong>. Ou seja: ao selecionar <strong>{mesRealExtenso}</strong>, você vê o fechamento desse mês (aba = mês seguinte).
            </p>
          </div>
          {planilhaFallback && (
            <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
              {planilhaFallback}
            </div>
          )}
          {planilhaError && !planilhaFallback && (
            <p className="text-amber-600 text-sm mb-3">{planilhaError}</p>
          )}
          <div className="grid gap-4 md:grid-cols-3">
            <KpiCard
              label="Entrada total (planilha)"
              value={planilhaEntrada != null ? planilhaEntrada.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : '–'}
              accentColor="primary"
              isLoading={planilhaLoading}
            />
            <KpiCard
              label="Saída total (planilha)"
              value={planilhaSaida != null ? planilhaSaida.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : '–'}
              accentColor="danger"
              isLoading={planilhaLoading}
            />
            <KpiCard
              label="Lucro total (planilha)"
              value={planilhaLucro != null ? planilhaLucro.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : '–'}
              accentColor="success"
              isLoading={planilhaLoading}
            />
          </div>
          <p className="mt-2 text-xs text-indigo-600">
            O <strong>Lucro total</strong> exibido é o valor da célula <strong>LUCRO TOTAL</strong> da planilha (fechamento). Se houver mais de um lucro na aba, usamos o último.
          </p>

          {/* ========== ENTRADAS (azul) e SAÍDAS (amarelo) – por categoria/modalidade ========== */}
          {((planilhaPorSecao.entradas.length > 0 || planilhaPorSecao.saidas.length > 0) || (linhasEntradas.length > 0 || linhasSaidas.length > 0)) && (planilhaLinhas?.length ?? 0) > 0 && (
            <div className="mt-8 space-y-8">
              <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">Entradas e saídas por categoria (como na planilha)</h3>

              {(planilhaPorSecao.entradas.length > 0 || linhasEntradas.length > 0) && (
                <div className="rounded-xl border-2 border-blue-200 bg-blue-50/50 overflow-hidden shadow-sm">
                  <div className="bg-blue-600 px-4 py-3">
                    <h4 className="text-base font-semibold text-white flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-white/90" /> Entradas
                    </h4>
                    <p className="text-blue-100 text-sm mt-0.5">Receitas por categoria e modalidade (Parceiros, Aluguel/Coworking)</p>
                  </div>
                  <div className="p-4 space-y-6">
                    {planilhaPorSecao.entradas.length > 0 ? (
                      planilhaPorSecao.entradas.map((sec, idx) => {
                        const totalSec = sec.linhas.reduce((acc, l) => acc + (l.valorNum ?? 0), 0);
                        return (
                          <div key={idx} className="bg-white rounded-lg border border-blue-200 overflow-hidden">
                            <div className="bg-blue-100 px-3 py-2 border-b border-blue-200">
                              <span className="text-sm font-semibold text-blue-900">{sec.titulo}</span>
                            </div>
                            <table className="w-full text-sm">
                              <thead className="bg-blue-50">
                                <tr>
                                  <th className="text-left py-2.5 px-3 font-medium text-blue-900">Modalidade / Descrição</th>
                                  <th className="text-right py-2.5 px-3 font-medium text-blue-900 w-32">Valor</th>
                                </tr>
                              </thead>
                              <tbody>
                                {sec.linhas.map((l, i) => (
                                  <tr key={i} className="border-t border-blue-100 hover:bg-blue-50/50">
                                    <td className="py-2 px-3 text-gray-800">{l.label}</td>
                                    <td className="py-2 px-3 text-right font-medium text-blue-800 tabular-nums">
                                      {l.valorNum != null ? l.valorNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : l.valor ?? '–'}
                                    </td>
                                  </tr>
                                ))}
                                <tr className="border-t border-blue-200 bg-blue-50/80">
                                  <td className="py-2.5 px-3 text-blue-900 font-semibold">Total {sec.titulo}</td>
                                  <td className="py-2.5 px-3 text-right font-semibold text-blue-900 tabular-nums">
                                    {totalSec.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        );
                      })
                    ) : (
                      <div className="bg-white rounded-lg border border-blue-200 overflow-hidden">
                        <div className="bg-blue-100 px-3 py-2 border-b border-blue-200">
                          <span className="text-sm font-semibold text-blue-900">Entradas (categorias)</span>
                        </div>
                        <table className="w-full text-sm">
                          <thead className="bg-blue-50">
                            <tr>
                              <th className="text-left py-2.5 px-3 font-medium text-blue-900">Modalidade / Descrição</th>
                              <th className="text-right py-2.5 px-3 font-medium text-blue-900 w-32">Valor</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              const totalFallback = linhasEntradas.reduce((acc, l) => acc + (l.valorNum ?? 0), 0);
                              return (
                                <>
                                  {linhasEntradas.map((l, i) => (
                                    <tr key={i} className="border-t border-blue-100 hover:bg-blue-50/50">
                                      <td className="py-2 px-3 text-gray-800">{l.label}</td>
                                      <td className="py-2 px-3 text-right font-medium text-blue-800 tabular-nums">
                                        {l.valorNum != null ? l.valorNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : l.valor ?? '–'}
                                      </td>
                                    </tr>
                                  ))}
                                  <tr className="border-t border-blue-200 bg-blue-50/80">
                                    <td className="py-2.5 px-3 text-blue-900 font-semibold">Total entradas</td>
                                    <td className="py-2.5 px-3 text-right font-semibold text-blue-900 tabular-nums">
                                      {totalFallback.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </td>
                                  </tr>
                                </>
                              );
                            })()}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {(planilhaPorSecao.saidas.length > 0 || linhasSaidas.length > 0) && (
                <div className="rounded-xl border-2 border-amber-300 bg-amber-50/50 overflow-hidden shadow-sm">
                  <div className="bg-amber-600 px-4 py-3">
                    <h4 className="text-base font-semibold text-white flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-white/90" /> Saídas
                    </h4>
                    <p className="text-amber-100 text-sm mt-0.5">Despesas por categoria (Parceiros, Gastos Fixos, Aluguel)</p>
                  </div>
                  <div className="p-4 space-y-6">
                    {planilhaPorSecao.saidas.length > 0 ? (
                      planilhaPorSecao.saidas.map((sec, idx) => {
                        const totalSec = sec.linhas.reduce((acc, l) => acc + (l.valorNum ?? 0), 0);
                        return (
                          <div key={idx} className="bg-white rounded-lg border border-amber-200 overflow-hidden">
                            <div className="bg-amber-100 px-3 py-2 border-b border-amber-200">
                              <span className="text-sm font-semibold text-amber-900">{sec.titulo}</span>
                            </div>
                            <table className="w-full text-sm">
                              <thead className="bg-amber-50">
                                <tr>
                                  <th className="text-left py-2.5 px-3 font-medium text-amber-900">Categoria / Descrição</th>
                                  <th className="text-right py-2.5 px-3 font-medium text-amber-900 w-32">Valor</th>
                                </tr>
                              </thead>
                              <tbody>
                                {sec.linhas.map((l, i) => (
                                  <tr key={i} className="border-t border-amber-100 hover:bg-amber-50/50">
                                    <td className="py-2 px-3 text-gray-800">{l.label}</td>
                                    <td className="py-2 px-3 text-right font-medium text-amber-800 tabular-nums">
                                      {l.valorNum != null ? l.valorNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : l.valor ?? '–'}
                                    </td>
                                  </tr>
                                ))}
                                <tr className="border-t border-amber-200 bg-amber-50/80">
                                  <td className="py-2.5 px-3 text-amber-900 font-semibold">Total {sec.titulo}</td>
                                  <td className="py-2.5 px-3 text-right font-semibold text-amber-900 tabular-nums">
                                    {totalSec.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        );
                      })
                    ) : (
                      <div className="bg-white rounded-lg border border-amber-200 overflow-hidden">
                        <div className="bg-amber-100 px-3 py-2 border-b border-amber-200">
                          <span className="text-sm font-semibold text-amber-900">Saídas (categorias)</span>
                        </div>
                        <table className="w-full text-sm">
                          <thead className="bg-amber-50">
                            <tr>
                              <th className="text-left py-2.5 px-3 font-medium text-amber-900">Categoria / Descrição</th>
                              <th className="text-right py-2.5 px-3 font-medium text-amber-900 w-32">Valor</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              const totalFallback = linhasSaidas.reduce((acc, l) => acc + (l.valorNum ?? 0), 0);
                              return (
                                <>
                                  {linhasSaidas.map((l, i) => (
                                    <tr key={i} className="border-t border-amber-100 hover:bg-amber-50/50">
                                      <td className="py-2 px-3 text-gray-800">{l.label}</td>
                                      <td className="py-2 px-3 text-right font-medium text-amber-800 tabular-nums">
                                        {l.valorNum != null ? l.valorNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : l.valor ?? '–'}
                                      </td>
                                    </tr>
                                  ))}
                                  <tr className="border-t border-amber-200 bg-amber-50/80">
                                    <td className="py-2.5 px-3 text-amber-900 font-semibold">Total saídas</td>
                                    <td className="py-2.5 px-3 text-right font-semibold text-amber-900 tabular-nums">
                                      {totalFallback.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </td>
                                  </tr>
                                </>
                              );
                            })()}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Totais gerais: Entrada total (verde), Saída total (vermelho), Lucro total (neutro) – nunca misturar saída com entrada */}
              {linhasTotais.length > 0 && (
                <div className="rounded-xl border-2 border-slate-200 overflow-hidden">
                  <div className="bg-slate-700 px-4 py-3">
                    <h4 className="text-base font-semibold text-white">Resumo – totais da planilha</h4>
                    <p className="text-slate-300 text-xs mt-0.5">Entrada total = receitas. Saída total = despesas. Lucro = diferença.</p>
                  </div>
                  <div className="p-0">
                    <table className="w-full text-sm">
                      <tbody>
                        {linhasTotais.map((l, i) => {
                          const u = (l.label ?? '').toUpperCase();
                          const isEntradaTotal = u.includes('ENTRADA TOTAL') && !u.includes('SAÍDA') && !u.includes('SAIDA');
                          const isSaidaTotal = u.includes('SAÍDA TOTAL') || u.includes('SAIDA TOTAL');
                          const isLucro = u.includes('LUCRO') || u.includes('RESULTADO');
                          const rowBg = isEntradaTotal ? 'bg-emerald-50' : isSaidaTotal ? 'bg-rose-50' : 'bg-slate-50';
                          const labelColor = isEntradaTotal ? 'text-emerald-900 font-semibold' : isSaidaTotal ? 'text-rose-900 font-semibold' : 'text-slate-800 font-medium';
                          const valorColor = isEntradaTotal ? 'text-emerald-800' : isSaidaTotal ? 'text-rose-800' : 'text-slate-900';
                          return (
                            <tr key={i} className={`border-t border-slate-200 ${rowBg}`}>
                              <td className={`py-3 px-4 ${labelColor}`}>
                                {isEntradaTotal ? 'Entrada total' : isSaidaTotal ? 'Saída total' : l.label}
                              </td>
                              <td className={`py-3 px-4 text-right font-semibold tabular-nums ${valorColor}`}>
                                {l.valorNum != null ? l.valorNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : l.valor ?? '–'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {(planilhaLinhas?.length ?? 0) > 0 && (
            <details className="mt-6 rounded-lg border border-slate-200 bg-slate-50">
              <summary className="px-4 py-3 text-sm font-medium text-slate-700 cursor-pointer hover:bg-slate-100">
                Ver lista completa da aba (ordem bruta)
              </summary>
              <div className="border-t border-slate-200 max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 sticky top-0">
                    <tr>
                      <th className="text-left py-2 px-3 font-medium text-slate-700 w-10">#</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-700">Descrição</th>
                      <th className="text-right py-2 px-3 font-medium text-slate-700">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {planilhaLinhas!.map((l, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="py-2 px-3 text-slate-500">{i + 1}</td>
                        <td className="py-2 px-3 text-gray-800">{l.label}</td>
                        <td className="py-2 px-3 text-right font-medium text-gray-900">
                          {l.valorNum != null ? l.valorNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : l.valor ?? '–'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      </section>

      {/* ========== SEÇÃO 2: SÓ SUPABASE ========== */}
      <section className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
        <div className="bg-emerald-50 border-b border-emerald-100 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-emerald-900">Controle financeiro – só pelo Supabase</h2>
            <p className="text-sm text-emerald-700 mt-0.5">
              Resumo oficial a partir da tabela de transações (v_resumo_mensal_oficial).
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm font-medium text-emerald-800">Mês:</span>
            <MonthYearPicker />
          </div>
        </div>
        <div className="p-4">
          <div className="mb-4 p-3 bg-emerald-100/80 border border-emerald-200 rounded-xl">
            <p className="text-sm font-semibold text-emerald-900">
              Período exibido: <span className="underline">{mesRealExtenso}</span>
            </p>
            <p className="text-xs text-emerald-800 mt-0.5">Dados do Supabase referem-se diretamente ao mês selecionado.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <KpiCard
              label={`Total de entradas (${formatMesAno(monthYear.mes, monthYear.ano)})`}
              value={
                temDadosSupabase
                  ? mesEmFoco!.total_entradas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
                  : '—'
              }
              helperText={varEntradas != null ? `${(varEntradas * 100).toFixed(1)}% vs mês anterior` : undefined}
              trend={varEntradas == null ? 'neutral' : varEntradas >= 0 ? 'up' : 'down'}
              accentColor="primary"
              isLoading={isLoading}
            />
            <KpiCard
              label={`Total de saídas (${formatMesAno(monthYear.mes, monthYear.ano)})`}
              value={
                temDadosSupabase
                  ? mesEmFoco!.total_saidas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
                  : '—'
              }
              helperText={varSaidas != null ? `${(varSaidas * 100).toFixed(1)}% vs mês anterior` : undefined}
              trend={varSaidas == null ? 'neutral' : varSaidas >= 0 ? 'up' : 'down'}
              accentColor="danger"
              isLoading={isLoading}
            />
            <KpiCard
              label="Saldo do mês"
              value={
                temDadosSupabase
                  ? mesEmFoco!.saldo_mes.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
                  : '—'
              }
              helperText={varSaldo != null ? `${(varSaldo * 100).toFixed(1)}% vs mês anterior` : undefined}
              trend={varSaldo == null ? 'neutral' : varSaldo >= 0 ? 'up' : 'down'}
              accentColor={mesEmFoco != null && mesEmFoco.saldo_mes >= 0 ? 'success' : 'danger'}
              isLoading={isLoading}
            />
          </div>
          <div className="mt-6">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Evolução mensal – entradas x saídas</h3>
            <MonthlyTrendChart data={trendData} isLoading={isLoading} />
          </div>
          <div className="mt-6">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Resumo mensal (Supabase)</h3>
            <ResumoMensalTable rows={resumoMensal} isLoading={isLoading} />
          </div>

          <div className="mt-6 space-y-4">
            <h3 className="text-sm font-medium text-gray-700">Detalhes por mês selecionado</h3>
            <p className="text-xs text-gray-500">
              Lista de todas as entradas e todas as saídas do mês <strong>{mesRealExtenso}</strong> (Supabase).
            </p>

            {temDadosSupabase && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <h4 className="text-sm font-semibold text-slate-800 mb-3">Conferência: resumo x soma das listas</h4>
                <p className="text-xs text-slate-600 mb-3">
                  Comparação entre o total do mês (resumo Supabase) e a soma dos itens das listas abaixo. Abra as listas para carregar e conferir.
                </p>
                <div className="grid gap-3 sm:grid-cols-2 text-sm">
                  <div className="rounded-lg border border-emerald-200 bg-white p-3">
                    <div className="font-medium text-emerald-900 mb-1">Entradas</div>
                    <div className="text-slate-700">
                      Resumo (Supabase): <strong>{totalResumoEntradas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                    </div>
                    <div className="text-slate-700">
                      Soma da lista: {podeConferirEntradas ? (
                        <strong>{somaListaEntradas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                      ) : (
                        <span className="text-slate-400">— (abra a lista)</span>
                      )}
                    </div>
                    {podeConferirEntradas && (
                      <div className={`mt-1 font-medium ${entradasConferem ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {entradasConferem ? '✓ Valores conferem' : `✗ Diferença: ${(totalResumoEntradas - somaListaEntradas).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`}
                      </div>
                    )}
                  </div>
                  <div className="rounded-lg border border-rose-200 bg-white p-3">
                    <div className="font-medium text-rose-900 mb-1">Saídas</div>
                    <div className="text-slate-700">
                      Resumo (Supabase): <strong>{totalResumoSaidas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                    </div>
                    <div className="text-slate-700">
                      Soma da lista: {podeConferirSaidas ? (
                        <strong>{somaListaSaidas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                      ) : (
                        <span className="text-slate-400">— (abra a lista)</span>
                      )}
                    </div>
                    {podeConferirSaidas && (
                      <div className={`mt-1 font-medium ${saidasConferem ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {saidasConferem ? '✓ Valores conferem' : `✗ Diferença: ${(totalResumoSaidas - somaListaSaidas).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="border border-emerald-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowDetalheEntradas((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-emerald-50 hover:bg-emerald-100 text-left text-sm font-medium text-emerald-900"
              >
                <span>Ver todas as entradas ({formatMesAno(monthYear.mes, monthYear.ano)})</span>
                <span className="text-emerald-600">{showDetalheEntradas ? '▼ Ocultar' : '▶ Ver lista'}</span>
              </button>
              {showDetalheEntradas && (
                <div className="border-t border-emerald-200 bg-white">
                  {loadingDetalheEntradas ? (
                    <p className="p-4 text-sm text-gray-500">Carregando…</p>
                  ) : detalheEntradas && detalheEntradas.length > 0 ? (
                    <div className="max-h-72 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-emerald-50 sticky top-0">
                          <tr>
                            <th className="text-left py-2 px-3 font-medium text-emerald-900">Data</th>
                            <th className="text-left py-2 px-3 font-medium text-emerald-900">Pessoa</th>
                            <th className="text-right py-2 px-3 font-medium text-emerald-900">Valor</th>
                            <th className="text-left py-2 px-3 font-medium text-emerald-900">Descrição</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detalheEntradas.map((r) => (
                            <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                              <td className="py-2 px-3 text-gray-800">{r.data}</td>
                              <td className="py-2 px-3 text-gray-800">{r.pessoa}</td>
                              <td className="py-2 px-3 text-right font-medium text-emerald-800">
                                {r.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </td>
                              <td className="py-2 px-3 text-gray-600 max-w-[200px] truncate" title={r.descricao ?? ''}>{r.descricao ?? '–'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="p-4 text-sm text-gray-500">Nenhuma entrada neste mês.</p>
                  )}
                </div>
              )}
            </div>

            <div className="border border-rose-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowDetalheSaidas((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-rose-50 hover:bg-rose-100 text-left text-sm font-medium text-rose-900"
              >
                <span>Ver todas as saídas ({formatMesAno(monthYear.mes, monthYear.ano)})</span>
                <span className="text-rose-600">{showDetalheSaidas ? '▼ Ocultar' : '▶ Ver lista'}</span>
              </button>
              {showDetalheSaidas && (
                <div className="border-t border-rose-200 bg-white">
                  {loadingDetalheSaidas ? (
                    <p className="p-4 text-sm text-gray-500">Carregando…</p>
                  ) : detalheSaidas && detalheSaidas.length > 0 ? (
                    <div className="max-h-72 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-rose-50 sticky top-0">
                          <tr>
                            <th className="text-left py-2 px-3 font-medium text-rose-900">Data</th>
                            <th className="text-left py-2 px-3 font-medium text-rose-900">Pessoa</th>
                            <th className="text-right py-2 px-3 font-medium text-rose-900">Valor</th>
                            <th className="text-left py-2 px-3 font-medium text-rose-900">Descrição</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detalheSaidas.map((r) => (
                            <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                              <td className="py-2 px-3 text-gray-800">{r.data}</td>
                              <td className="py-2 px-3 text-gray-800">{r.pessoa}</td>
                              <td className="py-2 px-3 text-right font-medium text-rose-800">
                                {r.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </td>
                              <td className="py-2 px-3 text-gray-600 max-w-[200px] truncate" title={r.descricao ?? ''}>{r.descricao ?? '–'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="p-4 text-sm text-gray-500">Nenhuma saída neste mês.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ========== SEÇÃO 3: COMPARAÇÃO + FILTRO POR MODALIDADE/CATEGORIA ========== */}
      <section className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
        <div className="bg-amber-50 border-b border-amber-100 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-amber-900">Comparação: planilha x Supabase</h2>
            <p className="text-sm text-amber-800 mt-0.5">
              Confronte os totais do mês e filtre por modalidade/categoria (dados da planilha CONTROLE DE CAIXA).
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm font-medium text-amber-800">Mês:</span>
            <MonthYearPicker />
          </div>
        </div>
        <div className="p-4 space-y-6">
          <div className="p-3 bg-amber-100/80 border border-amber-200 rounded-xl">
            <p className="text-sm font-semibold text-amber-900">
              Período da comparação: <span className="underline">{mesRealExtenso}</span>
            </p>
            <p className="text-xs text-amber-800 mt-0.5">
              Planilha: fechamento de {mesRealExtenso} (aba “{abaPlanilha}”). Supabase: dados de {mesRealExtenso}.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[400px] text-sm border rounded-lg overflow-hidden">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Indicador</th>
                  <th className="text-right py-3 px-4 font-semibold text-indigo-700">Planilha (CONTROLE DE CAIXA)</th>
                  <th className="text-right py-3 px-4 font-semibold text-emerald-700">Supabase</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">Diferença</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-gray-200 hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium text-gray-800">Entradas</td>
                  <td className="py-3 px-4 text-right text-indigo-700">
                    {planilhaEntrada != null ? planilhaEntrada.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '–'}
                  </td>
                  <td className="py-3 px-4 text-right text-emerald-700">
                    {temDadosSupabase ? mesEmFoco!.total_entradas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '–'}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-600">
                    {planilhaEntrada != null && temDadosSupabase
                      ? (planilhaEntrada - mesEmFoco!.total_entradas).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                      : '–'}
                  </td>
                </tr>
                <tr className="border-t border-gray-200 hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium text-gray-800">Saídas</td>
                  <td className="py-3 px-4 text-right text-indigo-700">
                    {planilhaSaida != null ? planilhaSaida.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '–'}
                  </td>
                  <td className="py-3 px-4 text-right text-emerald-700">
                    {temDadosSupabase ? mesEmFoco!.total_saidas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '–'}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-600">
                    {planilhaSaida != null && temDadosSupabase
                      ? (planilhaSaida - mesEmFoco!.total_saidas).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                      : '–'}
                  </td>
                </tr>
                <tr className="border-t border-gray-200 hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium text-gray-800">Saldo / Lucro</td>
                  <td className="py-3 px-4 text-right text-indigo-700">
                    {planilhaLucro != null ? planilhaLucro.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '–'}
                  </td>
                  <td className="py-3 px-4 text-right text-emerald-700">
                    {temDadosSupabase ? mesEmFoco!.saldo_mes.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '–'}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-600">
                    {planilhaLucro != null && temDadosSupabase
                      ? (planilhaLucro - mesEmFoco!.saldo_mes).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                      : '–'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Entrada por modalidade e categoria (planilha)</h3>
            <p className="text-xs text-gray-500 mb-3">
              Filtre para ver quanto entrou por modalidade/categoria conforme a planilha CONTROLE DE CAIXA.
            </p>
            <input
              type="text"
              placeholder="Filtrar por nome da modalidade ou categoria..."
              value={filtroModalidade}
              onChange={(e) => setFiltroModalidade(e.target.value)}
              className="w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
            />
            <div className="mt-3 border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-amber-50 sticky top-0">
                  <tr>
                    <th className="text-left py-2 px-3 font-medium text-amber-900">Modalidade / Categoria</th>
                    <th className="text-right py-2 px-3 font-medium text-amber-900">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasPorModalidade.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="py-6 px-3 text-center text-gray-500">
                        {filtroModalidade.trim() ? 'Nenhum item encontrado para o filtro.' : 'Nenhuma linha de modalidade/categoria na planilha para este mês.'}
                      </td>
                    </tr>
                  ) : (
                    linhasPorModalidade.map((l, i) => (
                      <tr key={i} className="border-t border-gray-100 hover:bg-amber-50/50">
                        <td className="py-2 px-3 text-gray-800">{l.label}</td>
                        <td className="py-2 px-3 text-right font-medium text-gray-900">
                          {l.valorNum != null ? l.valorNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : l.valor ?? '–'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
