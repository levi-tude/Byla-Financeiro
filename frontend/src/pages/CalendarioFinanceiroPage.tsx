import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Topbar } from '../app/Topbar';
import {
  createValidacaoVinculo,
  deleteValidacaoVinculo,
  getCalendarioFinanceiro,
  getValidacaoPagamentosDiaria,
  getValidacaoVinculos,
  type CalendarioFinanceiroDia,
  type ValidacaoDiariaBancoItem,
  type ValidacaoDiariaPlanilhaItem,
} from '../services/backendApi';
import {
  AVISO_COMPETENCIA_DIFERENTE,
  competenciaAlinhaComDataPagamento,
  labelCompetenciaMesAno,
} from '../utils/competenciaPagamento';

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
function statusLabel(status: 'pendente' | 'ok' | 'atencao' | 'divergente'): string {
  if (status === 'ok') return 'OK';
  if (status === 'atencao') return 'Atenção';
  if (status === 'divergente') return 'Divergente';
  return 'Pendente';
}

function statusClass(status: 'pendente' | 'ok' | 'atencao' | 'divergente'): string {
  if (status === 'ok') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (status === 'atencao') return 'bg-amber-100 text-amber-900 border-amber-200';
  if (status === 'divergente') return 'bg-rose-100 text-rose-900 border-rose-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function monthTitle(mes: number, ano: number): string {
  return new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

/** Grade calendário: semana começa na segunda. Células `null` = vazio. */
function buildCalendarSlots(mes: number, ano: number, diasMap: Map<string, CalendarioFinanceiroDia>): (CalendarioFinanceiroDia | null)[] {
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const primeiro = new Date(ano, mes - 1, 1);
  const jsWeekday = primeiro.getDay(); // 0 dom
  const offsetMon = jsWeekday === 0 ? 6 : jsWeekday - 1;
  const slots: (CalendarioFinanceiroDia | null)[] = [];
  for (let i = 0; i < offsetMon; i++) slots.push(null);
  for (let d = 1; d <= ultimoDia; d++) {
    const data = `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    slots.push(diasMap.get(data) ?? null);
  }
  while (slots.length % 7 !== 0) slots.push(null);
  return slots;
}

export function CalendarioFinanceiroPage() {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<Awaited<ReturnType<typeof getCalendarioFinanceiro>> | null>(null);
  const [modalDia, setModalDia] = useState<CalendarioFinanceiroDia | null>(null);
  const [selectedDias, setSelectedDias] = useState<string[]>([]);
  const [lastDiaClicado, setLastDiaClicado] = useState<string | null>(null);
  const [savingVinculo, setSavingVinculo] = useState(false);
  const [loadingModalData, setLoadingModalData] = useState(false);
  const [vinculosDia, setVinculosDia] = useState<Array<{ banco_id: string; planilha_id: string }>>([]);
  const [possiveisDia, setPossiveisDia] = useState<
    Array<{ planilha: ValidacaoDiariaPlanilhaItem; candidatos: ValidacaoDiariaBancoItem[] }>
  >([]);
  const [possiveisCache, setPossiveisCache] = useState<
    Record<string, Array<{ planilha: ValidacaoDiariaPlanilhaItem; candidatos: ValidacaoDiariaBancoItem[] }>>
  >({});
  const [draftBancoPorPlanilha, setDraftBancoPorPlanilha] = useState<Record<string, string>>({});
  const [modalNotice, setModalNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await getCalendarioFinanceiro(mes, ano);
      setPayload(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [mes, ano]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    // Mudou mês/ano: zera a seleção e fecha modal para evitar inconsistência.
    setSelectedDias([]);
    setModalDia(null);
  }, [mes, ano]);

  const diasMap = useMemo(() => {
    const m = new Map<string, CalendarioFinanceiroDia>();
    for (const d of payload?.dias ?? []) m.set(d.data, d);
    return m;
  }, [payload]);

  const selectedSet = useMemo(() => new Set(selectedDias), [selectedDias]);

  const todosDiasMesOrdenados = useMemo(() => {
    return (payload?.dias ?? []).map((d) => d.data).sort();
  }, [payload]);

  const toggleDiaSelecionado = (data: string) => {
    setSelectedDias((prev) => (prev.includes(data) ? prev.filter((d) => d !== data) : [...prev, data]));
  };

  const handleDiaClick = (data: string, e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
    const ctrl = e.ctrlKey || e.metaKey;
    setLastDiaClicado(data);

    // Shift: seleciona intervalo entre último clique e o clique atual.
    if (e.shiftKey && lastDiaClicado) {
      const min = lastDiaClicado < data ? lastDiaClicado : data;
      const max = lastDiaClicado < data ? data : lastDiaClicado;
      const range = todosDiasMesOrdenados.filter((d) => d >= min && d <= max);
      if (ctrl) {
        // Ctrl+Shift => união (não apaga o que já estava selecionado)
        setSelectedDias((prev) => Array.from(new Set([...prev, ...range])));
      } else {
        // Shift puro => substitui seleção pelo intervalo
        setSelectedDias(range);
      }
      return;
    }

    // Ctrl: toggle do dia (sem limpar o resto)
    if (ctrl) {
      toggleDiaSelecionado(data);
      return;
    }

    // Clique normal: toggle (mantém a seleção multi-dia como você pediu)
    toggleDiaSelecionado(data);
  };

  const totaisSelecionados = useMemo(() => {
    if (!payload) return null;
    let totalBanco = 0;
    let totalPlanilha = 0;
    let qtdMovBanco = 0;
    let qtdMovPlanilha = 0;
    for (const data of selectedDias) {
      const dia = diasMap.get(data);
      if (!dia) continue;
      totalBanco += dia.banco.total;
      totalPlanilha += dia.planilha.total;
      qtdMovBanco += dia.banco.quantidade;
      qtdMovPlanilha += dia.planilha.quantidade;
    }
    return {
      totalBanco,
      totalPlanilha,
      qtdMovBanco,
      qtdMovPlanilha,
      nDiasSelecionados: selectedDias.length,
    };
  }, [payload, selectedDias, diasMap]);

  const selecionarMesInteiro = () => {
    if (!payload) return;
    setSelectedDias(payload.dias.map((d) => d.data));
  };

  const slots = useMemo(() => buildCalendarSlots(mes, ano, diasMap), [mes, ano, diasMap]);

  const candidatosDia = useMemo(() => {
    const vinculadas = new Set(vinculosDia.map((x) => x.planilha_id));
    return possiveisDia.filter((x) => !vinculadas.has(x.planilha.id));
  }, [possiveisDia, vinculosDia]);

  const vinculosDetalhados = useMemo(() => {
    if (!modalDia) return [] as Array<{ planilha: ValidacaoDiariaPlanilhaItem; banco: ValidacaoDiariaBancoItem | null }>;
    const planilhaById = new Map(modalDia.planilha.itens.map((p) => [p.id, p]));
    const bancoById = new Map(modalDia.banco.itens.map((b) => [b.id, b]));
    return vinculosDia
      .map((v) => {
        const planilha = planilhaById.get(v.planilha_id);
        if (!planilha) return null;
        return { planilha, banco: bancoById.get(v.banco_id) ?? null };
      })
      .filter((x): x is { planilha: ValidacaoDiariaPlanilhaItem; banco: ValidacaoDiariaBancoItem | null } => Boolean(x));
  }, [modalDia, vinculosDia]);

  useEffect(() => {
    if (!modalDia) {
      setVinculosDia([]);
      setPossiveisDia([]);
      setDraftBancoPorPlanilha({});
      setModalNotice(null);
      setLoadingModalData(false);
      return;
    }
    const dataDia = modalDia.data;
    let cancelled = false;
    async function loadModalData() {
      try {
        setLoadingModalData(true);
        const key = `${dataDia}::${mes}::${ano}`;
        const carregadoCache = possiveisCache[key];
        const [v, valid] = await Promise.all([
          getValidacaoVinculos(dataDia, mes, ano),
          carregadoCache ? Promise.resolve(null) : getValidacaoPagamentosDiaria(dataDia, 'TODAS'),
        ]);
        if (cancelled) return;
        const vinculos = v.itens.map((x) => ({ banco_id: x.banco_id, planilha_id: x.planilha_id }));
        setVinculosDia(vinculos);
        if (carregadoCache) {
          setPossiveisDia(carregadoCache);
        } else if (valid) {
          setPossiveisDia(valid.validacao.itens_possivel_match);
          setPossiveisCache((prev) => ({ ...prev, [key]: valid.validacao.itens_possivel_match }));
        } else {
          setPossiveisDia([]);
        }
      } catch {
        if (cancelled) return;
        setVinculosDia([]);
        setPossiveisDia([]);
      } finally {
        if (!cancelled) setLoadingModalData(false);
      }
    }
    loadModalData();
    return () => {
      cancelled = true;
    };
  }, [modalDia, mes, ano, possiveisCache]);

  const criarVinculo = async (planilhaId: string, bancoId: string) => {
    if (!modalDia || !bancoId) return;
    setSavingVinculo(true);
    setError(null);
    setModalNotice(null);
    try {
      await createValidacaoVinculo(modalDia.data, mes, ano, bancoId, [planilhaId]);
      await load();
      setVinculosDia((prev) => {
        const semEste = prev.filter((x) => x.planilha_id !== planilhaId);
        return [...semEste, { banco_id: bancoId, planilha_id: planilhaId }];
      });
      setDraftBancoPorPlanilha((prev) => {
        const next = { ...prev };
        delete next[planilhaId];
        return next;
      });
      setModalNotice('Vínculo salvo com sucesso.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setModalNotice('Não foi possível salvar o vínculo.');
    } finally {
      setSavingVinculo(false);
    }
  };

  const removerVinculo = async (planilhaId: string) => {
    if (!modalDia) return;
    setSavingVinculo(true);
    setError(null);
    setModalNotice(null);
    try {
      await deleteValidacaoVinculo(planilhaId);
      await load();
      setVinculosDia((prev) => prev.filter((x) => x.planilha_id !== planilhaId));
      setModalNotice('Vínculo removido.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setModalNotice('Não foi possível remover o vínculo.');
    } finally {
      setSavingVinculo(false);
    }
  };

  return (
    <div className="p-6">
      <Topbar
        title="Calendário financeiro"
        subtitle="Por dia: entradas no banco (oficiais) vs pagamentos na planilha FLUXO BYLA pela data de pagamento."
      />

      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
        <strong className="text-slate-900">Legenda de status:</strong>{' '}
        <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5">OK</span> conferido ·{' '}
        <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5">Atenção</span> revisar ·{' '}
        <span className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5">Divergente</span> planilha × banco · passe o mouse no dia para detalhes.
      </div>

      <div className="mt-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Mês</label>
          <select
            value={mes}
            onChange={(e) => setMes(Number(e.target.value))}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm min-w-[160px]"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {new Date(2000, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long' })}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Ano</label>
          <input
            type="number"
            min={2000}
            max={2100}
            value={ano}
            onChange={(e) => setAno(Number(e.target.value) || ano)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-28"
          />
        </div>
        <button
          type="button"
          onClick={load}
          className="px-4 py-2 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
        >
          Atualizar
        </button>
      </div>

      {payload && !loading && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 max-w-3xl">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Seleção por clique (como galeria)</h3>
          <p className="text-xs text-gray-500 mb-3">
            Clique nos dias do calendário para adicionar/remover da seleção. A soma do banco (oficial) e da planilha (pela data de
            pagamento) atualiza em tempo real.
          </p>

          <div className="flex flex-wrap items-end gap-3 mb-3">
            <div>
              <div className="text-xs text-gray-500 mb-1">Dias selecionados</div>
              <div className="text-lg font-semibold text-gray-900 tabular-nums">{selectedDias.length}</div>
            </div>
            <button
              type="button"
              className="px-3 py-2 text-xs rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700"
              onClick={selecionarMesInteiro}
            >
              Selecionar mês inteiro
            </button>
            <button
              type="button"
              className="px-3 py-2 text-xs rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-50"
              onClick={() => setSelectedDias([])}
              disabled={selectedDias.length === 0}
            >
              Limpar
            </button>
          </div>

          {totaisSelecionados && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-sky-200 bg-sky-50/80 p-3">
                <div className="text-[11px] text-sky-800 font-medium">Banco (oficial) — soma selecionada</div>
                <div className="text-lg font-semibold text-sky-900 mt-0.5 tabular-nums">{formatCurrency(totaisSelecionados.totalBanco)}</div>
                <div className="text-[11px] text-sky-700 mt-1">{totaisSelecionados.qtdMovBanco} lançamento(s) no extrato</div>
              </div>
              <div className="rounded-lg border border-indigo-200 bg-indigo-50/80 p-3">
                <div className="text-[11px] text-indigo-800 font-medium">Planilha — soma selecionada (data pagamento)</div>
                <div className="text-lg font-semibold text-indigo-900 mt-0.5 tabular-nums">{formatCurrency(totaisSelecionados.totalPlanilha)}</div>
                <div className="text-[11px] text-indigo-700 mt-1">{totaisSelecionados.qtdMovPlanilha} pagamento(s) na planilha</div>
              </div>
            </div>
          )}

          {selectedDias.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedDias
                .slice()
                .sort()
                .map((data) => {
                  const label = (() => {
                    const [, m, d] = data.split('-');
                    return `${d}/${m}`;
                  })();
                  return (
                    <button
                      key={data}
                      type="button"
                      onClick={() => toggleDiaSelecionado(data)}
                      className="text-[11px] px-2 py-1 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
                      title={`Remover ${data}`}
                    >
                      {label} ×
                    </button>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {payload?.planilha_aviso && (
        <div className="mt-3 p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-sm">
          Planilha: {payload.planilha_aviso}
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 text-sm">{error}</div>
      )}

      {payload && !loading && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 max-w-lg">
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
            <div className="text-xs text-sky-800 font-medium">Total entradas (banco) no mês</div>
            <div className="text-xl font-semibold text-sky-900">{formatCurrency(payload.totais_mes.banco)}</div>
          </div>
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
            <div className="text-xs text-indigo-800 font-medium">Total planilha (data pagamento) no mês</div>
            <div className="text-xl font-semibold text-indigo-900">{formatCurrency(payload.totais_mes.planilha)}</div>
          </div>
        </div>
      )}
      {payload?.status_contagem && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="px-2 py-1 rounded border bg-gray-50 border-gray-200">Pendente: {payload.status_contagem.pendente}</span>
          <span className="px-2 py-1 rounded border bg-emerald-50 border-emerald-200 text-emerald-800">OK: {payload.status_contagem.ok}</span>
          <span className="px-2 py-1 rounded border bg-amber-50 border-amber-200 text-amber-800">Atenção: {payload.status_contagem.atencao}</span>
          <span className="px-2 py-1 rounded border bg-rose-50 border-rose-200 text-rose-800">Divergente: {payload.status_contagem.divergente}</span>
        </div>
      )}

      <h2 className="mt-6 text-lg font-semibold text-gray-900 capitalize">{monthTitle(mes, ano)}</h2>

      {loading && (
        <div className="mt-4 grid grid-cols-7 gap-2">
          {Array.from({ length: 28 }).map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {!loading && payload && (
        <div className="mt-3 overflow-x-auto">
          <div className="grid grid-cols-7 gap-1.5 min-w-[640px]">
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-center text-[11px] font-semibold text-gray-500 py-1">
                {w}
              </div>
            ))}
            {slots.map((cell, idx) => {
              if (!cell) {
                return <div key={`e-${idx}`} className="min-h-[100px] rounded-lg bg-gray-50/80 border border-transparent" />;
              }
              const { data, banco, planilha } = cell;
              const dayNum = Number(data.slice(8, 10));
              const isToday =
                data ===
                `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
              const selecionado = selectedSet.has(data);
              return (
                <div
                  key={data}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleDiaClick(data, { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey });
                    }
                  }}
                  onClick={(e) => handleDiaClick(data, { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey })}
                  className={`min-h-[100px] rounded-lg border p-1.5 flex flex-col gap-1 cursor-pointer select-none ${
                    selecionado ? 'border-byla-red bg-red-50/40 ring-2 ring-byla-red/20' : isToday ? 'border-byla-red bg-red-50/20' : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="text-xs font-bold text-gray-700">{dayNum}</div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${statusClass(cell.validacao.status_final)}`}>
                      {statusLabel(cell.validacao.status_final)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setModalDia(cell)}
                    className="text-left text-[10px] leading-tight rounded px-1 py-0.5 bg-sky-100 hover:bg-sky-200 text-sky-900 border border-sky-200"
                  >
                    <span className="block text-sky-700 font-medium">Banco</span>
                    <span className="font-semibold">{formatCurrency(banco.total)}</span>
                    {banco.quantidade > 0 && <span className="text-sky-600"> ({banco.quantidade})</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalDia(cell)}
                    className="text-left text-[10px] leading-tight rounded px-1 py-0.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-900 border border-indigo-200"
                  >
                    <span className="block text-indigo-700 font-medium">Planilha</span>
                    <span className="font-semibold">{formatCurrency(planilha.total)}</span>
                    {planilha.quantidade > 0 && <span className="text-indigo-600"> ({planilha.quantidade})</span>}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {modalDia && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cal-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalDia(null);
          }}
        >
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-gray-200">
            <div className="px-4 py-3 border-b bg-gray-50 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 id="cal-modal-title" className="font-semibold text-gray-900">
                  Detalhes — {modalDia.data}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Clique em &quot;Validação deste dia&quot; para conferir banco × planilha.
                </p>
                <div className="mt-1 text-[11px] text-gray-600">
                  Status do dia: <b>{statusLabel(modalDia.validacao.status_final)}</b> · Planilhas vinculadas:{' '}
                  <b>{modalDia.validacao.qtd_planilha_vinculada}</b>
                </div>
              </div>
              <div className="flex gap-2">
                <Link
                  to={`/validacao-pagamentos-diaria?data=${encodeURIComponent(modalDia.data)}`}
                  className="px-3 py-1.5 text-xs rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  Validação deste dia
                </Link>
                <button
                  type="button"
                  onClick={() => setModalDia(null)}
                  className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
                >
                  Fechar
                </button>
              </div>
            </div>
            <div className="p-4 overflow-y-auto space-y-5">
              <section className="border rounded-lg border-gray-200 bg-white p-3">
                <h4 className="text-xs font-semibold text-gray-700 mb-2">Vincular transações (1 banco ↔ N planilha)</h4>
                {modalNotice && <div className="mb-2 text-xs text-emerald-700">{modalNotice}</div>}
                {loadingModalData ? (
                  <p className="text-xs text-gray-500">Carregando possíveis matches...</p>
                ) : (
                  <>
                    {vinculosDetalhados.length > 0 && (
                      <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2">
                        <div className="text-[11px] text-emerald-800 font-medium mb-1">Já vinculadas neste dia ({vinculosDetalhados.length})</div>
                        <ul className="space-y-1">
                          {vinculosDetalhados.map((x) => (
                            <li key={x.planilha.id} className="text-[11px] text-emerald-900 flex items-center justify-between gap-2">
                              <span className="truncate">
                                {x.planilha.aluno} · {formatCurrency(x.planilha.valor)} · {x.banco?.pessoa || x.banco?.descricao || 'Banco não encontrado no dia'}
                              </span>
                              <button
                                type="button"
                                disabled={savingVinculo}
                                onClick={() => removerVinculo(x.planilha.id)}
                                className="px-2 py-1 rounded border border-emerald-300 bg-white hover:bg-emerald-100 disabled:opacity-50"
                              >
                                Desvincular
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {candidatosDia.length === 0 ? (
                      <p className="text-xs text-gray-500">Nenhum possível match para vincular neste dia.</p>
                    ) : (
                      <div className="space-y-2">
                        {candidatosDia.map((x) => {
                          const bancoIdSelecionado = draftBancoPorPlanilha[x.planilha.id] ?? '';
                          return (
                            <div key={x.planilha.id} className="rounded-lg border border-gray-200 p-2 bg-gray-50">
                              <div className="text-xs text-gray-700 mb-1">
                                <b>{x.planilha.aluno}</b> · {formatCurrency(x.planilha.valor)} · {x.planilha.modalidade}
                              </div>
                              <div className="flex flex-wrap gap-2 items-center">
                                <select
                                  value={bancoIdSelecionado}
                                  onChange={(e) =>
                                    setDraftBancoPorPlanilha((prev) => ({ ...prev, [x.planilha.id]: e.target.value }))
                                  }
                                  className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs min-w-[320px]"
                                >
                                  <option value="">Selecione lançamento do banco...</option>
                                  {x.candidatos.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {(c.pessoa || c.descricao || '(sem nome)')} · {formatCurrency(c.valor)} · {c.data}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  disabled={!bancoIdSelecionado || savingVinculo}
                                  onClick={() => criarVinculo(x.planilha.id, bancoIdSelecionado)}
                                  className="px-2.5 py-1.5 text-xs rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                                >
                                  Vincular
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </section>
              <div className="grid gap-6 md:grid-cols-2">
              <section>
                <h4 className="text-sm font-semibold text-sky-800 mb-2">Banco — entradas ({modalDia.banco.quantidade})</h4>
                {modalDia.banco.itens.length === 0 ? (
                  <>
                    <p className="text-sm text-gray-500">Nenhuma entrada neste dia.</p>
                    <div className="mt-3 pt-3 border-t border-sky-200 flex flex-wrap justify-between items-center gap-2 text-sm">
                      <span className="text-sky-800 font-medium">Total banco</span>
                      <span className="text-sky-950 font-bold tabular-nums">{formatCurrency(0)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <ul className="space-y-2 text-xs">
                      {modalDia.banco.itens.map((b) => (
                        <li key={b.id} className="rounded-lg border border-sky-100 bg-sky-50/50 p-2">
                          <div className="font-medium text-gray-900">{b.pessoa || '—'}</div>
                          <div className="text-gray-600">{b.descricao || '—'}</div>
                          <div className="text-sky-800 font-semibold mt-1">{formatCurrency(b.valor)}</div>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 pt-3 border-t border-sky-200 flex flex-wrap justify-between items-center gap-2 text-sm">
                      <span className="text-sky-800 font-medium">Total banco</span>
                      <span className="text-sky-950 font-bold tabular-nums">{formatCurrency(modalDia.banco.total)}</span>
                    </div>
                  </>
                )}
              </section>
              <section>
                <h4 className="text-sm font-semibold text-indigo-800 mb-2">Planilha — pagamentos ({modalDia.planilha.quantidade})</h4>
                {modalDia.planilha.itens.length === 0 ? (
                  <>
                    <p className="text-sm text-gray-500">Nenhum pagamento neste dia.</p>
                    <div className="mt-3 pt-3 border-t border-indigo-200 flex flex-wrap justify-between items-center gap-2 text-sm">
                      <span className="text-indigo-800 font-medium">Total planilha</span>
                      <span className="text-indigo-950 font-bold tabular-nums">{formatCurrency(0)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <ul className="space-y-2 text-xs">
                      {modalDia.planilha.itens.map((p) => (
                        <PlanilhaDetalheItem key={p.id} p={p} />
                      ))}
                    </ul>
                    <div className="mt-3 pt-3 border-t border-indigo-200 flex flex-wrap justify-between items-center gap-2 text-sm">
                      <span className="text-indigo-800 font-medium">Total planilha</span>
                      <span className="text-indigo-950 font-bold tabular-nums">{formatCurrency(modalDia.planilha.total)}</span>
                    </div>
                  </>
                )}
              </section>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlanilhaDetalheItem({ p }: { p: ValidacaoDiariaPlanilhaItem }) {
  const compLabel = labelCompetenciaMesAno(p.mesCompetencia, p.anoCompetencia);
  const alinha = competenciaAlinhaComDataPagamento(p.data, p.mesCompetencia, p.anoCompetencia);
  return (
    <li className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-2">
      <div className="font-medium text-gray-900">{p.aluno}</div>
      <div className="text-gray-600">
        {p.aba} · {p.modalidade} · linha {p.linha} · {p.forma || '—'}
      </div>
      <div className="text-gray-500 mt-0.5">Data pagamento: {p.data}</div>
      <div className="text-indigo-900 mt-1">
        Competência: <span className="font-medium">{compLabel}</span>
        {!alinha && (
          <span
            className="ml-1 inline-block rounded border border-amber-300 bg-amber-100 text-amber-900 px-1.5 py-0.5 text-[10px]"
            title={AVISO_COMPETENCIA_DIFERENTE}
          >
            Aviso: competência ≠ mês da data
          </span>
        )}
      </div>
      <div className="text-indigo-800 font-semibold mt-1">{formatCurrency(p.valor)}</div>
    </li>
  );
}
