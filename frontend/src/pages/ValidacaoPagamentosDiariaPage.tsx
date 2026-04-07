import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Topbar } from '../app/Topbar';
import {
  createValidacaoVinculo,
  deleteValidacaoVinculo,
  getPagamentosPlanilhaTodasAbas,
  getValidacaoVinculos,
  getValidacaoPagamentosDiaria,
  type PagamentosPorAba,
  type ValidacaoDiariaPlanilhaItem,
  type ValidacaoDiariaBancoItem,
  type ValidacaoPagamentosDiariaResponse,
} from '../services/backendApi';
import {
  AVISO_COMPETENCIA_DIFERENTE,
  competenciaAlinhaComDataPagamento,
  labelCompetenciaMesAno,
} from '../utils/competenciaPagamento';

/** Filtra por mês de competência (coluna do calendário na planilha) e recalcula totais da conciliação. */
function filtrarRespostaPorMesCompetencia(
  r: ValidacaoPagamentosDiariaResponse,
  mes: number | 'todos',
): ValidacaoPagamentosDiariaResponse {
  if (mes === 'todos') return r;
  const ok = (p: ValidacaoDiariaPlanilhaItem) => (p.mesCompetencia ?? 0) === mes;

  const itensPlan = r.planilha.itens.filter(ok);
  const totalPlan = itensPlan.reduce((s, x) => s + Number(x.valor || 0), 0);

  const itensConfirmados = r.validacao.itens_confirmados.filter((c) => ok(c.planilha));
  const itensNao = r.validacao.itens_nao_confirmados.filter(ok);
  const itensPossivel = r.validacao.itens_possivel_match.filter((x) => ok(x.planilha));

  const bancoMatchIds = new Set<string>();
  const bancoValorPorId = new Map<string, number>();
  for (const c of itensConfirmados) {
    bancoMatchIds.add(c.banco.id);
    bancoValorPorId.set(c.banco.id, Number(c.banco.valor || 0));
  }
  for (const x of itensPossivel) {
    for (const cand of x.candidatos) {
      bancoMatchIds.add(cand.id);
      if (!bancoValorPorId.has(cand.id)) bancoValorPorId.set(cand.id, Number(cand.valor || 0));
    }
  }
  const totalBancoMatch = Array.from(bancoMatchIds).reduce((s, id) => s + (bancoValorPorId.get(id) ?? 0), 0);
  const delta = totalPlan - totalBancoMatch;

  const qtd_confirmados = itensConfirmados.length;
  const qtd_nao = itensNao.length;
  const qtd_possivel = itensPossivel.length;
  const status_geral: 'ok' | 'atencao' | 'divergente' =
    qtd_nao > 0 ? 'divergente' : qtd_possivel > 0 ? 'atencao' : 'ok';

  return {
    ...r,
    planilha: {
      ...r.planilha,
      total: totalPlan,
      quantidade: itensPlan.length,
      itens: itensPlan,
    },
    banco: {
      ...r.banco,
      total: totalBancoMatch,
      quantidade: bancoMatchIds.size,
    },
    validacao: {
      ...r.validacao,
      status_geral,
      qtd_confirmados,
      qtd_nao_confirmados: qtd_nao,
      qtd_possivel_match: qtd_possivel,
      delta_total_planilha_menos_banco: delta,
      itens_confirmados: itensConfirmados,
      itens_nao_confirmados: itensNao,
      itens_possivel_match: itensPossivel,
    },
  };
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const VALOR_EPS = 0.02;
/** Só o ano civil atual na lista rápida (evita 3× chamadas à planilha). */
const ANO_PLANILHA_LISTA = () => new Date().getFullYear();
/** Máximo de datas na grade + prévia de status (menos = mais rápido). */
const MAX_DATAS_EXIBIDAS = 24;
const MAX_DATAS_STATUS_PREVIA = 8;
const PREFETCH_CONCORRENCIA = 4;
const STATUS_OPCOES: Array<{ value: 'pendente' | 'ok' | 'atencao' | 'divergente'; label: string }> = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'ok', label: 'OK' },
  { value: 'atencao', label: 'Atenção' },
  { value: 'divergente', label: 'Divergente' },
];

function statusLabel(status: 'pendente' | 'ok' | 'atencao' | 'divergente'): string {
  return STATUS_OPCOES.find((s) => s.value === status)?.label ?? status;
}

type StatusValidacaoDia = 'pendente' | 'ok' | 'atencao' | 'divergente';

type PossivelMatchRow = { planilha: ValidacaoDiariaPlanilhaItem; candidatos: ValidacaoDiariaBancoItem[] };

function chaveGrupoPossivel(row: PossivelMatchRow): string {
  const d = row.planilha.data.slice(0, 10);
  const ids = row.candidatos.map((c) => c.id).sort().join(',');
  return `${d}::${ids}`;
}

function agruparPossivelMatch(rows: PossivelMatchRow[]): PossivelMatchRow[][] {
  const map = new Map<string, PossivelMatchRow[]>();
  for (const x of rows) {
    const k = chaveGrupoPossivel(x);
    const arr = map.get(k) ?? [];
    arr.push(x);
    map.set(k, arr);
  }
  return Array.from(map.values());
}

function badgesGrupoPossivel(items: PossivelMatchRow[]): Array<{ label: string; title: string }> {
  const planilhas = items.map((x) => x.planilha);
  const n = planilhas.length;
  if (n < 2) return [];

  const sum = planilhas.reduce((s, p) => s + Number(p.valor || 0), 0);
  const alunos = new Set(planilhas.map((p) => p.aluno.trim().toLowerCase()));
  const modalidades = new Set(planilhas.map((p) => p.modalidade.trim()));
  const pagPix = planilhas.map((p) => (p.pagadorPix ?? '').trim()).filter(Boolean);
  const pagadorUnico = pagPix.length > 0 && new Set(pagPix).size === 1 ? pagPix[0] : null;

  const badges: Array<{ label: string; title: string }> = [];
  const cand = items[0].candidatos;

  if (cand.length === 1 && Math.abs(Number(cand[0].valor) - sum) <= VALOR_EPS) {
    badges.push({
      label: 'Soma → 1 no banco',
      title: `${n} linhas na planilha somam ${formatCurrency(sum)} e batem com uma única entrada de ${formatCurrency(
        Number(cand[0].valor),
      )} no banco. Confirme após conferir nomes e valores.`,
    });
  } else {
    badges.push({
      label: 'Mesmo candidato no banco',
      title:
        'Várias linhas compartilham o mesmo conjunto de lançamentos possíveis no extrato. Escolha um e confirme; o mesmo vínculo será aplicado a todas.',
    });
  }

  if (alunos.size === 1 && modalidades.size > 1) {
    badges.push({
      label: 'Várias modalidades',
      title: 'Mesmo aluno com mais de uma atividade no mesmo dia — um único PIX pode cobrir todas.',
    });
  }

  if (pagadorUnico && alunos.size > 1) {
    badges.push({
      label: 'Mesmo pagador (PIX)',
      title: `O pagador PIX é o mesmo para ${n} alunos diferentes: ${pagadorUnico}.`,
    });
  }

  return badges;
}

function monthYearLabel(isoDate: string): string {
  const [y, m] = isoDate.split('-');
  const month = Number(m);
  const year = Number(y);
  const label = new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function todayIsoLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Competência na planilha + aviso quando o mês de serviço ≠ mês da data de pagamento (o lançamento continua no dia da data). */
function CelulaCompetenciaPlanilha({ item }: { item: ValidacaoDiariaPlanilhaItem }) {
  const label = labelCompetenciaMesAno(item.mesCompetencia, item.anoCompetencia);
  const alinha = competenciaAlinhaComDataPagamento(item.data, item.mesCompetencia, item.anoCompetencia);
  return (
    <td className="py-1.5 pr-2 align-top max-w-[200px]">
      <div className="text-gray-800">{label}</div>
      {!alinha && (
        <div
          className="mt-1 text-[10px] leading-snug text-amber-900 bg-amber-50 border border-amber-200 rounded px-1.5 py-1"
          title={AVISO_COMPETENCIA_DIFERENTE}
        >
          <span className="font-semibold">Aviso (competência):</span> o serviço referente é de{' '}
          <span className="whitespace-nowrap">{label}</span>, diferente do mês da <b>data</b> de pagamento. O valor permanece
          neste dia pela data na planilha.
        </div>
      )}
    </td>
  );
}

export function ValidacaoPagamentosDiariaPage() {
  const [searchParams] = useSearchParams();
  const [data, setData] = useState(todayIsoLocal());
  const [dataBusca, setDataBusca] = useState('');
  const [aba, setAba] = useState('TODAS');
  const [modalidade, setModalidade] = useState('TODAS');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resposta, setResposta] = useState<ValidacaoPagamentosDiariaResponse | null>(null);
  const [pagamentosAno, setPagamentosAno] = useState<PagamentosPorAba[]>([]);
  const [statusPorData, setStatusPorData] = useState<Record<string, 'pendente' | 'ok' | 'atencao' | 'divergente'>>({});
  const statusPorDataRef = useRef(statusPorData);
  statusPorDataRef.current = statusPorData;
  const [savingVinculo, setSavingVinculo] = useState(false);
  /** Filtro por mês de competência (coluna calendário na planilha). "Todos" = sem filtro. */
  const [mesCompetenciaFiltro, setMesCompetenciaFiltro] = useState<number | 'todos'>('todos');

  const respostaFiltrada = useMemo(() => {
    if (!resposta) return null;
    return filtrarRespostaPorMesCompetencia(resposta, mesCompetenciaFiltro);
  }, [resposta, mesCompetenciaFiltro]);
  const [manualMatches, setManualMatches] = useState<Record<string, string>>({});
  const [draftMatches, setDraftMatches] = useState<Record<string, string>>({});
  /** Rascunho do banco escolhido por grupo (várias linhas → mesmos candidatos). */
  const [draftGroupMatches, setDraftGroupMatches] = useState<Record<string, string>>({});

  useEffect(() => {
    const d = searchParams.get('data');
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) setData(d);
  }, [searchParams]);

  useEffect(() => {
    setDraftMatches({});
    setDraftGroupMatches({});
  }, [data, aba, modalidade, mesCompetenciaFiltro]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const modalidadeParam = modalidade === 'TODAS' ? undefined : modalidade || undefined;
        const r = await getValidacaoPagamentosDiaria(data, aba, modalidadeParam);
        if (!cancelled) setResposta(r);
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
  }, [data, aba, modalidade]);

  useEffect(() => {
    let cancelled = false;
    async function loadVinculosDia() {
      try {
        const mes = Number(data.slice(5, 7));
        const ano = Number(data.slice(0, 4));
        const r = await getValidacaoVinculos(data, mes, ano);
        if (!cancelled) {
          const map: Record<string, string> = {};
          for (const v of r.itens) map[v.planilha_id] = v.banco_id;
          setManualMatches(map);
        }
      } catch {
        if (!cancelled) {
          setManualMatches({});
        }
      }
    }
    loadVinculosDia();
    return () => {
      cancelled = true;
    };
  }, [data, aba, modalidade, mesCompetenciaFiltro]);

  /** Uma chamada só: ano civil atual (ex.: 2026). Não recarrega a cada clique na data. */
  useEffect(() => {
    let cancelled = false;
    async function loadAno() {
      const cy = ANO_PLANILHA_LISTA();
      try {
        const r = await getPagamentosPlanilhaTodasAbas(cy);
        if (cancelled) return;
        setPagamentosAno(r.abas ?? []);
      } catch {
        /* mantém lista anterior */
      }
    }
    loadAno();
    return () => {
      cancelled = true;
    };
  }, []);

  const abasDisponiveis = useMemo(() => {
    const set = new Set<string>(['TODAS']);
    for (const a of pagamentosAno) set.add(a.aba);
    return Array.from(set);
  }, [pagamentosAno]);

  const modalidadesDisponiveis = useMemo(() => {
    if (aba === 'TODAS') return ['TODAS'];
    const alvo = pagamentosAno.find((x) => x.aba === aba);
    const set = new Set<string>(['TODAS']);
    for (const al of alvo?.alunos ?? []) {
      if (al.modalidade?.trim()) set.add(al.modalidade.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [pagamentosAno, aba]);

  useEffect(() => {
    setModalidade('TODAS');
  }, [aba]);

  const validacaoAjustada = useMemo(() => {
    if (!respostaFiltrada) return null;

    const confirmadosOriginais = respostaFiltrada.validacao.itens_confirmados;
    const naoConfirmadosOriginais = respostaFiltrada.validacao.itens_nao_confirmados;
    const possiveisOriginais = respostaFiltrada.validacao.itens_possivel_match;

    const confirmadosManuais: Array<{ planilha: ValidacaoDiariaPlanilhaItem; banco: ValidacaoDiariaBancoItem }> = [];

    const possiveisRestantes: typeof possiveisOriginais = [];

    for (const x of possiveisOriginais) {
      const planilhaId = x.planilha.id;
      const bancoIdSelecionado = manualMatches[planilhaId];
      if (bancoIdSelecionado) {
        const escolhido = x.candidatos.find((c) => c.id === bancoIdSelecionado);
        if (escolhido) {
          confirmadosManuais.push({ planilha: x.planilha, banco: escolhido });
          continue;
        }
      }
      possiveisRestantes.push(x);
    }

    const confirmadosAll = [...confirmadosOriginais, ...confirmadosManuais];
    const qtd_confirmados = confirmadosAll.length;
    const qtd_nao_confirmados = naoConfirmadosOriginais.length;
    const qtd_possivel_match = possiveisRestantes.length;

    const status_geral =
      qtd_nao_confirmados > 0 ? 'divergente' : qtd_possivel_match > 0 ? 'atencao' : 'ok';

    return {
      ...respostaFiltrada.validacao,
      status_geral,
      qtd_confirmados,
      qtd_nao_confirmados,
      qtd_possivel_match,
      itens_confirmados: confirmadosAll,
      itens_possivel_match: possiveisRestantes,
      itens_nao_confirmados: naoConfirmadosOriginais,
    };
  }, [respostaFiltrada, manualMatches]);

  const gruposPossivelMatch = useMemo(() => {
    const rows =
      (validacaoAjustada ?? respostaFiltrada?.validacao)?.itens_possivel_match ?? ([] as PossivelMatchRow[]);
    return agruparPossivelMatch(rows);
  }, [validacaoAjustada, respostaFiltrada]);

  async function vincularItem(planilhaId: string, bancoId: string) {
    const mes = Number(data.slice(5, 7));
    const ano = Number(data.slice(0, 4));
    setSavingVinculo(true);
    try {
      await createValidacaoVinculo(data, mes, ano, bancoId, [planilhaId]);
      setManualMatches((prev) => ({ ...prev, [planilhaId]: bancoId }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingVinculo(false);
    }
  }

  async function desvincularItem(planilhaId: string) {
    setSavingVinculo(true);
    try {
      await deleteValidacaoVinculo(planilhaId);
      setManualMatches((prev) => {
        const next = { ...prev };
        delete next[planilhaId];
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingVinculo(false);
    }
  }

  const datasComPagamentosBase = useMemo(() => {
    const anoLista = ANO_PLANILHA_LISTA();
    const prefixAno = `${anoLista}-`;
    const map = new Map<
      string,
      {
        quantidade: number;
        total: number;
        porCompetencia: Map<
          string,
          { quantidade: number; total: number; mesCompetencia: number; anoCompetencia: number }
        >;
      }
    >();

    for (const a of pagamentosAno) {
      if (aba !== 'TODAS' && a.aba !== aba) continue;
      for (const al of a.alunos ?? []) {
        if (modalidade !== 'TODAS' && (al.modalidade ?? '').trim() !== modalidade) continue;
        for (const p of al.pagamentos ?? []) {
          const iso = p.data?.slice(0, 10);
          if (!iso || !iso.startsWith(prefixAno)) continue;

          const fallbackAno = Number(iso.slice(0, 4));
          const fallbackMes = Number(iso.slice(5, 7));
          const mesCompetencia = Number((p as any).mesCompetencia ?? fallbackMes) || fallbackMes;
          const anoCompetencia = Number((p as any).anoCompetencia ?? fallbackAno) || fallbackAno;

          const cur =
            map.get(iso) ?? { quantidade: 0, total: 0, porCompetencia: new Map<string, any>() };
          cur.quantidade += 1;
          cur.total += Number(p.valor || 0);

          const chaveComp = `${anoCompetencia}-${String(mesCompetencia).padStart(2, '0')}`;
          const compCur =
            cur.porCompetencia.get(chaveComp) ?? {
              quantidade: 0,
              total: 0,
              mesCompetencia,
              anoCompetencia,
            };
          compCur.quantidade += 1;
          compCur.total += Number(p.valor || 0);
          cur.porCompetencia.set(chaveComp, compCur);

          map.set(iso, cur);
        }
      }
    }

    const arr = Array.from(map.entries()).map(([iso, v]) => {
      let best = null as null | { quantidade: number; total: number; mesCompetencia: number; anoCompetencia: number };
      for (const comp of v.porCompetencia.values()) {
        if (!best) best = comp;
        else if (comp.total > best.total) best = comp;
        else if (comp.total === best.total && comp.quantidade > best.quantidade) best = comp;
      }
      const fallbackAno = Number(iso.slice(0, 4));
      const fallbackMes = Number(iso.slice(5, 7));
      return {
        data: iso,
        quantidade: v.quantidade,
        total: v.total,
        mesCompetencia: best?.mesCompetencia ?? fallbackMes,
        anoCompetencia: best?.anoCompetencia ?? fallbackAno,
      };
    });
    arr.sort((x, y) => (y.quantidade - x.quantidade) || y.total - x.total || y.data.localeCompare(x.data));
    return arr;
  }, [pagamentosAno, aba, modalidade]);

  /** Acesso rápido por data: opcionalmente só datas cujo principal mês de competência bate com o filtro. */
  const datasComPagamentos = useMemo(() => {
    if (mesCompetenciaFiltro === 'todos') return datasComPagamentosBase;
    return datasComPagamentosBase.filter((d) => d.mesCompetencia === mesCompetenciaFiltro);
  }, [datasComPagamentosBase, mesCompetenciaFiltro]);

  const datasFiltradas = useMemo(() => {
    const q = dataBusca.trim();
    if (!q) return datasComPagamentos.slice(0, MAX_DATAS_EXIBIDAS);
    return datasComPagamentos.filter((d) => d.data.includes(q)).slice(0, MAX_DATAS_EXIBIDAS);
  }, [datasComPagamentos, dataBusca]);

  useEffect(() => {
    if (!validacaoAjustada) return;
    setStatusPorData((prev) => ({
      ...prev,
      [data]: validacaoAjustada.status_geral as StatusValidacaoDia,
    }));
  }, [data, validacaoAjustada]);

  useEffect(() => {
    setStatusPorData({});
  }, [aba, modalidade, mesCompetenciaFiltro]);

  /**
   * Prévia de status só nas primeiras datas (rápido): 1 GET validação/dia, sem GET vínculos.
   * O dia aberto continua com status exato (inclui matches manuais via validacaoAjustada + vínculos).
   */
  useEffect(() => {
    let cancelled = false;
    const modalidadeParam = modalidade === 'TODAS' ? undefined : modalidade || undefined;

    async function prefetchPrevia() {
      const snap = { ...statusPorDataRef.current };
      const alvos = datasFiltradas
        .map((d) => d.data)
        .filter((dt) => snap[dt] == null)
        .slice(0, MAX_DATAS_STATUS_PREVIA);
      if (alvos.length === 0) return;

      const out: Record<string, StatusValidacaoDia> = {};
      for (let i = 0; i < alvos.length && !cancelled; i += PREFETCH_CONCORRENCIA) {
        const chunk = alvos.slice(i, i + PREFETCH_CONCORRENCIA);
        await Promise.all(
          chunk.map(async (dt) => {
            if (cancelled) return;
            try {
              const respDia = await getValidacaoPagamentosDiaria(dt, aba, modalidadeParam);
              const base = filtrarRespostaPorMesCompetencia(respDia, mesCompetenciaFiltro);
              out[dt] = base.validacao.status_geral as StatusValidacaoDia;
            } catch {
              out[dt] = 'pendente';
            }
          }),
        );
      }
      if (cancelled) return;
      setStatusPorData((prev) => {
        const merged = { ...prev, ...out };
        statusPorDataRef.current = merged;
        return merged;
      });
    }

    void prefetchPrevia();
    return () => {
      cancelled = true;
    };
  }, [datasFiltradas, aba, modalidade, mesCompetenciaFiltro]);

  const datasAgrupadasPorMes = useMemo(() => {
    const map = new Map<
      string,
      { data: string; quantidade: number; total: number; mesCompetencia: number; anoCompetencia: number }[]
    >();
    for (const d of datasFiltradas) {
      const chaveMes = `${d.anoCompetencia}-${String(d.mesCompetencia).padStart(2, '0')}`; // YYYY-MM (competencia)
      const arr = map.get(chaveMes) ?? [];
      arr.push(d);
      map.set(chaveMes, arr);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([mes, itens]) => ({ mes, itens }));
  }, [datasFiltradas]);

  const secoesDatas = useMemo(() => {
    const now = new Date();
    const ymAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const ymAnterior = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;

    const atual = datasAgrupadasPorMes.filter((g) => g.mes === ymAtual);
    const anterior = datasAgrupadasPorMes.filter((g) => g.mes === ymAnterior);
    const antigos = datasAgrupadasPorMes.filter((g) => g.mes !== ymAtual && g.mes !== ymAnterior);

    return [
      { id: 'atual', titulo: 'Mês atual', grupos: atual },
      { id: 'anterior', titulo: 'Mês anterior', grupos: anterior },
      { id: 'antigos', titulo: 'Meses antigos', grupos: antigos },
    ];
  }, [datasAgrupadasPorMes]);

  const statusClass = useMemo(() => {
    const st = validacaoAjustada?.status_geral;
    if (st === 'ok') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    if (st === 'atencao') return 'bg-amber-100 text-amber-800 border-amber-200';
    return 'bg-rose-100 text-rose-800 border-rose-200';
  }, [validacaoAjustada]);

  return (
    <div className="p-6">
      <Topbar
        title="Validação de pagamentos"
        subtitle="Confere pagamentos declarados na planilha versus entradas reais no banco (por data e, se quiser, por mês de competência)."
      />

      <div className="mt-4 flex flex-wrap gap-3 items-end">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
          <div className="text-[11px] font-medium text-gray-500 mb-1">Acesso rápido</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setData(todayIsoLocal())}
              className="px-2.5 py-1.5 text-xs rounded-md border border-gray-300 bg-white hover:bg-gray-100"
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => {
                const t = new Date();
                t.setDate(t.getDate() - 1);
                const y = t.getFullYear();
                const m = String(t.getMonth() + 1).padStart(2, '0');
                const d = String(t.getDate()).padStart(2, '0');
                setData(`${y}-${m}-${d}`);
              }}
              className="px-2.5 py-1.5 text-xs rounded-md border border-gray-300 bg-white hover:bg-gray-100"
            >
              Ontem
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Data</label>
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Aba</label>
          <select value={aba} onChange={(e) => setAba(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm min-w-[230px]">
            {abasDisponiveis.map((x) => (
              <option key={x} value={x}>{x}</option>
            ))}
          </select>
        </div>
        <div className="min-w-[240px]">
          <label className="block text-xs font-medium text-gray-500 mb-1">Modalidade</label>
          <select
            value={modalidade}
            onChange={(e) => setModalidade(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            disabled={aba === 'TODAS'}
          >
            {modalidadesDisponiveis.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Mês (competência)</label>
          <select
            value={mesCompetenciaFiltro === 'todos' ? 'todos' : String(mesCompetenciaFiltro)}
            onChange={(e) => {
              const v = e.target.value;
              setMesCompetenciaFiltro(v === 'todos' ? 'todos' : Number(v));
            }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm min-w-[200px]"
          >
            <option value="todos">Todos os meses</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={String(m)}>
                {new Date(2000, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long' })}
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">Datas com mais pagamentos (planilha)</h2>
            <p className="text-xs text-gray-500 mt-0.5 max-w-xl">
              Ano {ANO_PLANILHA_LISTA()}: lista só com pagamentos nesse ano. Clique na data para ver o detalhe. Status
              colorido nos chips é prévia (até {MAX_DATAS_STATUS_PREVIA} datas); o painel abaixo ao abrir o dia é o
              definitivo.
            </p>
          </div>
          <input
            type="search"
            placeholder="Buscar data (YYYY-MM-DD)"
            value={dataBusca}
            onChange={(e) => setDataBusca(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-xs min-w-[220px]"
          />
        </div>
        <div className="p-3 space-y-4">
          {datasFiltradas.length === 0 ? (
            <div className="px-1">
              <p className="text-sm text-gray-600">Nenhuma data para os filtros atuais.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAba('TODAS');
                    setModalidade('TODAS');
                    setMesCompetenciaFiltro('todos');
                    setDataBusca('');
                  }}
                  className="px-3 py-1.5 text-xs rounded-md border border-gray-300 bg-white hover:bg-gray-50"
                >
                  Limpar filtros de datas
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMesCompetenciaFiltro('todos');
                    setDataBusca('');
                  }}
                  className="px-3 py-1.5 text-xs rounded-md border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                >
                  Mostrar datas principais
                </button>
              </div>
            </div>
          ) : (
            secoesDatas.map((secao) => (
              <div key={secao.id}>
                <div className="text-xs font-bold text-gray-700 mb-2">{secao.titulo}</div>
                {secao.grupos.length === 0 ? (
                  <div className="text-xs text-gray-400 mb-2">Sem datas nesta seção.</div>
                ) : (
                  secao.grupos.map((grupo) => (
                    <div key={grupo.mes} className="mb-3">
                      <div className="text-xs font-semibold text-gray-600 mb-2">{monthYearLabel(`${grupo.mes}-01`)}</div>
                      <div className="flex flex-wrap gap-2">
                        {grupo.itens.map((d) => (
                          (() => {
                            const stSelecionado =
                              (validacaoAjustada ?? respostaFiltrada?.validacao)?.status_geral as
                                | StatusValidacaoDia
                                | undefined;
                            const st =
                              d.data === data
                                ? loading
                                  ? 'pendente'
                                  : stSelecionado ?? statusPorData[d.data] ?? 'pendente'
                                : statusPorData[d.data] ?? 'pendente';
                            const stClass =
                              st === 'ok'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                : st === 'atencao'
                                  ? 'bg-amber-100 text-amber-900 border-amber-200'
                                  : st === 'divergente'
                                    ? 'bg-rose-100 text-rose-900 border-rose-200'
                                    : 'bg-gray-100 text-gray-700 border-gray-200';
                            return (
                          <button
                            key={d.data}
                            type="button"
                            onClick={() => {
                              setStatusPorData((prev) => ({ ...prev, [d.data]: 'pendente' }));
                              setData(d.data);
                            }}
                            className={`px-3 py-1.5 rounded-lg border text-xs text-left ${
                              d.data === data
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                            }`}
                            title={`Total ${formatCurrency(d.total)}`}
                          >
                            <div className="font-semibold">{d.data}</div>
                            <div className={`${d.data === data ? 'text-indigo-100' : 'text-gray-500'}`}>
                              {d.quantidade} pag. · {formatCurrency(d.total)}
                            </div>
                            <div className={`mt-1 inline-flex px-1.5 py-0.5 rounded border text-[10px] ${stClass}`}>
                              {statusLabel(st)}
                            </div>
                          </button>
                            );
                          })()
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {error && <div className="mt-4 p-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 text-sm">{error}</div>}

      {loading && (
        <div className="mt-6 space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {!loading && resposta && respostaFiltrada && (
        <>
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center px-3 py-1 rounded-full border text-xs font-semibold ${statusClass}`}>
              Status: {(validacaoAjustada ?? respostaFiltrada.validacao).status_geral.toUpperCase()}
            </span>
            <span className="text-xs text-gray-500">
              Abas consideradas:{' '}
              {Array.isArray(resposta.meta.abas_consideradas) && resposta.meta.abas_consideradas.length > 0
                ? resposta.meta.abas_consideradas.join(', ')
                : '-'}
            </span>
            {mesCompetenciaFiltro !== 'todos' && (
              <span className="text-xs text-indigo-700 font-medium">
                Competência:{' '}
                {new Date(2000, mesCompetenciaFiltro - 1, 1).toLocaleDateString('pt-BR', { month: 'long' })}
              </span>
            )}
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-xs text-gray-500">Total planilha</div>
              <div className="mt-1 text-xl font-semibold text-indigo-700">{formatCurrency(respostaFiltrada.planilha.total)}</div>
              <div className="text-xs text-gray-500 mt-1">{respostaFiltrada.planilha.quantidade} item(ns)</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-xs text-gray-500">Total banco</div>
              <div className="mt-1 text-xl font-semibold text-sky-700">{formatCurrency(respostaFiltrada.banco.total)}</div>
              <div className="text-xs text-gray-500 mt-1">{respostaFiltrada.banco.quantidade} item(ns)</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-xs text-gray-500">Delta (planilha - banco)</div>
              <div className="mt-1 text-xl font-semibold text-emerald-700">{formatCurrency((validacaoAjustada ?? respostaFiltrada.validacao).delta_total_planilha_menos_banco)}</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-xs text-gray-500">Conferência</div>
              <div className="mt-1 text-sm text-gray-800">
                <div>Confirmados: <b>{(validacaoAjustada ?? respostaFiltrada.validacao).qtd_confirmados}</b></div>
                <div>Não confirmados: <b>{(validacaoAjustada ?? respostaFiltrada.validacao).qtd_nao_confirmados}</b></div>
                <div>Possíveis match: <b>{(validacaoAjustada ?? respostaFiltrada.validacao).qtd_possivel_match}</b></div>
              </div>
            </div>
          </div>

          <section className="mt-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50">
              <h2 className="font-semibold text-gray-900">Pagamentos da planilha no dia</h2>
              <p className="text-xs text-gray-500 mt-1">
                Os lançamentos aparecem no dia da <b>data de pagamento</b>. Se a competência (mês do serviço) for outra, mostramos um aviso na coluna Competência.
              </p>
            </div>
            <div className="p-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="py-2 pr-2">Aba</th>
                    <th className="py-2 pr-2">Modalidade</th>
                    <th className="py-2 pr-2">Aluno</th>
                    <th className="py-2 pr-2">Data</th>
                    <th className="py-2 pr-2">Competência</th>
                    <th className="py-2 pr-2">Forma</th>
                    <th className="py-2 pr-2 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {respostaFiltrada.planilha.itens.length === 0 ? (
                    <tr><td className="py-3 text-gray-500" colSpan={7}>Nenhum pagamento na planilha para este filtro.</td></tr>
                  ) : (
                    respostaFiltrada.planilha.itens.map((i) => (
                      <tr key={i.id} className="border-b border-gray-100">
                        <td className="py-1.5 pr-2">{i.aba}</td>
                        <td className="py-1.5 pr-2">{i.modalidade}</td>
                        <td className="py-1.5 pr-2">{i.aluno}</td>
                        <td className="py-1.5 pr-2">{i.data}</td>
                        <CelulaCompetenciaPlanilha item={i} />
                        <td className="py-1.5 pr-2">{i.forma || '—'}</td>
                        <td className="py-1.5 pr-2 text-right">{formatCurrency(i.valor)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50">
              <h2 className="font-semibold text-gray-900">Entradas no banco (Supabase) no dia selecionado</h2>
              {mesCompetenciaFiltro !== 'todos' && (
                <p className="text-xs text-gray-500 mt-1">
                  Lista todas as entradas do dia no banco; os totais acima consideram só a competência selecionada.
                </p>
              )}
            </div>
            <div className="p-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="py-2 pr-2">Pessoa</th>
                    <th className="py-2 pr-2">Data</th>
                    <th className="py-2 pr-2">Descrição</th>
                    <th className="py-2 pr-2 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {resposta.banco.itens.filter((b) => (b.data ?? '').slice(0, 10) === data).length === 0 ? (
                    <tr><td className="py-3 text-gray-500" colSpan={4}>Nenhuma entrada de banco para este dia.</td></tr>
                  ) : (
                    resposta.banco.itens
                      .filter((b) => (b.data ?? '').slice(0, 10) === data)
                      .map((b) => (
                      <tr key={b.id} className="border-b border-gray-100">
                        <td className="py-1.5 pr-2">{b.pessoa}</td>
                        <td className="py-1.5 pr-2">{b.data}</td>
                        <td className="py-1.5 pr-2">{b.descricao || '—'}</td>
                        <td className="py-1.5 pr-2 text-right">{formatCurrency(b.valor)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50">
              <h2 className="font-semibold text-gray-900">Confirmados (planilha x banco)</h2>
            </div>
            <div className="p-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="py-2 pr-2">Aluno (planilha)</th>
                    <th className="py-2 pr-2">Pessoa (banco)</th>
                    <th className="py-2 pr-2">Data</th>
                    <th className="py-2 pr-2">Competência</th>
                    <th className="py-2 pr-2 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {(validacaoAjustada ?? respostaFiltrada.validacao).itens_confirmados.length === 0 ? (
                    <tr><td className="py-3 text-gray-500" colSpan={5}>Nenhum item confirmado.</td></tr>
                  ) : (
                    (validacaoAjustada ?? respostaFiltrada.validacao).itens_confirmados.map((c) => (
                      <tr key={`${c.planilha.id}::${c.banco.id}`} className="border-b border-gray-100">
                        <td className="py-1.5 pr-2">{c.planilha.aluno}</td>
                        <td className="py-1.5 pr-2">{c.banco.pessoa}</td>
                        <td className="py-1.5 pr-2">{c.planilha.data}</td>
                        <CelulaCompetenciaPlanilha item={c.planilha} />
                        <td className="py-1.5 pr-2 text-right">{formatCurrency(c.planilha.valor)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50">
              <h2 className="font-semibold text-gray-900">Não confirmados no banco</h2>
            </div>
            <div className="p-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="py-2 pr-2">Aba</th>
                    <th className="py-2 pr-2">Modalidade</th>
                    <th className="py-2 pr-2">Aluno</th>
                    <th className="py-2 pr-2">Data</th>
                    <th className="py-2 pr-2">Competência</th>
                    <th className="py-2 pr-2">Forma</th>
                    <th className="py-2 pr-2 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {(validacaoAjustada ?? respostaFiltrada.validacao).itens_nao_confirmados.length === 0 ? (
                    <tr><td className="py-3 text-gray-500" colSpan={7}>Nenhum item.</td></tr>
                  ) : (
                    (validacaoAjustada ?? respostaFiltrada.validacao).itens_nao_confirmados.map((i) => (
                      <tr key={i.id} className="border-b border-gray-100">
                        <td className="py-1.5 pr-2">{i.aba}</td>
                        <td className="py-1.5 pr-2">{i.modalidade}</td>
                        <td className="py-1.5 pr-2">{i.aluno}</td>
                        <td className="py-1.5 pr-2">{i.data}</td>
                        <CelulaCompetenciaPlanilha item={i} />
                        <td className="py-1.5 pr-2">{i.forma || '—'}</td>
                        <td className="py-1.5 pr-2 text-right">{formatCurrency(i.valor)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50">
              <h2 className="font-semibold text-gray-900">Possíveis matches (revisão manual)</h2>
              <p className="text-xs text-gray-500 mt-1 max-w-3xl">
                <b>Agrupamento</b> só vale para exceções: <b>mesma pessoa</b> com mais de uma atividade no mesmo dia (soma na planilha =
                um PIX no banco, inclusive em abas diferentes); ou <b>mesmo pagador PIX</b> para mais de um aluno (um valor no banco).
                Itens já marcados como “possível” em 1:1 não entram aqui para não misturar com o agrupamento. Linhas isoladas ficam em
                um card cada.
              </p>
            </div>
            <div className="p-4 space-y-3">
              {(validacaoAjustada ?? respostaFiltrada.validacao).itens_possivel_match.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhum item.</p>
              ) : (
                gruposPossivelMatch.map((grupo) => {
                  if (grupo.length === 1) {
                    const x = grupo[0];
                    return (
                      <div key={x.planilha.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <div className="text-sm text-amber-900">
                          <b>{x.planilha.aluno}</b> · {x.planilha.data} · {formatCurrency(x.planilha.valor)}
                        </div>
                        <div className="text-[11px] text-amber-900 mt-1">
                          Competência: {labelCompetenciaMesAno(x.planilha.mesCompetencia, x.planilha.anoCompetencia)}
                          {!competenciaAlinhaComDataPagamento(
                            x.planilha.data,
                            x.planilha.mesCompetencia,
                            x.planilha.anoCompetencia,
                          ) && (
                            <span
                              className="ml-2 inline-block rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5"
                              title={AVISO_COMPETENCIA_DIFERENTE}
                            >
                              Aviso: competência ≠ mês da data — valor neste dia pela <b>data</b> na planilha
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap items-end gap-2">
                          <div className="min-w-[260px]">
                            <label className="block text-[11px] font-medium text-amber-900 mb-1">
                              Escolher lançamento do banco
                            </label>
                            <select
                              className="w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs"
                              value={draftMatches[x.planilha.id] ?? ''}
                              onChange={(e) => {
                                const bancoId = e.target.value;
                                setDraftMatches((prev) => {
                                  const next = { ...prev };
                                  if (!bancoId) delete next[x.planilha.id];
                                  else next[x.planilha.id] = bancoId;
                                  return next;
                                });
                              }}
                            >
                              <option value="">Selecione...</option>
                              {x.candidatos.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {(c.pessoa || c.descricao || '(sem nome)')} · {formatCurrency(c.valor)} · {c.data}
                                </option>
                              ))}
                            </select>
                          </div>
                          <button
                            type="button"
                            className="px-3 py-2 text-xs rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                            disabled={!draftMatches[x.planilha.id] || savingVinculo}
                            onClick={async () => {
                              const planilhaId = x.planilha.id;
                              const bancoId = draftMatches[planilhaId];
                              if (!bancoId) return;
                              await vincularItem(planilhaId, bancoId);
                              setDraftMatches((prev) => {
                                const next = { ...prev };
                                delete next[planilhaId];
                                return next;
                              });
                            }}
                          >
                            Confirmar match
                          </button>
                        </div>
                        {(manualMatches[x.planilha.id] ?? draftMatches[x.planilha.id]) && (
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <div className="text-[11px] text-amber-900">
                              Selecionado:{' '}
                              {x.candidatos.find((c) => c.id === (manualMatches[x.planilha.id] ?? draftMatches[x.planilha.id]))
                                ?.pessoa || 'Banco'}
                              .
                            </div>
                            {manualMatches[x.planilha.id] && (
                              <button
                                type="button"
                                className="px-2 py-1 text-[10px] rounded border border-amber-300 bg-white hover:bg-amber-50"
                                onClick={async () => desvincularItem(x.planilha.id)}
                                disabled={savingVinculo}
                              >
                                Desvincular
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  }

                  const gk = chaveGrupoPossivel(grupo[0]);
                  const badges = badgesGrupoPossivel(grupo);
                  const candidatos = grupo[0].candidatos;
                  const todosMesmoManual =
                    grupo.length > 0 &&
                    grupo.every((r) => manualMatches[r.planilha.id] === manualMatches[grupo[0].planilha.id]) &&
                    !!manualMatches[grupo[0].planilha.id];
                  const selectVal = draftGroupMatches[gk] ?? (todosMesmoManual ? manualMatches[grupo[0].planilha.id] ?? '' : '');

                  const totalPlan = grupo.reduce((s, r) => s + Number(r.planilha.valor || 0), 0);

                  return (
                    <div
                      key={gk}
                      className="rounded-xl border border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50/40 p-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="text-xs font-semibold text-amber-950">
                          Grupo · {grupo.length} linha(s) na planilha · total {formatCurrency(totalPlan)}
                        </span>
                        {badges.map((b, bi) => (
                          <span
                            key={`${b.label}-${bi}`}
                            title={b.title}
                            className="text-[10px] px-2 py-0.5 rounded-full border border-amber-400 bg-amber-100 text-amber-950 font-medium cursor-help"
                          >
                            {b.label}
                          </span>
                        ))}
                      </div>
                      <p className="text-[11px] text-amber-950/80 mb-3">
                        Passe o mouse nos selos para ler o contexto. Escolha <b>um</b> lançamento do banco e confirme para
                        aplicar a todas as linhas abaixo (mesmo PIX / soma).
                      </p>
                      <div className="overflow-x-auto rounded-lg border border-amber-200/80 bg-white/80 mb-3">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b text-left text-amber-900/70 bg-amber-100/50">
                              <th className="py-2 px-2">Aba</th>
                              <th className="py-2 px-2">Modalidade</th>
                              <th className="py-2 px-2">Aluno</th>
                              <th className="py-2 px-2 text-right">Valor</th>
                              <th className="py-2 px-2">Competência</th>
                            </tr>
                          </thead>
                          <tbody>
                            {grupo.map((row) => (
                              <tr key={row.planilha.id} className="border-b border-amber-100">
                                <td className="py-1.5 px-2">{row.planilha.aba}</td>
                                <td className="py-1.5 px-2 max-w-[200px]">{row.planilha.modalidade}</td>
                                <td className="py-1.5 px-2 font-medium">{row.planilha.aluno}</td>
                                <td className="py-1.5 px-2 text-right tabular-nums">{formatCurrency(row.planilha.valor)}</td>
                                <td className="py-1.5 px-2">
                                  {labelCompetenciaMesAno(row.planilha.mesCompetencia, row.planilha.anoCompetencia)}
                                  {row.planilha.pagadorPix ? (
                                    <span className="block text-[10px] text-gray-600 mt-0.5">PIX: {row.planilha.pagadorPix}</span>
                                  ) : null}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="min-w-[280px] flex-1">
                          <label className="block text-[11px] font-medium text-amber-950 mb-1">
                            Lançamento no banco (vale para as {grupo.length} linhas)
                          </label>
                          <select
                            className="w-full rounded-lg border border-amber-400 bg-white px-3 py-2 text-xs"
                            value={selectVal}
                            onChange={(e) => {
                              const bancoId = e.target.value;
                              setDraftGroupMatches((prev) => {
                                const next = { ...prev };
                                if (!bancoId) delete next[gk];
                                else next[gk] = bancoId;
                                return next;
                              });
                            }}
                          >
                            <option value="">Selecione...</option>
                            {candidatos.map((c) => (
                              <option key={c.id} value={c.id}>
                                {(c.pessoa || c.descricao || '(sem nome)')} · {formatCurrency(c.valor)} · {c.data}
                              </option>
                            ))}
                          </select>
                        </div>
                        <button
                          type="button"
                          className="px-4 py-2 text-xs rounded-lg bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-50 font-medium"
                          disabled={!selectVal || savingVinculo}
                          onClick={async () => {
                            if (!selectVal) return;
                            const bancoId = selectVal;
                            for (const r of grupo) {
                              await vincularItem(r.planilha.id, bancoId);
                            }
                            setDraftGroupMatches((prev) => {
                              const next = { ...prev };
                              delete next[gk];
                              return next;
                            });
                          }}
                        >
                          Confirmar para as {grupo.length} linhas
                        </button>
                      </div>
                      {selectVal && (
                        <div className="text-[11px] text-amber-950 mt-2">
                          Selecionado:{' '}
                          {candidatos.find((c) => c.id === selectVal)?.pessoa || candidatos.find((c) => c.id === selectVal)?.descricao || '—'}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

