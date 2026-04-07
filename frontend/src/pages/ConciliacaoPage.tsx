import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Topbar } from '../app/Topbar';
import { KpiCard } from '../components/ui/KpiCard';
import { useMonthYear } from '../context/MonthYearContext';
import {
  getConciliacaoVencimentos,
  type ConciliacaoVencimentoBancoStatus,
  type ConciliacaoVencimentoItem,
  type ConciliacaoVencimentoSituacao,
} from '../services/backendApi';

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL ?? '').trim();

function formatCurrency(value: number | null): string {
  if (value == null) return '–';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateBR(iso: string | null): string {
  if (!iso) return '–';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function rowClass(situacao: ConciliacaoVencimentoSituacao): string {
  switch (situacao) {
    case 'ok':
      return 'bg-emerald-50/80 border-l-4 border-emerald-500';
    case 'atrasado':
      return 'bg-amber-50/80 border-l-4 border-amber-500';
    case 'em_aberto':
      return 'bg-rose-50/80 border-l-4 border-rose-600';
    case 'a_vencer':
      return 'bg-sky-50/70 border-l-4 border-sky-500';
    case 'sem_vencimento':
    default:
      return 'bg-slate-50/50 border-l-4 border-slate-300';
  }
}

function labelSituacao(s: ConciliacaoVencimentoSituacao): string {
  const map: Record<ConciliacaoVencimentoSituacao, string> = {
    ok: 'Em dia (planilha)',
    atrasado: 'Pago com atraso (planilha)',
    em_aberto: 'Em atraso / não pago',
    a_vencer: 'A vencer',
    sem_vencimento: 'Sem vencimento na planilha',
  };
  return map[s] ?? s;
}

function labelBancoResumo(r: ConciliacaoVencimentoItem): { text: string; className: string } {
  if (!r.pago_na_planilha || r.banco_status === 'nao_aplicavel') {
    return { text: '—', className: 'text-gray-400' };
  }
  if (r.banco_confirmado) {
    return { text: 'Banco OK', className: 'text-emerald-700 font-semibold' };
  }
  if (r.banco_status === 'possivel') {
    return { text: 'Ambíguo', className: 'text-amber-700 font-medium' };
  }
  return { text: 'Sem no banco', className: 'text-rose-700 font-medium' };
}

export function ConciliacaoPage() {
  const { monthYear } = useMonthYear();
  const [nomeBusca, setNomeBusca] = useState('');
  const [filtroAba, setFiltroAba] = useState<'todas' | string>('todas');
  const [filtroModalidade, setFiltroModalidade] = useState<'todas' | string>('todas');
  const [filtroSituacao, setFiltroSituacao] = useState<ConciliacaoVencimentoSituacao | 'todos'>('todos');
  const [filtroBanco, setFiltroBanco] = useState<ConciliacaoVencimentoBancoStatus | 'todos'>('todos');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<Awaited<ReturnType<typeof getConciliacaoVencimentos>> | null>(null);
  const [abasExpandidas, setAbasExpandidas] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!BACKEND_URL) {
      setError('Configure VITE_BACKEND_URL para carregar a conciliação por vencimento.');
      setPayload(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getConciliacaoVencimentos(monthYear.mes, monthYear.ano)
      .then((r) => {
        if (!cancelled) setPayload(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [monthYear.mes, monthYear.ano]);

  const abasDisponiveis = useMemo(() => {
    const itens = payload?.itens ?? [];
    const set = new Set(itens.map((x) => x.aba).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [payload]);

  const abaEhDanca = useMemo(() => {
    if (filtroAba === 'todas') return false;
    const u = filtroAba.toUpperCase();
    return u.includes('DANCA') || u.includes('DANÇA');
  }, [filtroAba]);

  const modalidadesDisponiveis = useMemo(() => {
    const itens = payload?.itens ?? [];
    const base = filtroAba === 'todas' ? itens : itens.filter((x) => x.aba === filtroAba);
    const set = new Set(base.map((x) => x.modalidade).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [payload, filtroAba]);

  useEffect(() => {
    // Sempre que muda aba, reseta modalidade para evitar filtro "vazio".
    setFiltroModalidade('todas');
  }, [filtroAba]);

  const filtrados = useMemo(() => {
    const itens = payload?.itens ?? [];
    const q = nomeBusca.trim().toLowerCase();
    return itens.filter((r) => {
      if (filtroAba !== 'todas' && r.aba !== filtroAba) return false;
      if (filtroModalidade !== 'todas' && r.modalidade !== filtroModalidade) return false;
      if (filtroSituacao !== 'todos' && r.situacao !== filtroSituacao) return false;
      if (filtroBanco !== 'todos' && r.banco_status !== filtroBanco) return false;
      if (!q) return true;
      const aluno = (r.aluno ?? '').toLowerCase();
      const nomeCompleto = `${r.aluno} ${r.modalidade} ${r.aba}`.toLowerCase();
      return aluno.includes(q) || nomeCompleto.includes(q);
    });
  }, [payload, nomeBusca, filtroAba, filtroModalidade, filtroSituacao, filtroBanco]);

  const agrupadosPorAba = useMemo(() => {
    const map = new Map<string, ConciliacaoVencimentoItem[]>();
    for (const item of filtrados) {
      const arr = map.get(item.aba) ?? [];
      arr.push(item);
      map.set(item.aba, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  }, [filtrados]);

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const [abaNome] of agrupadosPorAba) {
      // Se uma aba específica está filtrada, abre ela por padrão.
      if (filtroAba !== 'todas') next[abaNome] = abaNome === filtroAba;
      else next[abaNome] = true;
    }
    setAbasExpandidas(next);
  }, [agrupadosPorAba, filtroAba]);

  const kpis = payload?.kpis;

  return (
    <div className="p-6">
      <Topbar
        title="Conciliação por vencimento"
        subtitle={`Vencimento na planilha (coluna VENC/DATA VENC/etc.) × pagamento lançado para a competência ${String(monthYear.mes).padStart(2, '0')}/${monthYear.ano}. Use o seletor de mês no topo.`}
      />

      {!BACKEND_URL && (
        <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
          Defina <code className="bg-amber-100 px-1 rounded">VITE_BACKEND_URL</code> no painel para habilitar esta tela.
        </div>
      )}

      {error && (
        <div className="mt-4 p-4 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-800">{error}</div>
      )}

      {payload?.aviso && (
        <div className="mt-4 p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-sm">{payload.aviso}</div>
      )}

      <div className="mt-4 flex flex-wrap gap-3 items-end">
        <div className="min-w-[200px]">
          <label className="block text-xs font-medium text-gray-500 mb-1">Pesquisar aluno (nome)</label>
          <input
            type="search"
            value={nomeBusca}
            onChange={(e) => setNomeBusca(e.target.value)}
            placeholder="Ex.: Maria Silva"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Aba</label>
          <select
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm min-w-[220px]"
            value={filtroAba}
            onChange={(e) => setFiltroAba(e.target.value)}
          >
            <option value="todas">Todas as abas</option>
            {abasDisponiveis.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Modalidade {abaEhDanca ? '(Dança)' : ''}
          </label>
          <select
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm min-w-[220px]"
            value={filtroModalidade}
            onChange={(e) => setFiltroModalidade(e.target.value)}
            disabled={filtroAba === 'todas'}
          >
            <option value="todas">Todas as modalidades</option>
            {modalidadesDisponiveis.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Situação</label>
          <select
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm min-w-[200px]"
            value={filtroSituacao}
            onChange={(e) => setFiltroSituacao(e.target.value as ConciliacaoVencimentoSituacao | 'todos')}
          >
            <option value="todos">Todas</option>
            <option value="ok">Em dia</option>
            <option value="atrasado">Pago com atraso</option>
            <option value="em_aberto">Em atraso / não pago</option>
            <option value="a_vencer">A vencer</option>
            <option value="sem_vencimento">Sem coluna de vencimento</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Banco</label>
          <select
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm min-w-[200px]"
            value={filtroBanco}
            onChange={(e) => setFiltroBanco(e.target.value as ConciliacaoVencimentoBancoStatus | 'todos')}
          >
            <option value="todos">Todos</option>
            <option value="ok">Banco OK</option>
            <option value="possivel">Ambíguo</option>
            <option value="nao">Sem no banco</option>
            <option value="nao_aplicavel">Não aplicável</option>
          </select>
        </div>
      </div>

      <p className="mt-3 text-xs text-gray-600 max-w-3xl">
        O <b>vencimento</b> é o dia do mês na planilha (ex.: 20 → todo dia 20). A competência é o mês do calendário de pagamentos.
        Tolerância após o vencimento para considerar &quot;em dia&quot;:{' '}
        <b>{payload?.tolerancia_dias ?? '—'} dia(s)</b>. Hoje (servidor): <b>{payload?.hoje ?? '—'}</b>. Coluna{' '}
        <b>Banco</b>: mesma regra da Validação (valor ± tolerância, nome/PIX/Pilates, janela ±7 dias da data do pagamento na planilha).
      </p>
      <p className="mt-1 text-xs text-gray-500">
        Dica: filtre primeiro por <b>Aba</b>; se for Dança, use também <b>Modalidade</b>; depois pesquise pelo nome do aluno.
      </p>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6 mt-4">
        <KpiCard label="Total alunos" value={String(kpis?.total ?? 0)} accentColor="primary" isLoading={loading} />
        <KpiCard label="Em dia" value={String(kpis?.ok ?? 0)} accentColor="success" isLoading={loading} />
        <KpiCard label="Pago atrasado" value={String(kpis?.atrasado ?? 0)} accentColor="primary" isLoading={loading} />
        <KpiCard label="Em atraso" value={String(kpis?.em_aberto ?? 0)} accentColor="danger" isLoading={loading} />
        <KpiCard label="A vencer" value={String(kpis?.a_vencer ?? 0)} accentColor="primary" isLoading={loading} />
        <KpiCard label="Sem venc." value={String(kpis?.sem_vencimento ?? 0)} accentColor="primary" isLoading={loading} />
      </div>
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6 mt-3">
        <KpiCard label="Banco OK" value={String(kpis?.banco_ok ?? '—')} accentColor="success" isLoading={loading} />
        <KpiCard label="Banco pendente" value={String(kpis?.banco_pendente ?? '—')} accentColor="danger" isLoading={loading} />
        <KpiCard label="Banco ambíguo" value={String(kpis?.banco_ambiguo ?? '—')} accentColor="primary" isLoading={loading} />
      </div>

      <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-800">Lista ({filtrados.length} registro(s))</h2>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-6 space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : filtrados.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">Nenhum registro para os filtros.</p>
          ) : (
            <div className="p-3 space-y-4">
              {agrupadosPorAba.map(([abaNome, itensAba]) => {
                const aberto = abasExpandidas[abaNome] ?? true;
                const qtdAtraso = itensAba.filter((x) => x.situacao === 'em_aberto' || x.situacao === 'atrasado').length;
                const qtdOk = itensAba.filter((x) => x.situacao === 'ok').length;
                const qtdAmbiguo = itensAba.filter((x) => x.banco_status === 'possivel').length;
                const modalidades = new Set(itensAba.map((x) => x.modalidade).filter(Boolean));
                return (
                <section key={abaNome} className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
                  <button
                    type="button"
                    onClick={() => setAbasExpandidas((prev) => ({ ...prev, [abaNome]: !aberto }))}
                    className="w-full px-4 py-3 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-wrap text-left">
                      <h3 className="text-sm font-semibold text-gray-900">{abaNome}</h3>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
                        {itensAba.length} aluno(s)
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                        {modalidades.size} categoria(s)
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                        {qtdOk} em dia
                      </span>
                      {qtdAtraso > 0 && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                          {qtdAtraso} atenção
                        </span>
                      )}
                      {qtdAmbiguo > 0 && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                          {qtdAmbiguo} ambíguo
                        </span>
                      )}
                    </div>
                    <span className="text-gray-500 text-sm">{aberto ? '▾' : '▸'}</span>
                  </button>

                  {aberto && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[1020px]">
                      <thead>
                        <tr className="border-b text-left text-gray-500 bg-gray-50/80">
                          <th className="py-2.5 px-3">Situação</th>
                          <th className="py-2.5 px-3">Modalidade</th>
                          <th className="py-2.5 px-3">Aluno</th>
                          <th className="py-2.5 px-3">Venc. (dia)</th>
                          <th className="py-2.5 px-3">Venc. no mês</th>
                          <th className="py-2.5 px-3">Pago (planilha)</th>
                          <th className="py-2.5 px-3 text-right">Valor</th>
                          <th className="py-2.5 px-3">Banco</th>
                          <th className="py-2.5 px-3">Atraso / prazo</th>
                          <th className="py-2.5 px-3">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itensAba.map((r, idx) => {
                          const bancoLbl = labelBancoResumo(r);
                          return (
                            <tr
                              key={`${r.aba}-${r.linha}-${r.aluno}-${idx}`}
                              className={`border-b border-gray-100 ${rowClass(r.situacao)} hover:bg-white/80 transition-colors`}
                              title={`${r.mensagem}\n${r.banco_mensagem ?? ''}`}
                            >
                              <td className="py-2 px-3 font-medium text-gray-900">{labelSituacao(r.situacao)}</td>
                              <td className="py-2 px-3">{r.modalidade}</td>
                              <td className="py-2 px-3 font-medium">{r.aluno}</td>
                              <td className="py-2 px-3">{r.dia_vencimento ?? '–'}</td>
                              <td className="py-2 px-3 whitespace-nowrap">{formatDateBR(r.data_vencimento_mes)}</td>
                              <td className="py-2 px-3 whitespace-nowrap">{r.pago_na_planilha ? formatDateBR(r.data_pagamento_planilha) : 'Não'}</td>
                              <td className="py-2 px-3 text-right tabular-nums">{formatCurrency(r.valor_pagamento_planilha)}</td>
                              <td className="py-2 px-3 text-xs align-top max-w-[140px]">
                                <div className={bancoLbl.className}>{bancoLbl.text}</div>
                                {r.pago_na_planilha && r.banco_status !== 'nao_aplicavel' && r.data_banco && (
                                  <div className="text-gray-600 mt-0.5 whitespace-nowrap">
                                    {formatDateBR(r.data_banco)}
                                    {r.pessoa_banco ? ` · ${r.pessoa_banco}` : ''}
                                  </div>
                                )}
                              </td>
                              <td className="py-2 px-3 text-xs text-gray-800 max-w-xs">
                                {r.situacao === 'em_aberto' && r.dias_em_atraso_hoje != null && (
                                  <span className="font-semibold text-rose-800">{r.dias_em_atraso_hoje} dia(s) em atraso</span>
                                )}
                                {r.situacao === 'a_vencer' && r.dias_para_vencimento != null && (
                                  <span className="text-sky-800">Faltam {r.dias_para_vencimento} dia(s) para o venc.</span>
                                )}
                                {r.situacao === 'atrasado' && r.dias_apos_vencimento_quando_pago != null && (
                                  <span className="text-amber-900">Pago {r.dias_apos_vencimento_quando_pago} dia(s) após o venc.</span>
                                )}
                                {r.situacao === 'ok' && <span className="text-emerald-800">Dentro da tolerância.</span>}
                                {r.situacao === 'sem_vencimento' && <span className="text-slate-600">—</span>}
                              </td>
                              <td className="py-2 px-3 whitespace-nowrap">
                                <Link
                                  to={`/validacao-pagamentos-diaria?data=${encodeURIComponent(linkData(r))}`}
                                  className="text-indigo-600 hover:underline text-xs font-medium"
                                >
                                  Validação
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  )}
                </section>
              )})}
            </div>
          )}
        </div>
        <div className="px-4 py-3 border-t bg-gray-50 text-xs text-gray-600">
          <p className="font-medium text-gray-700 mb-1">Legenda</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Verde: pagamento lançado na planilha para a competência, até {payload?.tolerancia_dias ?? '—'} dias após o vencimento.</li>
            <li>Âmbar: pagamento na planilha, mas após a tolerância.</li>
            <li>Vermelho: sem pagamento para a competência e já passou o vencimento.</li>
            <li>Azul: sem pagamento ainda, vencimento futuro.</li>
            <li>Cinza: não foi possível ler o dia de vencimento nesta linha.</li>
            <li>
              <span className="text-emerald-700 font-medium">Banco OK</span>: planilha × extrato (±7 dias), valor e nome alinhados à Validação.
            </li>
            <li>
              <span className="text-amber-700 font-medium">Ambíguo</span>: valor bate, mas há mais de um candidato ou nome incerto — conferir na Validação.
            </li>
            <li>
              <span className="text-rose-700 font-medium">Sem no banco</span>: nenhuma linha no extrato passou em valor+nome na janela.
            </li>
          </ul>
          <p className="mt-2">
            Dúvidas: use a{' '}
            <Link className="text-indigo-600 hover:underline" to="/validacao-pagamentos-diaria">
              Validação de pagamentos
            </Link>{' '}
            no dia do pagamento.
          </p>
        </div>
      </div>
    </div>
  );
}

function linkData(r: ConciliacaoVencimentoItem): string {
  if (r.data_pagamento_planilha) return r.data_pagamento_planilha.slice(0, 10);
  if (r.data_vencimento_mes) return r.data_vencimento_mes;
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
}
