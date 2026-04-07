import { useEffect, useMemo, useState } from 'react';
import { Topbar } from '../app/Topbar';
import { getPagamentosPlanilhaTodasAbas, type PagamentosPorAba, type PagamentoPlanilha } from '../services/backendApi';

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isAbaBylaDanca(aba: string): boolean {
  const u = aba.trim().toUpperCase().replace(/Ç/g, 'C');
  return u === 'BYLA DANCA' || u.includes('BYLA DAN');
}

type OrdenacaoAlunos = 'aluno_az' | 'aluno_za' | 'valor_desc' | 'valor_asc' | 'data_recente' | 'data_antiga' | 'linha';
type OrdenacaoModalidades = 'alfabetica_az' | 'alfabetica_za' | 'total_desc' | 'total_asc';

type AlunoComPag = {
  aluno: string;
  linha: number;
  modalidade: string;
  diaVencimento: number | null;
  pagamentos: PagamentoPlanilha[];
  totalValor: number;
  dataMaisRecente: string;
};

const CORES_MODALIDADE = [
  'border-l-indigo-500 bg-indigo-50/40',
  'border-l-violet-500 bg-violet-50/40',
  'border-l-fuchsia-500 bg-fuchsia-50/30',
  'border-l-rose-500 bg-rose-50/30',
  'border-l-amber-500 bg-amber-50/40',
  'border-l-emerald-500 bg-emerald-50/40',
  'border-l-cyan-500 bg-cyan-50/40',
  'border-l-orange-500 bg-orange-50/40',
];

export function PagamentosPlanilhaPage() {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const [ano, setAno] = useState(2026);
  const [data, setData] = useState<PagamentosPorAba[] | null>(null);
  const [abaSelecionada, setAbaSelecionada] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mesFiltro, setMesFiltro] = useState<number | 'todos'>(ano === currentYear ? currentMonth : 'todos');
  const [filtroModalidade, setFiltroModalidade] = useState<string>('todas');
  const [buscaAluno, setBuscaAluno] = useState('');
  const [ordenacaoAlunos, setOrdenacaoAlunos] = useState<OrdenacaoAlunos>('aluno_az');
  const [ordenacaoModalidades, setOrdenacaoModalidades] = useState<OrdenacaoModalidades>('alfabetica_az');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await getPagamentosPlanilhaTodasAbas(ano);
        if (cancelled) return;
        setData(res.abas ?? []);
        if (!abaSelecionada && res.abas && res.abas.length) setAbaSelecionada(res.abas[0].aba);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ano]);

  const abaAtual = useMemo(() => {
    if (!data || !abaSelecionada) return null;
    return data.find((a) => a.aba === abaSelecionada) ?? null;
  }, [data, abaSelecionada]);

  const ehDanca = abaAtual ? isAbaBylaDanca(abaAtual.aba) : false;

  const listaModalidadesOpcoes = useMemo(() => {
    if (!abaAtual) return [];
    const set = new Set<string>();
    for (const a of abaAtual.alunos ?? []) {
      const m = (a.modalidade ?? abaAtual.aba).trim();
      if (m) set.add(m);
    }
    return Array.from(set).sort((x, y) => x.localeCompare(y, 'pt-BR'));
  }, [abaAtual]);

  useEffect(() => {
    setFiltroModalidade('todas');
    setBuscaAluno('');
  }, [abaSelecionada]);

  // Opção B:
  // - ano atual => inicia/mantém filtro no mês atual
  // - ano diferente => inicia/mantém em "todos"
  useEffect(() => {
    setMesFiltro(ano === currentYear ? currentMonth : 'todos');
  }, [ano, currentMonth, currentYear]);

  const blocosOrdenados = useMemo(() => {
    if (!abaAtual) return [] as { modalidade: string; alunos: AlunoComPag[]; totalMod: number }[];

    const q = buscaAluno.trim().toLowerCase();
    const map: Record<string, AlunoComPag[]> = {};

    for (const a of abaAtual.alunos ?? []) {
      // Quando o usuário escolhe um "Mês", consideramos a competência (coluna do calendário na planilha),
      // não necessariamente o mês/ano real da data digitada.
      const pagamentosFiltrados =
        mesFiltro === 'todos'
          ? a.pagamentos
          : a.pagamentos.filter((p) => (p.mesCompetencia ?? p.mes) === mesFiltro);
      if (!pagamentosFiltrados.length) continue;
      const mod = (a.modalidade ?? abaAtual.aba).trim();
      if (filtroModalidade !== 'todas' && mod !== filtroModalidade) continue;
      if (q && !a.aluno.toLowerCase().includes(q)) continue;

      const totalValor = pagamentosFiltrados.reduce((s, p) => s + p.valor, 0);
      const sortedPag = [...pagamentosFiltrados].sort((x, y) => x.data.localeCompare(y.data));
      const dataMaisRecente = sortedPag[sortedPag.length - 1]?.data ?? '';

      if (!map[mod]) map[mod] = [];
      map[mod].push({
        aluno: a.aluno,
        linha: a.linha,
        modalidade: mod,
        diaVencimento: a.diaVencimento ?? null,
        pagamentos: sortedPag,
        totalValor,
        dataMaisRecente,
      });
    }

    const cmpAlunos = (A: AlunoComPag, B: AlunoComPag) => {
      switch (ordenacaoAlunos) {
        case 'aluno_za':
          return B.aluno.localeCompare(A.aluno, 'pt-BR');
        case 'valor_desc':
          return B.totalValor - A.totalValor;
        case 'valor_asc':
          return A.totalValor - B.totalValor;
        case 'data_recente':
          return B.dataMaisRecente.localeCompare(A.dataMaisRecente);
        case 'data_antiga':
          return A.dataMaisRecente.localeCompare(B.dataMaisRecente);
        case 'linha':
          return A.linha - B.linha;
        case 'aluno_az':
        default:
          return A.aluno.localeCompare(B.aluno, 'pt-BR');
      }
    };

    let entries = Object.entries(map).map(([modalidade, alunos]) => {
      const sorted = [...alunos].sort(cmpAlunos);
      const totalMod = sorted.reduce((s, x) => s + x.totalValor, 0);
      return { modalidade, alunos: sorted, totalMod };
    });

    switch (ordenacaoModalidades) {
      case 'alfabetica_za':
        entries.sort((a, b) => b.modalidade.localeCompare(a.modalidade, 'pt-BR'));
        break;
      case 'total_desc':
        entries.sort((a, b) => b.totalMod - a.totalMod);
        break;
      case 'total_asc':
        entries.sort((a, b) => a.totalMod - b.totalMod);
        break;
      case 'alfabetica_az':
      default:
        entries.sort((a, b) => a.modalidade.localeCompare(b.modalidade, 'pt-BR'));
        break;
    }

    return entries;
  }, [abaAtual, mesFiltro, filtroModalidade, buscaAluno, ordenacaoAlunos, ordenacaoModalidades]);

  const totalPorAba = useMemo(() => {
    if (!abaAtual) return { alunos: 0, valor: 0 };
    const alunosUnicos = new Set<string>();
    let total = 0;
    for (const bloco of blocosOrdenados) {
      for (const a of bloco.alunos) {
        alunosUnicos.add(a.aluno);
        total += a.totalValor;
      }
    }
    return { alunos: alunosUnicos.size, valor: total };
  }, [abaAtual, blocosOrdenados]);

  return (
    <div className="p-6">
      <Topbar
        title="Pagamentos por planilha"
        subtitle="Conferência por aba, aluno e modalidade (datas, formas e valores)."
      />

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Ano</label>
          <select value={ano} onChange={(e) => setAno(Number(e.target.value))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            {[2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        {abaAtual && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Mês (competência)</label>
            <select
              value={mesFiltro === 'todos' ? 'todos' : String(mesFiltro)}
              onChange={(e) => {
                const v = e.target.value;
                setMesFiltro(v === 'todos' ? 'todos' : Number(v));
              }}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="todos">Todos</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                <option key={m} value={m}>
                  {m.toString().padStart(2, '0')}
                </option>
              ))}
            </select>
            <p className="mt-1.5 max-w-md text-[11px] leading-snug text-gray-500">
              Filtra pela <span className="font-medium">competência</span> (mês da coluna do calendário na planilha). Alunos que só têm pagamento em um mês não aparecem se outro mês estiver selecionado — use{' '}
              <span className="font-medium">Todos</span> ou o mês do lançamento.
            </p>
          </div>
        )}

        {abaAtual && listaModalidadesOpcoes.length > 1 && (
          <div className="min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Modalidade</label>
            <select
              value={filtroModalidade}
              onChange={(e) => setFiltroModalidade(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="todas">Todas</option>
              {listaModalidadesOpcoes.map((m) => (
                <option key={m} value={m}>
                  {m.length > 48 ? `${m.slice(0, 45)}…` : m}
                </option>
              ))}
            </select>
          </div>
        )}

        {abaAtual && (
          <div className="min-w-[180px] flex-1 max-w-xs">
            <label className="block text-xs font-medium text-gray-500 mb-1">Buscar aluno</label>
            <input
              type="search"
              placeholder="Nome…"
              value={buscaAluno}
              onChange={(e) => setBuscaAluno(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        )}

        {abaAtual && (
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Ordenar alunos</label>
              <select
                value={ordenacaoAlunos}
                onChange={(e) => setOrdenacaoAlunos(e.target.value as OrdenacaoAlunos)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm min-w-[200px]"
              >
                <option value="aluno_az">Aluno (A → Z)</option>
                <option value="aluno_za">Aluno (Z → A)</option>
                <option value="valor_desc">Valor total (maior primeiro)</option>
                <option value="valor_asc">Valor total (menor primeiro)</option>
                <option value="data_recente">Data pagamento (mais recente)</option>
                <option value="data_antiga">Data pagamento (mais antiga)</option>
                <option value="linha">Linha na planilha</option>
              </select>
            </div>

            {listaModalidadesOpcoes.length > 1 && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Ordenar seções</label>
                <select
                  value={ordenacaoModalidades}
                  onChange={(e) => setOrdenacaoModalidades(e.target.value as OrdenacaoModalidades)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm min-w-[200px]"
                >
                  <option value="alfabetica_az">Modalidade (A → Z)</option>
                  <option value="alfabetica_za">Modalidade (Z → A)</option>
                  <option value="total_desc">Total da modalidade (maior)</option>
                  <option value="total_asc">Total da modalidade (menor)</option>
                </select>
              </div>
            )}
          </div>
        )}
      </div>

      {error && <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{error}</div>}

      {data && data.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {data.map((a) => (
            <button
              key={a.aba}
              type="button"
              onClick={() => setAbaSelecionada(a.aba)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                abaSelecionada === a.aba ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {a.aba}
            </button>
          ))}
        </div>
      )}

      {!loading && abaAtual && (
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="text-xs font-medium text-gray-500">Aba selecionada</div>
            <div className="mt-1 text-lg font-semibold text-gray-900">{abaAtual.aba}</div>
            <div className="mt-1 text-xs text-gray-500">Ano {ano}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="text-xs font-medium text-gray-500">Alunos (filtro atual)</div>
            <div className="mt-1 text-2xl font-semibold text-indigo-600">{totalPorAba.alunos}</div>
            <div className="mt-1 text-xs text-gray-500">{mesFiltro === 'todos' ? 'Todos os meses' : `Mês ${String(mesFiltro).padStart(2, '0')}`}</div>
            {buscaAluno ? <div className="mt-0.5 text-[12px] text-gray-500"> · busca ativa</div> : null}
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="text-xs font-medium text-gray-500">Total (filtro atual)</div>
            <div className="mt-1 text-2xl font-semibold text-emerald-600">{formatCurrency(totalPorAba.valor)}</div>
            <div className="mt-1 text-xs text-gray-500">Soma dos valores exibidos</div>
          </div>
        </div>
      )}

      {loading && <div className="mt-6 space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />)}</div>}

      {!loading && abaAtual && (
        <div className="mt-6 space-y-8">
          {blocosOrdenados.length === 0 && (
            <p className="text-sm text-gray-600">
              Nenhum pagamento com os filtros atuais.
              {mesFiltro !== 'todos' ? (
                <>
                  {' '}
                  Se o aluno só tem lançamento em outro mês de competência, escolha esse mês ou <span className="font-medium">Todos</span>.
                </>
              ) : null}
            </p>
          )}
          {blocosOrdenados.map((bloco, idx) => {
            const corParts = CORES_MODALIDADE[idx % CORES_MODALIDADE.length].split(/\s+/);
            const borderAccent = corParts[0] ?? 'border-l-gray-400';
            const headerTint = corParts[1] ?? 'bg-gray-50';
            const destacado = ehDanca && listaModalidadesOpcoes.length > 1;
            return (
              <section
                key={bloco.modalidade}
                className={`rounded-xl shadow-sm border border-gray-200 overflow-hidden bg-white ${
                  destacado ? `border-l-4 ${borderAccent}` : ''
                }`}
              >
                <div
                  className={`px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2 ${
                    destacado ? headerTint : 'bg-gray-50'
                  }`}
                >
                  <div>
                    <h2 className="text-base font-bold text-gray-900 leading-tight">{bloco.modalidade}</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {bloco.alunos.length} aluno(s) · Total {formatCurrency(bloco.totalMod)}
                    </p>
                  </div>
                  {ehDanca && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600 bg-indigo-100 px-2 py-1 rounded">
                      Dança
                    </span>
                  )}
                </div>
                <div className="p-4 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-left text-gray-500 font-medium">
                        <th className="py-2 pr-2">Aluno</th>
                        <th className="py-2 pr-2">Linha</th>
                        <th className="py-2 pr-2">Venc.</th>
                        <th className="py-2 pr-2">Data</th>
                        <th className="py-2 pr-2">Forma</th>
                        <th className="py-2 pr-2 text-right">Valor</th>
                        <th className="py-2 pr-2 text-right">Mês</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bloco.alunos.map((a) =>
                        a.pagamentos.map((p, idx2) => (
                          <tr key={`${a.aluno}-${a.linha}-${p.data}-${idx2}`} className="border-b border-gray-100 hover:bg-gray-50/80">
                            <td className="py-1.5 pr-2 font-medium text-gray-800">{a.aluno}</td>
                            <td className="py-1.5 pr-2 text-gray-400">{a.linha}</td>
                            <td className="py-1.5 pr-2 text-gray-600 whitespace-nowrap">
                              {a.diaVencimento != null ? `${a.diaVencimento} (dia)` : '—'}
                            </td>
                            <td className="py-1.5 pr-2 whitespace-nowrap">{p.data}</td>
                            <td className="py-1.5 pr-2">{p.forma || '—'}</td>
                            <td className="py-1.5 pr-2 text-right tabular-nums">{formatCurrency(p.valor)}</td>
                            <td className="py-1.5 pr-2 text-right">{String((p.mesCompetencia ?? p.mes)).padStart(2, '0')}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

