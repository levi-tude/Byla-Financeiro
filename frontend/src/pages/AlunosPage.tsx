import { useMemo, useState } from 'react';
import { Topbar } from '../app/Topbar';
import { KpiCard } from '../components/ui/KpiCard';
import { useAlunosCompleto } from '../hooks/useAlunosCompleto';
import { useFluxoCompleto } from '../hooks/useFluxoCompleto';
import { useMonthYear } from '../context/MonthYearContext';

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL ?? '').trim();

function formatCurrency(value: number | null): string {
  if (value == null) return '–';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getValorCelula(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  if (v == null) return '–';
  if (typeof v === 'number') return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return String(v).trim() || '–';
}

function labelColuna(key: string): string {
  const labels: Record<string, string> = {
    _aba: 'Aba',
    _modalidade: 'Modalidade',
    _modalidade_aba: 'Modalidade (aba)',
    _ativo: 'Status',
    _linha: 'Linha',
  };
  return labels[key] ?? key.replace(/\\/g, '').trim();
}

function isAtivo(row: Record<string, unknown>): boolean {
  const v = row['_ativo'];
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  return true;
}

type PorAba = Record<string, { rows: Record<string, unknown>[]; colunas: string[]; por_modalidade: Record<string, Record<string, unknown>[]> }>;

export function AlunosPage() {
  const { monthYear } = useMonthYear();
  const { combinado, porAba, origem, abasLidas, isLoading, error } = useAlunosCompleto();
  const { entradaTotal, saidaTotal, lucroTotal, isLoading: fluxoLoading, error: fluxoError, fallbackMessage: fluxoFallback } = useFluxoCompleto(monthYear.mes, monthYear.ano);

  const totalAlunos = useMemo(() => {
    const nomes = new Set(
      combinado.map((r) => (r['ALUNO'] ?? r['CLIENTE'] ?? r['nome'] ?? r['Cliente'] ?? '').toString().trim()).filter(Boolean)
    );
    return nomes.size;
  }, [combinado]);

  const totalAtivos = useMemo(() => combinado.filter((r) => isAtivo(r as Record<string, unknown>)).length, [combinado]);
  const totalModalidades = useMemo(() => {
    const mods = new Set(
      combinado.map((r) =>
        (r['_modalidade'] ?? r['_aba'] ?? r['MODALIDADE '] ?? r['MODALIDADE'] ?? r['Modalidade'] ?? '').toString().trim()
      ).filter(Boolean)
    );
    return mods.size;
  }, [combinado]);

  const subtitulo = origem
    ? abasLidas?.length
      ? `Planilha FLUXO DE CAIXA BYLA (${abasLidas.length} abas: BYLA DANÇA, PILATES, TEATRO, YOGA, etc.) – por aba, modalidade e status (ativos/inativos, ex.: PILATES ativos até linha 33).`
      : `Dados: ${origem === 'planilha' ? 'Planilha FLUXO DE CAIXA BYLA' : origem}`
    : 'Carregando…';

  const abasOrdenadas = useMemo(() => {
    if (!porAba) return [];
    const ord = ['BYLA DANÇA', 'PILATES MARINA', 'TEATRO', 'YOGA', 'G.R.', 'TEATRO INFANTIL', 'ATENDIMENTOS', 'ATENDI'];
    return Object.keys(porAba).sort((a, b) => {
      const ia = ord.indexOf(a.toUpperCase());
      const ib = ord.indexOf(b.toUpperCase());
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      if (a === 'Geral') return 1;
      if (b === 'Geral') return -1;
      return a.localeCompare(b);
    });
  }, [porAba]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="p-6 max-w-7xl mx-auto">
        <Topbar title="Alunos e matrículas" subtitle={subtitulo} />
        {error && (
          <div className="mb-4 p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800">{error}</div>
        )}
        {BACKEND_URL && fluxoFallback && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
            {fluxoFallback}
          </div>
        )}
        {BACKEND_URL && fluxoError && !fluxoFallback && (
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
            Planilha Fluxo: {fluxoError}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-4 mt-6">
          <KpiCard label="Total de registros" value={String(combinado.length)} accentColor="primary" isLoading={isLoading} />
          <KpiCard label="Alunos (únicos)" value={String(totalAlunos)} accentColor="primary" isLoading={isLoading} />
          <KpiCard label="Ativos" value={String(totalAtivos)} accentColor="success" isLoading={isLoading} />
          <KpiCard label="Modalidades" value={String(totalModalidades)} accentColor="primary" isLoading={isLoading} />
        </div>

        {BACKEND_URL && (
          <div className="mt-6 bg-white/80 backdrop-blur rounded-2xl shadow-sm border border-slate-200/80 p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-2">
              Fluxo de caixa – planilha CONTROLE DE CAIXA
            </h2>
            <p className="text-xs text-slate-500 mb-3">Aba do mês M = fechamento do mês M-1.</p>
            <div className="grid gap-4 md:grid-cols-3">
              <KpiCard label="Entrada total" value={formatCurrency(entradaTotal)} accentColor="primary" isLoading={fluxoLoading} />
              <KpiCard label="Saída total" value={formatCurrency(saidaTotal)} accentColor="danger" isLoading={fluxoLoading} />
              <KpiCard label="Lucro total" value={formatCurrency(lucroTotal)} accentColor="success" isLoading={fluxoLoading} />
            </div>
          </div>
        )}

        <div className="mt-8" id="alunos-por-aba">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-800 tracking-tight">
                Alunos por aba e modalidade
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Navegue por aba, filtre por nome ou modalidade e veja ativos e inativos separados.
              </p>
            </div>
            {porAba && abasOrdenadas.length > 1 && (
              <nav className="flex flex-wrap gap-2" aria-label="Pular para aba">
                {abasOrdenadas.map((aba) => (
                  <a
                    key={aba}
                    href={`#aba-${aba.replace(/\s+/g, '-')}`}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900 transition-colors"
                  >
                    {aba}
                  </a>
                ))}
              </nav>
            )}
          </div>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6 animate-pulse">
                  <div className="h-6 bg-slate-200 rounded w-1/3 mb-4" />
                  <div className="h-32 bg-slate-100 rounded-xl" />
                </div>
              ))}
            </div>
          ) : porAba && abasOrdenadas.length > 0 ? (
            <div className="space-y-6">
              {abasOrdenadas.map((nomeAba) => {
                const bloco = porAba[nomeAba];
                const modalidadesOrdenadas = bloco
                  ? Object.keys(bloco.por_modalidade).sort((a, b) => {
                      if (a === '(sem modalidade)') return 1;
                      if (b === '(sem modalidade)') return -1;
                      return a.localeCompare(b);
                    })
                  : [];
                return (
                  <SecaoAba
                    key={nomeAba}
                    nomeAba={nomeAba}
                    colunas={bloco?.colunas ?? []}
                    porModalidade={bloco?.por_modalidade ?? {}}
                    modalidadesOrdenadas={modalidadesOrdenadas}
                    idAba={`aba-${nomeAba.replace(/\s+/g, '-')}`}
                  />
                );
              })}
            </div>
          ) : combinado.length > 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-5">
              <p className="text-sm text-slate-500 mb-3">Lista única (sem agrupamento por aba)</p>
              <TabelaAlunos rows={combinado as Record<string, unknown>[]} colunas={Object.keys(combinado[0] ?? {}).filter(Boolean)} />
            </div>
          ) : (
            <p className="text-sm text-slate-500 py-8">
              Nenhum registro. Configure o backend (VITE_BACKEND_URL) e a planilha, ou use o Supabase.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function SecaoAba({
  nomeAba,
  colunas,
  porModalidade,
  modalidadesOrdenadas,
  idAba,
}: {
  nomeAba: string;
  colunas: string[];
  porModalidade: Record<string, Record<string, unknown>[]>;
  modalidadesOrdenadas: string[];
  idAba: string;
}) {
  const [expandido, setExpandido] = useState(true);
  const [filtroModalidade, setFiltroModalidade] = useState('');
  const totalLinhas = modalidadesOrdenadas.reduce((s, m) => s + (porModalidade[m]?.length ?? 0), 0);
  const totaisAtivosInativos = useMemo(() => {
    let ativos = 0;
    let inativos = 0;
    modalidadesOrdenadas.forEach((m) => {
      (porModalidade[m] ?? []).forEach((r) => (isAtivo(r) ? ativos++ : inativos++));
    });
    return { ativos, inativos };
  }, [porModalidade, modalidadesOrdenadas]);

  const modalidadesFiltradas = useMemo(() => {
    if (!filtroModalidade.trim()) return modalidadesOrdenadas;
    const q = filtroModalidade.trim().toLowerCase();
    return modalidadesOrdenadas.filter((m) => m.toLowerCase().includes(q));
  }, [modalidadesOrdenadas, filtroModalidade]);

  return (
    <section id={idAba} className="scroll-mt-6 bg-white rounded-2xl shadow-md border border-slate-200/90 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpandido((e) => !e)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-slate-50/90 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500/20"
      >
        <span className="font-semibold text-slate-800 text-base">
          {nomeAba}
        </span>
        <span className="text-sm text-slate-500 flex items-center gap-3 flex-wrap justify-end">
          <span className="bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full text-xs font-semibold">
            {totaisAtivosInativos.ativos} ativos
          </span>
          {totaisAtivosInativos.inativos > 0 && (
            <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full text-xs font-medium">
              {totaisAtivosInativos.inativos} inativos
            </span>
          )}
          <span className="text-slate-400">{totalLinhas} registros · {modalidadesOrdenadas.length} modalidade(s)</span>
        </span>
        <span className="text-slate-400 text-lg ml-2 shrink-0" aria-hidden>{expandido ? '▼' : '▶'}</span>
      </button>
      {expandido && (
        <div className="border-t border-slate-100 bg-slate-50/30">
          {modalidadesOrdenadas.length > 3 && (
            <div className="px-6 py-3 border-b border-slate-100">
              <label htmlFor={`filtro-${idAba}`} className="sr-only">Filtrar modalidade</label>
              <input
                id={`filtro-${idAba}`}
                type="text"
                placeholder="Filtrar por nome da modalidade..."
                value={filtroModalidade}
                onChange={(e) => setFiltroModalidade(e.target.value)}
                className="w-full max-w-xs px-3 py-2 rounded-lg border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
              />
            </div>
          )}
          {modalidadesFiltradas.map((modalidade) => {
            const rows = porModalidade[modalidade] ?? [];
            if (rows.length === 0) return null;
            const ativos = rows.filter((r) => isAtivo(r));
            const inativos = rows.filter((r) => !isAtivo(r));
            return (
              <div key={modalidade} className="border-b border-slate-100 last:border-b-0 bg-white">
                <h3 className="px-6 py-3 text-sm font-semibold text-slate-700 bg-white border-b border-slate-100">
                  {modalidade}
                </h3>
                <div className="px-6 py-4 space-y-4">
                  {ativos.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-2">Ativos ({ativos.length})</p>
                      <div className="overflow-x-auto max-h-[300px] overflow-y-auto rounded-xl border border-slate-200 shadow-inner bg-white">
                        <TabelaAlunos rows={ativos} colunas={colunas} showStatus />
                      </div>
                    </div>
                  )}
                  {inativos.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Inativos ({inativos.length})</p>
                      <div className="overflow-x-auto max-h-[220px] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 shadow-inner">
                        <TabelaAlunos rows={inativos} colunas={colunas} showStatus />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function TabelaAlunos({
  rows,
  colunas,
  showStatus = false,
}: {
  rows: Record<string, unknown>[];
  colunas: string[];
  showStatus?: boolean;
}) {
  const colunasExibir = useMemo(() => {
    const prefer = [
      '_modalidade', 'ALUNO', 'nome', 'WPP', 'RESPONSÁVEIS', 'RESPONSAVEIS', 'PLANO', 'MATRICULA', 'FIM', 'VENC', 'VALOR', 'PRÓ',
      'OBSERVAÇÕES', 'OBS.', '_ativo', '_aba', 'CLIENTE', 'DATA \\VEN', 'DATA VEN', 'PARCEIRO',
    ];
    const rest = colunas.filter((c) => !prefer.includes(c));
    const base = [...prefer.filter((c) => colunas.includes(c)), ...rest];
    if (!showStatus) return base.filter((c) => c !== '_ativo' && c !== '_linha').slice(0, 14);
    return base.slice(0, 14);
  }, [colunas, showStatus]);

  if (rows.length === 0) return <p className="p-4 text-sm text-slate-500">Nenhuma linha.</p>;

  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="border-b-2 border-slate-200 bg-slate-100/90 text-left text-slate-600 font-semibold sticky top-0 z-10">
          {colunasExibir.map((k) => (
            <th key={k} className="px-4 py-3 whitespace-nowrap first:rounded-tl-xl last:rounded-tr-xl">
              {labelColuna(k)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr
            key={i}
            className={`border-b border-slate-100 transition-colors hover:bg-indigo-50/30 ${i % 2 === 1 ? 'bg-slate-50/50' : ''}`}
          >
            {colunasExibir.map((k) => (
              <td key={k} className="px-4 py-2.5 align-baseline">
                {k === '_ativo' ? (
                  isAtivo(row) ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">Ativo</span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-600">Inativo</span>
                  )
                ) : (
                  getValorCelula(row, k)
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
