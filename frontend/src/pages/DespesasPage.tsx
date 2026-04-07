import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Topbar } from '../app/Topbar';
import { useMonthYear } from '../context/MonthYearContext';
import { KpiCard } from '../components/ui/KpiCard';
import { PlanilhaLinhaDrillModal } from '../components/PlanilhaLinhaDrillModal';
import { useResumoMensal } from '../hooks/useResumoMensal';
import { useSaidas } from '../hooks/useSaidas';
import { useFluxoCompleto } from '../hooks/useFluxoCompleto';
import {
  getEntidadesByla,
  postMatchEntidadesLinhas,
  type EntidadeMatchInfo,
  type SaidaPainelItem,
  type TransacaoItem,
} from '../services/backendApi';
import { useSaidasPainel } from '../hooks/useSaidasPainel';
import { useManualLinhaPlanilha } from '../hooks/useManualLinhaPlanilha';

const HAS_BACKEND = Boolean((import.meta.env.VITE_BACKEND_URL ?? '').trim());

function buildResumoPorLinhaItens(itens: SaidaPainelItem[]): { nome: string; total: number; qtd: number }[] {
  const mapLinha = new Map<string, { total: number; qtd: number }>();
  for (const it of itens) {
    const nome = it.linha_planilha_ref?.trim() || 'Não classificado';
    const e = mapLinha.get(nome) ?? { total: 0, qtd: 0 };
    e.total += Math.abs(Number(it.valor ?? 0));
    e.qtd += 1;
    mapLinha.set(nome, e);
  }
  return [...mapLinha.entries()]
    .map(([nome, v]) => ({ nome, total: v.total, qtd: v.qtd }))
    .sort((a, b) => b.total - a.total);
}

/** Rótulo curto para validação visual na comparação por linha. */
function statusComparacaoLinha(row: {
  totalBanco: number | null;
  totalPlanilha: number | null;
  diff: number | null;
}): { label: string; className: string } {
  const sóBanco = row.totalBanco != null && row.totalPlanilha == null;
  const sóPlanilha = row.totalBanco == null && row.totalPlanilha != null;
  if (sóBanco || sóPlanilha) {
    return { label: 'Só um lado', className: 'bg-amber-100 text-amber-900 border-amber-200' };
  }
  if (row.diff == null) {
    return { label: '—', className: 'bg-slate-100 text-slate-600 border-slate-200' };
  }
  if (Math.abs(row.diff) < 0.02) {
    return { label: 'OK', className: 'bg-emerald-100 text-emerald-900 border-emerald-200' };
  }
  return { label: 'Diverge', className: 'bg-rose-100 text-rose-900 border-rose-200' };
}

function normalizeForMatch(input: string): string {
  return (input ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function tokenizeForMatch(input: string): string[] {
  const stop = new Set([
    'de',
    'da',
    'do',
    'das',
    'dos',
    'e',
    'para',
    'com',
    'por',
    'no',
    'na',
    'em',
    'pix',
    'ted',
    'doc',
    'saida',
    'saidas',
    'gastos',
    'fixos',
    'total',
    'controle',
  ]);
  const parts = normalizeForMatch(input)
    .split(/[^a-z0-9]+/g)
    .map((x) => x.trim())
    .filter((x) => x.length >= 3 && !stop.has(x));
  return [...new Set(parts)];
}

type MatchCandidato = {
  id: string;
  data: string;
  pessoa: string;
  descricao: string | null;
  valor: number;
  linhaAtual: string | null;
  score: number;
  /** Origem da sugestão (para exibir ao usuário). */
  origem?: 'texto_valor' | 'melhor_ranqueado' | 'valor_proximo';
};

function scoreExtratoParaLinha(
  linhaLabel: string,
  linhaValor: number | null,
  r: SaidaPainelItem
): number {
  const tokensLinha = tokenizeForMatch(linhaLabel);
  const textoR = `${r.pessoa ?? ''} ${r.descricao ?? ''}`;
  const tokensR = tokenizeForMatch(textoR);
  const normLabel = normalizeForMatch(linhaLabel).replace(/[^a-z0-9]+/g, ' ').trim();
  const normTexto = normalizeForMatch(textoR);

  const setR = new Set(tokensR);
  let overlap = 0;
  for (const t of tokensLinha) if (setR.has(t)) overlap += 1;
  let textScore = tokensLinha.length > 0 ? overlap / tokensLinha.length : 0;

  if (textScore === 0 && normLabel.length >= 4) {
    if (normTexto.includes(normLabel)) textScore = 0.85;
    else {
      const words = normLabel.split(/\s+/).filter((w) => w.length >= 4);
      for (const w of words) {
        if (normTexto.includes(w)) {
          textScore = Math.max(textScore, 0.55);
          break;
        }
      }
    }
  }

  const rv = Math.abs(Number(r.valor ?? 0));
  let valueScore = 0;
  if (linhaValor != null && linhaValor > 0) {
    const diff = Math.abs(rv - linhaValor);
    const tol = Math.max(300, linhaValor * 0.45);
    valueScore = Math.max(0, 1 - diff / tol);
  }

  const sameLineBonus = (r.linha_planilha_ref ?? '').trim() === linhaLabel.trim() ? 0.35 : 0;
  return textScore * 0.55 + valueScore * 0.45 + sameLineBonus;
}

/** Score mínimo para preferir sugestão “forte”; abaixo disso ainda pegamos o melhor ranqueado ou fallback por valor. */
const SCORE_MIN_SUGESTAO = 0.12;

function melhorMatchPorValor(
  linhaValor: number | null,
  itens: SaidaPainelItem[]
): MatchCandidato | null {
  if (linhaValor == null || linhaValor <= 0 || itens.length === 0) return null;
  let best: { r: SaidaPainelItem; diff: number } | null = null;
  for (const r of itens) {
    const rv = Math.abs(Number(r.valor ?? 0));
    const diff = Math.abs(rv - linhaValor);
    if (!best || diff < best.diff) best = { r, diff };
  }
  if (!best) return null;
  const r = best.r;
  const rv = Math.abs(Number(r.valor ?? 0));
  const tol = Math.max(300, linhaValor * 0.45);
  const score = Math.max(0, 1 - best.diff / tol) * 0.55;
  return {
    id: r.id,
    data: r.data,
    pessoa: r.pessoa,
    descricao: r.descricao ?? null,
    valor: rv,
    linhaAtual: r.linha_planilha_ref ?? null,
    score,
    origem: 'valor_proximo',
  };
}

function MatchEquipeCell({ match }: { match: EntidadeMatchInfo | null | undefined }) {
  if (!match) return <span className="text-slate-400 text-xs">—</span>;
  return (
    <div className="flex flex-col gap-0.5 min-w-[7rem]">
      <span className="text-slate-900 font-medium leading-tight">{match.nome}</span>
      <span className="text-[11px] text-slate-500">{match.funcao}</span>
      {match.subempresa ? (
        <span className="text-[10px] w-fit uppercase tracking-wide px-1.5 py-0.5 rounded bg-violet-100 text-violet-800">
          Subempresa
        </span>
      ) : null}
    </div>
  );
}

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

/** Alinhado ao backend: seções Saídas Parceiros e Saídas Fixas. */
function tituloBlocoSaida(cabecalho: string): string | null {
  const u = cabecalho.toUpperCase().trim();
  if (!u) return null;
  if (u.includes('ALUGUEL') && (u.includes('SAÍDA') || u.includes('SAIDA'))) return 'Saídas Aluguel';
  if (
    u.includes('GASTOS FIXOS') ||
    u.includes('SAÍDAS FIXAS') ||
    u.includes('SAIDAS FIXAS') ||
    u.includes('DESPESAS FIXAS')
  ) {
    return 'Saídas Fixas';
  }
  if (
    u.includes('SAÍDAS PARCEIROS') ||
    u.includes('SAIDAS PARCEIROS') ||
    u.includes('PARCEIRO') ||
    u.includes('TOTAL SAÍDAS') ||
    u.includes('TOTAL SAIDAS')
  ) {
    return 'Saídas Parceiros';
  }
  if (u.includes('SAÍDAS') || u.includes('SAIDAS') || u.includes('DESPESAS')) return cabecalho.trim() || 'Saídas';
  return null;
}

export function DespesasPage() {
  const { monthYear } = useMonthYear();
  const { resumoMensal } = useResumoMensal();
  const { rows: saidasLegacy, isLoading: loadingLegacy, error: errLegacy } = useSaidas();
  const painel = useSaidasPainel();
  const usandoPainel = HAS_BACKEND && painel.data;
  const manualLinha = useManualLinhaPlanilha(monthYear.ano, monthYear.mes);

  const itensPainelMerged = useMemo((): SaidaPainelItem[] => {
    if (!painel.data?.itens) return [];
    const base = painel.data.itens as SaidaPainelItem[];
    return base.map((i) => {
      const o = manualLinha.overrides[i.id];
      if (!o) return i;
      return {
        ...i,
        linha_planilha_ref: o,
        classificacao_regra: 'manual',
        detalhe: 'Classificação manual (salva neste navegador)',
        match_confianca: 'alta',
      };
    });
  }, [painel.data?.itens, manualLinha.overrides]);

  const saidas: (SaidaPainelItem | TransacaoItem)[] = usandoPainel ? itensPainelMerged : saidasLegacy;
  const isLoading = HAS_BACKEND ? painel.isLoading : loadingLegacy;
  const error = HAS_BACKEND ? painel.error : errLegacy;
  const [filtroPessoa, setFiltroPessoa] = useState('');
  const [comparacaoSoDivergencias, setComparacaoSoDivergencias] = useState(false);
  const [filtroLinhaValidacao, setFiltroLinhaValidacao] = useState('');
  const [mostrarSoPendentesValidacao, setMostrarSoPendentesValidacao] = useState(false);
  const [mostrarSoComSugestao, setMostrarSoComSugestao] = useState(false);
  const [filtroStatusValidacao, setFiltroStatusValidacao] = useState<'todos' | 'validadas' | 'pendentes'>('todos');
  const [linhasValidadas, setLinhasValidadas] = useState<Record<string, boolean>>({});
  const [drillLinhaPlanilha, setDrillLinhaPlanilha] = useState<string | null>(null);
  const [matchExplainItem, setMatchExplainItem] = useState<SaidaPainelItem | null>(null);

  const entidadesQ = useQuery({
    queryKey: ['entidades-byla'],
    queryFn: getEntidadesByla,
    enabled: HAS_BACKEND,
    staleTime: 30 * 60 * 1000,
  });

  const textosBancoParaMatch = useMemo(
    () => saidas.map((r) => `${r.pessoa ?? ''} ${r.descricao ?? ''}`.trim()),
    [saidas],
  );

  const matchBancoQ = useQuery({
    queryKey: ['entidades-byla-match', 'banco', monthYear.mes, monthYear.ano, textosBancoParaMatch.join('\x1e')],
    queryFn: () => postMatchEntidadesLinhas(textosBancoParaMatch),
    enabled: HAS_BACKEND && textosBancoParaMatch.length > 0,
  });

  const {
    porColuna: planilhaPorColuna,
    isLoading: planilhaLoading,
    saidasBlocos: fluxoSaidasBlocos,
    saidaParceirosTotal,
    saidaFixasTotal,
    saidaSomaSecoesPrincipais,
  } = useFluxoCompleto(monthYear.mes, monthYear.ano);

  const mesLabel = `${String(monthYear.mes).padStart(2, '0')}/${String(monthYear.ano).slice(-2)}`;
  const validacaoStorageKey = `byla:saidas-validacao-linhas:${monthYear.ano}-${String(monthYear.mes).padStart(2, '0')}`;

  const rowMes = resumoMensal.find((r) => r.mes === monthYear.mes && r.ano === monthYear.ano) ?? null;

  const totalExtratoExibido = useMemo(() => {
    if (!usandoPainel || !painel.data?.itens?.length) return rowMes?.total_saidas ?? 0;
    const hasManual = Object.keys(manualLinha.overrides).length > 0;
    if (!hasManual && painel.data.totais_extrato_filtrado != null) {
      return painel.data.totais_extrato_filtrado.total_saidas;
    }
    return itensPainelMerged.reduce((s, i) => s + Math.abs(Number(i.valor ?? 0)), 0);
  }, [usandoPainel, painel.data, manualLinha.overrides, itensPainelMerged, rowMes]);

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

  const blocosSaidasPlanilhaFinal = useMemo(() => {
    if (usandoPainel && painel.data?.planilha_blocos?.length) return painel.data.planilha_blocos;
    if (fluxoSaidasBlocos?.length) return fluxoSaidasBlocos;
    return blocosSaidasPlanilha;
  }, [usandoPainel, painel.data, fluxoSaidasBlocos, blocosSaidasPlanilha]);

  const saidasPlanilha = useMemo(
    () => blocosSaidasPlanilhaFinal.flatMap((b) => b.linhas),
    [blocosSaidasPlanilhaFinal]
  );

  const linhasPlanilhaParaMatch = useMemo(
    () => saidasPlanilha.map((l) => l.label),
    [saidasPlanilha],
  );

  const matchPlanilhaQ = useQuery({
    queryKey: ['entidades-byla-match', 'planilha', monthYear.mes, monthYear.ano, linhasPlanilhaParaMatch.join('\x1e')],
    queryFn: () => postMatchEntidadesLinhas(linhasPlanilhaParaMatch),
    enabled: HAS_BACKEND && linhasPlanilhaParaMatch.length > 0,
  });

  const totalSaidasPlanilha = useMemo(() => {
    if (usandoPainel && painel.data?.totais_planilha_por_bloco?.length) {
      return painel.data.totais_planilha_por_bloco.reduce((s, x) => s + x.total, 0);
    }
    return saidasPlanilha.reduce((acc, l) => acc + (l.valorNum ?? 0), 0);
  }, [usandoPainel, painel.data, saidasPlanilha]);

  const diffTotaisGerais = totalExtratoExibido - totalSaidasPlanilha;

  const linhasPlanilhaOpcoes = useMemo(() => {
    const set = new Set<string>();
    for (const l of saidasPlanilha) {
      const k = (l.label ?? '').trim();
      if (k) set.add(k);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [saidasPlanilha]);

  const [validacaoHidratada, setValidacaoHidratada] = useState(false);
  useEffect(() => {
    setValidacaoHidratada(false);
    try {
      const raw = window.localStorage.getItem(validacaoStorageKey);
      if (!raw) {
        setLinhasValidadas({});
        setValidacaoHidratada(true);
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      setLinhasValidadas(parsed && typeof parsed === 'object' ? parsed : {});
    } catch {
      setLinhasValidadas({});
    }
    setValidacaoHidratada(true);
  }, [validacaoStorageKey]);

  useEffect(() => {
    if (!validacaoHidratada) return;
    try {
      window.localStorage.setItem(validacaoStorageKey, JSON.stringify(linhasValidadas));
    } catch {
      // noop
    }
  }, [linhasValidadas, validacaoStorageKey, validacaoHidratada]);

  const saidasFiltradas = useMemo(() => {
    const q = filtroPessoa.trim().toLowerCase();
    if (!q) return saidas;
    return saidas.filter(
      (r) =>
        (r.pessoa || '').toLowerCase().includes(q) ||
        (r.descricao || '').toLowerCase().includes(q)
    );
  }, [saidas, filtroPessoa]);

  const totalFuncionariosPlanilha = useMemo(() => {
    let total = 0;
    for (const bloco of blocosSaidasPlanilhaFinal) {
      for (const l of bloco.linhas) {
        const u = (l.label ?? '').toUpperCase();
        if (u.includes('FUNCION')) {
          total += l.valorNum ?? 0;
        }
      }
    }
    return total;
  }, [blocosSaidasPlanilhaFinal]);

  /** Mesma chave = nome da linha no CONTROLE: total do extrato classificado vs valor digitado na planilha. */
  const comparacaoBancoPlanilhaLinhas = useMemo(() => {
    if (!usandoPainel || !painel.data) return [];
    const resumoBanco = buildResumoPorLinhaItens(itensPainelMerged);
    const mapaBanco = new Map(resumoBanco.map((x) => [x.nome, x]));
    const mapaPl = new Map<string, number>();
    for (const l of saidasPlanilha) {
      const k = (l.label ?? '').trim();
      if (!k) continue;
      mapaPl.set(k, (mapaPl.get(k) ?? 0) + (l.valorNum ?? 0));
    }
    const allLabels = new Set<string>([...mapaBanco.keys(), ...mapaPl.keys()]);
    return [...allLabels]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((label) => {
        const b = mapaBanco.get(label);
        const totalPl = mapaPl.get(label);
        const totalBanco = b?.total ?? null;
        const totalPlanilha = totalPl !== undefined ? totalPl : null;
        const diff =
          totalBanco != null && totalPlanilha != null ? totalBanco - totalPlanilha : null;
        return {
          label,
          totalBanco,
          qtdBanco: b?.qtd ?? 0,
          totalPlanilha,
          diff,
        };
      });
  }, [usandoPainel, painel.data, itensPainelMerged, saidasPlanilha]);

  const comparacaoBancoPlanilhaExibicao = useMemo(() => {
    if (!comparacaoSoDivergencias) return comparacaoBancoPlanilhaLinhas;
    return comparacaoBancoPlanilhaLinhas.filter((row) => {
      if (row.diff == null) return true;
      return Math.abs(row.diff) >= 0.02;
    });
  }, [comparacaoBancoPlanilhaLinhas, comparacaoSoDivergencias]);

  const comparacaoComPossiveisMatches = useMemo(() => {
    if (!usandoPainel || !painel.data) return [];
    return comparacaoBancoPlanilhaExibicao.map((row) => {
      const alvoValor = row.totalPlanilha;
      const scored = itensPainelMerged.map((r) => ({
        id: r.id,
        data: r.data,
        pessoa: r.pessoa,
        descricao: r.descricao ?? null,
        valor: Math.abs(Number(r.valor ?? 0)),
        linhaAtual: r.linha_planilha_ref ?? null,
        score: scoreExtratoParaLinha(row.label, alvoValor, r),
      }));
      const sorted = [...scored].sort((a, b) => b.score - a.score);
      const passou = sorted.filter((c) => c.score >= SCORE_MIN_SUGESTAO);
      let candidatos: MatchCandidato[] = [];
      if (passou.length > 0) {
        candidatos = [{ ...passou[0], origem: 'texto_valor' }];
      } else if (sorted.length > 0) {
        candidatos = [{ ...sorted[0], origem: 'melhor_ranqueado' }];
      }
      if (candidatos.length === 0 && alvoValor != null && alvoValor > 0) {
        const porValor = melhorMatchPorValor(alvoValor, itensPainelMerged);
        if (porValor) candidatos = [porValor];
      }
      return { ...row, candidatos };
    });
  }, [usandoPainel, painel.data, comparacaoBancoPlanilhaExibicao, itensPainelMerged]);
  const comparacaoValidacaoExibicao = useMemo(() => {
    const q = normalizeForMatch(filtroLinhaValidacao.trim());
    return comparacaoComPossiveisMatches.filter((row) => {
      if (q && !normalizeForMatch(row.label).includes(q)) return false;
      if (mostrarSoPendentesValidacao && !!linhasValidadas[row.label]) return false;
      if (mostrarSoComSugestao && row.candidatos.length === 0) return false;
      if (filtroStatusValidacao === 'validadas' && !linhasValidadas[row.label]) return false;
      if (filtroStatusValidacao === 'pendentes' && !!linhasValidadas[row.label]) return false;
      return true;
    });
  }, [
    comparacaoComPossiveisMatches,
    filtroLinhaValidacao,
    mostrarSoPendentesValidacao,
    mostrarSoComSugestao,
    filtroStatusValidacao,
    linhasValidadas,
  ]);

  const totalLinhasValidacao = comparacaoComPossiveisMatches.length;
  const totalLinhasValidadas = useMemo(
    () => comparacaoComPossiveisMatches.reduce((s, r) => s + (linhasValidadas[r.label] ? 1 : 0), 0),
    [comparacaoComPossiveisMatches, linhasValidadas]
  );
  const totalLinhasPendentes = Math.max(0, totalLinhasValidacao - totalLinhasValidadas);

  const itensDrillLinhaPlanilha = useMemo(() => {
    if (!usandoPainel || !drillLinhaPlanilha) return [];
    const list = itensPainelMerged;
    if (drillLinhaPlanilha === 'Não classificado') {
      return list.filter((i) => !i.linha_planilha_ref?.trim());
    }
    return list.filter((i) => i.linha_planilha_ref === drillLinhaPlanilha);
  }, [usandoPainel, itensPainelMerged, drillLinhaPlanilha]);

  return (
    <div className="p-6 space-y-5">
      <PlanilhaLinhaDrillModal
        open={drillLinhaPlanilha != null}
        onClose={() => setDrillLinhaPlanilha(null)}
        linhaNome={drillLinhaPlanilha}
        itens={itensDrillLinhaPlanilha}
      />

      {matchExplainItem ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="match-explain-title"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 border border-slate-200">
            <h2 id="match-explain-title" className="text-lg font-semibold text-slate-900">
              Motivo do match (linha CONTROLE)
            </h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-slate-500 text-xs uppercase">Regra</dt>
                <dd className="text-slate-900 font-medium">
                  {matchExplainItem.classificacao_regra === 'manual'
                    ? 'Manual — você escolheu a linha neste navegador'
                    : matchExplainItem.classificacao_regra === 'nome_na_planilha'
                      ? 'Nome no CONTROLE — linha dedicada com o nome (antes de «Funcionários»)'
                      : matchExplainItem.classificacao_regra === 'funcionario'
                        ? 'Funcionários — cadastro + linha agregada na planilha'
                        : matchExplainItem.classificacao_regra === 'pagador_planilha_controle'
                          ? 'Pagador na planilha de pagamentos (Pilates/Teatro)'
                          : matchExplainItem.classificacao_regra === 'match_controle'
                            ? 'Match texto/valor com linha do CONTROLE'
                            : matchExplainItem.classificacao_regra ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 text-xs uppercase">Confiança</dt>
                <dd className="text-slate-800 capitalize">{matchExplainItem.match_confianca ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500 text-xs uppercase">Bloco / linha sugerida</dt>
                <dd className="text-slate-800">
                  {matchExplainItem.grupo_planilha ?? '—'} → {matchExplainItem.linha_planilha_ref ?? '—'}
                </dd>
              </div>
              {matchExplainItem.detalhe ? (
                <div>
                  <dt className="text-slate-500 text-xs uppercase">Detalhe</dt>
                  <dd className="text-slate-700 whitespace-pre-wrap">{matchExplainItem.detalhe}</dd>
                </div>
              ) : null}
            </dl>
            <button
              type="button"
              className="mt-5 w-full rounded-lg bg-slate-900 text-white py-2 text-sm font-medium hover:bg-slate-800"
              onClick={() => setMatchExplainItem(null)}
            >
              Fechar
            </button>
          </div>
        </div>
      ) : null}

      <Topbar
        title="Saídas"
        subtitle={`Mês ${mesLabel}: validar linha a linha (planilha × extrato) e aplicar match manual quando necessário.`}
      />

      <nav
        aria-label="Ir para seção da página"
        className="sticky top-0 z-30 -mx-1 px-2 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white/90 backdrop-blur-md shadow-sm"
      >
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide shrink-0">Ir para</span>
        <a
          href="#totais-gerais"
          className="text-sm text-violet-800 hover:text-violet-950 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded px-0.5"
        >
          Totais gerais
        </a>
        {usandoPainel && painel.data ? (
          <a
            href="#match-validacao"
            className="text-sm font-medium text-teal-900 hover:text-teal-950 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded px-0.5"
          >
            Match e validação
          </a>
        ) : null}
        {usandoPainel && comparacaoBancoPlanilhaLinhas.length > 0 ? (
          <a
            href="#comparacao-banco-planilha"
            className="text-sm text-violet-800 hover:text-violet-950 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded px-0.5"
          >
            Passo 1 — Matches sugeridos
          </a>
        ) : null}
        {saidas.length > 0 ? (
          <a
            href="#lista-extrato"
            className="text-sm text-violet-800 hover:text-violet-950 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded px-0.5"
          >
            Lista do extrato
          </a>
        ) : null}
        {saidasPlanilha.length > 0 ? (
          <a
            href="#planilha-controle"
            className="text-sm text-violet-800 hover:text-violet-950 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded px-0.5"
          >
            Planilha CONTROLE
          </a>
        ) : null}
      </nav>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800">
          Não foi possível carregar as saídas. {error.message}
        </div>
      )}
      {HAS_BACKEND && painel.error && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900">
          Painel de saídas (categorias/planilha): {painel.error.message}
        </div>
      )}
      {HAS_BACKEND && painel.data?.pagador_planilha_errors?.length ? (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900">
          Avisos ao carregar planilha de pagamentos (match pagador):{' '}
          {painel.data.pagador_planilha_errors.join(' · ')}
        </div>
      ) : null}

      {HAS_BACKEND && (
        <details className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden group">
          <summary className="cursor-pointer list-none flex items-center justify-between gap-3 bg-violet-50 border-b border-violet-100 px-4 py-3 select-none [&::-webkit-details-marker]:hidden">
            <div>
              <h2 className="text-lg font-semibold text-violet-950">Cadastro equipe (opcional)</h2>
              <p className="text-sm text-violet-900 mt-0.5">Só para cruzar nomes; abra se precisar.</p>
            </div>
            <span className="text-violet-700 text-sm shrink-0 transition-transform group-open:rotate-90" aria-hidden>
              ▶
            </span>
          </summary>
          <div className="p-4">
            {entidadesQ.isLoading ? (
              <p className="text-sm text-slate-500">Carregando cadastro…</p>
            ) : entidadesQ.error ? (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Não foi possível carregar o cadastro da equipe.{' '}
                {entidadesQ.error instanceof Error ? entidadesQ.error.message : String(entidadesQ.error)}
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {(entidadesQ.data?.entidades ?? []).map((e) => (
                  <li
                    key={e.nome}
                    className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                      e.subempresa
                        ? 'border-violet-300 bg-violet-50 text-violet-950'
                        : 'border-slate-200 bg-slate-50 text-slate-900'
                    }`}
                  >
                    <span className="font-medium">{e.nome}</span>
                    <span className="text-slate-600 text-xs">{e.funcao}</span>
                    {e.subempresa ? (
                      <span className="text-[10px] uppercase tracking-wide text-violet-700">Subempresa</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      )}

      <section className="rounded-xl shadow-md border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-100">
        <div className="bg-rose-50/90 border-b border-rose-100 px-4 py-3">
          <h2 className="text-lg font-semibold text-rose-950">Extrato e CONTROLE</h2>
          <p className="text-sm text-rose-900/95 mt-0.5">Match, ajuste e validação no bloco teal abaixo.</p>
        </div>

        <div
          id="totais-gerais"
          className="scroll-mt-28 p-4 border-b border-rose-100 bg-white"
        >
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Totais gerais do mês</h3>
          <div className="grid gap-3 sm:grid-cols-3 max-w-4xl">
            <div className="rounded-xl border border-rose-200 bg-rose-50/90 px-4 py-3">
              <p className="text-xs font-medium text-rose-900 uppercase tracking-wide">Extrato (oficial)</p>
              <p className="text-lg font-semibold text-rose-950 tabular-nums mt-1">
                {isLoading ? '…' : totalExtratoExibido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
              </p>
              <p className="text-[11px] text-rose-800/90 mt-1">Total do extrato com filtros oficiais do backend.</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3">
              <p className="text-xs font-medium text-amber-900 uppercase tracking-wide">Planilha CONTROLE</p>
              <p className="text-lg font-semibold text-amber-950 tabular-nums mt-1">
                {planilhaLoading || (HAS_BACKEND && painel.isLoading)
                  ? '…'
                  : totalSaidasPlanilha.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
              </p>
              <p className="text-[11px] text-amber-900/90 mt-1">Soma dos valores das linhas de saída no CONTROLE.</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">Diferença (extrato − planilha)</p>
              <p
                className={`text-lg font-semibold tabular-nums mt-1 ${
                  Math.abs(diffTotaisGerais) < 0.02 ? 'text-emerald-800' : 'text-slate-900'
                }`}
              >
                {isLoading || planilhaLoading || (HAS_BACKEND && painel.isLoading)
                  ? '…'
                  : diffTotaisGerais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
              </p>
              <p className="text-[11px] text-slate-600 mt-1">Referência rápida; linhas podem divergir individualmente.</p>
            </div>
          </div>
        </div>

        {usandoPainel && painel.data ? (
          <div id="match-validacao" className="scroll-mt-28 border-t-2 border-teal-300 bg-gradient-to-b from-teal-50/70 to-white">
            <div className="px-4 py-3 border-b border-teal-200/80 bg-teal-50">
              <h3 className="text-lg font-semibold text-teal-950">Match e validação</h3>
              <p className="text-sm text-teal-900/95 mt-1 max-w-3xl">
                Uma sugestão por linha (texto + valor; se precisar, por valor próximo).{' '}
                <strong>Aplicar match sugerido</strong> grava a linha no navegador; depois <strong>Validar linha</strong>.
              </p>
            </div>

        {comparacaoBancoPlanilhaLinhas.length > 0 ? (
          <div
            id="comparacao-banco-planilha"
            className="scroll-mt-28 p-4 border-b border-rose-100 bg-slate-50/60"
          >
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-800 mb-1">Conferência</p>
                <h3 className="text-base font-semibold text-slate-900 mb-1">Planilha × extrato por linha</h3>
                <p className="text-xs text-slate-600">
                  <strong className="text-rose-900">Extrato</strong> = soma classificada na linha; <strong className="text-amber-900">Planilha</strong> = valor no CONTROLE.
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2">
                <input
                  type="checkbox"
                  checked={comparacaoSoDivergencias}
                  onChange={(e) => setComparacaoSoDivergencias(e.target.checked)}
                  className="rounded border-slate-300 text-violet-700 focus:ring-violet-500"
                />
                Só divergentes/sem par
              </label>
            </div>
            <div className="mb-3 grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <div className="text-[11px] text-slate-500">Linhas (filtro atual)</div>
                <div className="text-lg font-semibold text-slate-900">{comparacaoValidacaoExibicao.length}</div>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                <div className="text-[11px] text-emerald-700">Validadas</div>
                <div className="text-lg font-semibold text-emerald-800">{totalLinhasValidadas}</div>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <div className="text-[11px] text-amber-700">Pendentes</div>
                <div className="text-lg font-semibold text-amber-800">{totalLinhasPendentes}</div>
              </div>
            </div>
            <div className="mb-3 flex flex-wrap gap-3 items-end">
              <div className="min-w-[14rem] flex-1">
                <label htmlFor="filtro-linha-validacao" className="block text-xs font-medium text-slate-700 mb-1">
                  Filtrar linha do CONTROLE
                </label>
                <input
                  id="filtro-linha-validacao"
                  type="search"
                  value={filtroLinhaValidacao}
                  onChange={(e) => setFiltroLinhaValidacao(e.target.value)}
                  placeholder="Ex.: Luciana, Funcionários..."
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2">
                <input
                  type="checkbox"
                  checked={mostrarSoPendentesValidacao}
                  onChange={(e) => setMostrarSoPendentesValidacao(e.target.checked)}
                  className="rounded border-slate-300 text-violet-700 focus:ring-violet-500"
                />
                Só pendentes de validação
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2">
                <input
                  type="checkbox"
                  checked={mostrarSoComSugestao}
                  onChange={(e) => setMostrarSoComSugestao(e.target.checked)}
                  className="rounded border-slate-300 text-violet-700 focus:ring-violet-500"
                />
                Só com sugestão de match
              </label>
              <div>
                <label htmlFor="status-validacao-filtro" className="block text-xs font-medium text-slate-700 mb-1">
                  Status de validação
                </label>
                <select
                  id="status-validacao-filtro"
                  value={filtroStatusValidacao}
                  onChange={(e) => setFiltroStatusValidacao(e.target.value as 'todos' | 'validadas' | 'pendentes')}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="todos">Todos</option>
                  <option value="pendentes">Pendentes</option>
                  <option value="validadas">Validadas</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFiltroLinhaValidacao('');
                  setComparacaoSoDivergencias(false);
                  setMostrarSoPendentesValidacao(false);
                  setMostrarSoComSugestao(false);
                  setFiltroStatusValidacao('todos');
                }}
                className="text-xs rounded-md px-2.5 py-2 border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              >
                Limpar filtros
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Clique no <strong>nome da linha</strong> para abrir os lançamentos já classificados nela.
            </p>
            <div className="max-h-[min(28rem,70vh)] overflow-y-auto overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
              <table className="min-w-[1160px] w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-slate-200 bg-slate-100/95 text-left text-xs uppercase tracking-wide text-slate-600 shadow-sm">
                    <th className="px-3 py-2 font-semibold">Linha CONTROLE</th>
                    <th className="px-3 py-2 font-semibold text-rose-900">Extrato (classificado)</th>
                    <th className="px-3 py-2 font-semibold text-amber-900">Planilha</th>
                    <th className="px-3 py-2 font-semibold">Diferença</th>
                    <th className="px-3 py-2 font-semibold w-[6.5rem]">Status</th>
                    <th className="px-3 py-2 font-semibold">Melhor match (extrato)</th>
                    <th className="px-3 py-2 font-semibold">Ações</th>
                    <th className="px-3 py-2 font-semibold">Validação</th>
                  </tr>
                </thead>
                <tbody>
                  {comparacaoValidacaoExibicao.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-sm text-slate-500">
                        {comparacaoSoDivergencias
                          ? 'Nenhuma linha com diferença — todas batem com a planilha (tolerância R$ 0,02).'
                          : 'Sem linhas para exibir com os filtros atuais.'}
                      </td>
                    </tr>
                  ) : null}
                  {comparacaoValidacaoExibicao.map((row) => {
                    const fmt = (n: number | null) =>
                      n == null
                        ? '—'
                        : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                    const okDiff =
                      row.diff != null && Math.abs(row.diff) < 0.02;
                    const st = statusComparacaoLinha(row);
                    const cand = row.candidatos[0] ?? null;
                    const jaBate = cand ? (cand.linhaAtual ?? '').trim() === row.label.trim() : false;
                    const validada = !!linhasValidadas[row.label];
                    const manualAplicado = cand ? (manualLinha.overrides[cand.id] ?? '') === row.label : false;
                    return (
                      <tr key={row.label} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80">
                        <td className="px-3 py-2 font-medium text-slate-900 align-top">
                          <button
                            type="button"
                            onClick={() => setDrillLinhaPlanilha(row.label)}
                            className="text-left w-full rounded-md -mx-1 px-1 py-0.5 hover:bg-violet-100/80 hover:text-violet-950 transition-colors"
                          >
                            {row.label}
                          </button>
                        </td>
                        <td className="px-3 py-2 tabular-nums text-rose-950 align-top">
                          {fmt(row.totalBanco)}
                          {row.qtdBanco > 0 ? (
                            <span className="text-slate-400 text-xs font-normal ml-1">({row.qtdBanco})</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-amber-950 align-top">{fmt(row.totalPlanilha)}</td>
                        <td
                          className={`px-3 py-2 tabular-nums align-top ${
                            row.diff == null
                              ? 'text-slate-400'
                              : okDiff
                                ? 'text-emerald-700'
                                : 'text-rose-700'
                          }`}
                        >
                          {row.diff == null ? '—' : fmt(row.diff)}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <span
                            className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md border ${st.className}`}
                          >
                            {st.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 align-top">
                          {!cand ? (
                            <span className="text-xs text-slate-400">Sem candidato forte</span>
                          ) : (
                            <div className="text-xs leading-snug">
                              <span className="font-medium text-slate-900">{cand.pessoa || 'Sem nome'}</span>{' '}
                              <span className="text-slate-500">
                                ({cand.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})
                              </span>{' '}
                              <span className="text-teal-700">score {(cand.score * 100).toFixed(0)}%</span>
                              <span
                                className={`ml-1 inline-block rounded px-1.5 py-0.5 text-[10px] border ${
                                  cand.linhaAtual
                                    ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
                                    : 'text-slate-600 bg-slate-50 border-slate-200'
                                }`}
                              >
                                {cand.linhaAtual ? 'Já classificado' : 'Não classificado'}
                              </span>
                              {cand.linhaAtual ? (
                                <span className="text-slate-400"> · atual: {cand.linhaAtual}</span>
                              ) : null}
                              {cand.origem === 'melhor_ranqueado' ? (
                                <div className="text-[10px] text-amber-800 mt-0.5">Melhor disponível (texto fraco; confira).</div>
                              ) : null}
                              {cand.origem === 'valor_proximo' ? (
                                <div className="text-[10px] text-amber-800 mt-0.5">Sugestão por valor próximo ao da planilha.</div>
                              ) : null}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 align-top">
                          {!cand ? (
                            <span className="text-xs text-slate-400">Sem ação (sem sugestão)</span>
                          ) : (
                            <div className="space-y-1.5">
                              <button
                                type="button"
                                disabled={jaBate}
                                onClick={() => manualLinha.setLinha(cand.id, row.label)}
                                className="text-xs rounded-md px-2 py-1.5 border border-violet-300 bg-violet-50 text-violet-900 hover:bg-violet-100 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {jaBate ? 'Match já está correto' : 'Aplicar match sugerido'}
                              </button>
                              {manualAplicado ? (
                                <button
                                  type="button"
                                  onClick={() => manualLinha.setLinha(cand.id, null)}
                                  className="ml-1 text-xs rounded-md px-2 py-1.5 border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                                >
                                  Desfazer match manual
                                </button>
                              ) : null}
                              {manualAplicado ? (
                                <div className="text-[11px] text-emerald-700 font-medium">Match manual aplicado</div>
                              ) : null}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setLinhasValidadas((prev) => ({ ...prev, [row.label]: !prev[row.label] }))}
                              className={`text-xs rounded-md px-2 py-1.5 border ${
                                validada
                                  ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                                  : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                              }`}
                            >
                              {validada ? 'Validada' : 'Validar linha'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="px-4 py-3 border-b border-teal-100 text-sm text-slate-600 bg-white">
            Sem linhas para comparar ainda — aguarde o carregamento ou verifique o backend.
          </div>
        )}

          </div>
        ) : null}

        {saidas.length > 0 && (
          <details id="lista-extrato" className="scroll-mt-28 border-t border-rose-200 group">
            <summary className="cursor-pointer list-none bg-rose-50/80 border-b border-rose-100 px-4 py-3 select-none [&::-webkit-details-marker]:hidden flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-rose-950">Lista completa do extrato (opcional)</h3>
              <span className="text-rose-700 text-sm shrink-0 group-open:rotate-90 transition-transform" aria-hidden>
                ▶
              </span>
            </summary>
            <div className="bg-rose-50/80 border-b border-rose-100 px-4 py-3 -mt-px">
              <h3 className="text-base font-semibold text-rose-950 sr-only">Todas as saídas do extrato (lista)</h3>
              <p className="text-sm text-rose-800 mt-0.5">
                Transações <code className="text-xs bg-rose-100 px-1 rounded">saida</code> com filtros oficiais.
                {usandoPainel
                  ? ' Escolha outra linha em «Ajustar linha» para validar no seu navegador; «Ver motivo» explica a regra automática.'
                  : ''}
              </p>
              {usandoPainel && Object.keys(manualLinha.overrides).length > 0 ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-amber-900">
                    {Object.keys(manualLinha.overrides).length} ajuste(s) manual(is) neste mês (só neste aparelho).
                  </span>
                  <button
                    type="button"
                    onClick={() => manualLinha.clearMes()}
                    className="text-xs font-medium text-rose-800 underline underline-offset-2"
                  >
                    Limpar todos os ajustes do mês
                  </button>
                </div>
              ) : null}
              <input
                type="search"
                placeholder="Filtrar por pessoa ou descrição…"
                value={filtroPessoa}
                onChange={(e) => setFiltroPessoa(e.target.value)}
                className="mt-2 w-full max-w-md rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div className="p-4 max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-rose-50 sticky top-0">
                <tr>
                  <th className="text-left py-2.5 px-3 font-medium text-rose-900">Data</th>
                  <th className="text-left py-2.5 px-3 font-medium text-rose-900">Pessoa</th>
                  {usandoPainel ? (
                    <>
                      <th className="text-left py-2.5 px-2 font-medium text-rose-900 text-xs max-w-[7rem]">
                        Categoria (banco)
                      </th>
                      <th className="text-left py-2.5 px-2 font-medium text-rose-900 text-xs max-w-[7rem]">
                        Linha CONTROLE
                      </th>
                      <th className="text-left py-2.5 px-2 font-medium text-rose-900 text-xs max-w-[6rem]">Conf.</th>
                      <th className="text-left py-2.5 px-1 font-medium text-rose-900 text-xs max-w-[9rem]">
                        Ajustar linha
                      </th>
                      <th className="text-left py-2.5 px-1 font-medium text-rose-900 text-xs">Motivo</th>
                    </>
                  ) : null}
                  {HAS_BACKEND ? (
                    <th className="text-left py-2.5 px-3 font-medium text-rose-900 w-[9rem]">Equipe / unidade</th>
                  ) : null}
                  <th className="text-right py-2.5 px-3 font-medium text-rose-900">Valor</th>
                  <th className="text-left py-2.5 px-3 font-medium text-rose-900">Descrição</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={4 + (HAS_BACKEND ? 1 : 0) + (usandoPainel ? 5 : 0)}
                      className="py-4 px-3 text-center text-slate-500"
                    >
                      Carregando saídas…
                    </td>
                  </tr>
                ) : saidasFiltradas.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4 + (HAS_BACKEND ? 1 : 0) + (usandoPainel ? 5 : 0)}
                      className="py-4 px-3 text-center text-slate-500"
                    >
                      {saidas.length === 0 ? 'Nenhuma saída registrada para este mês.' : 'Nenhum resultado para o filtro.'}
                    </td>
                  </tr>
                ) : (
                  saidasFiltradas.slice(0, 200).map((r) => {
                    const idxOriginal = saidas.findIndex((x) => x.id === r.id);
                    const matchB =
                      idxOriginal >= 0 && matchBancoQ.data?.resultados
                        ? matchBancoQ.data.resultados[idxOriginal]?.match
                        : null;
                    const pr = r as SaidaPainelItem;
                    const temPainel = usandoPainel && 'categoria_sugerida_banco' in r;
                    return (
                      <tr key={r.id} className="border-t border-slate-200 hover:bg-rose-50/40">
                        <td className="py-2.5 px-3 text-slate-800">{r.data}</td>
                        <td className="py-2.5 px-3 text-slate-900">{r.pessoa}</td>
                        {temPainel ? (
                          <>
                            <td className="py-2.5 px-2 text-xs text-slate-800 max-w-[7rem]">
                              {pr.categoria_sugerida_banco ?? '—'}
                            </td>
                            <td className="py-2.5 px-2 text-xs text-teal-900 max-w-[9rem]">
                              <div className="font-medium">{pr.grupo_planilha ?? pr.secao_planilha ?? '—'}</div>
                              {pr.linha_planilha_ref ? (
                                <div className="text-slate-600 truncate" title={pr.linha_planilha_ref}>
                                  {pr.linha_planilha_ref}
                                </div>
                              ) : null}
                              {pr.detalhe ? (
                                <div className="text-violet-800 mt-0.5 truncate" title={pr.detalhe}>
                                  → {pr.detalhe}
                                </div>
                              ) : null}
                              {pr.classificacao_regra ? (
                                <div className="text-[10px] uppercase tracking-wide text-slate-400 mt-0.5">
                                  {pr.classificacao_regra}
                                </div>
                              ) : null}
                            </td>
                            <td className="py-2.5 px-2 text-xs text-slate-600 capitalize">
                              {pr.match_confianca ?? '—'}
                            </td>
                            <td className="py-2 px-1 align-top">
                              <label className="sr-only" htmlFor={`linha-manual-${r.id}`}>
                                Ajustar linha CONTROLE
                              </label>
                              <select
                                id={`linha-manual-${r.id}`}
                                value={manualLinha.overrides[r.id] ?? ''}
                                onChange={(e) => manualLinha.setLinha(r.id, e.target.value || null)}
                                className="w-full max-w-[11rem] text-xs rounded-md border border-violet-200 bg-white py-1.5 px-1"
                              >
                                <option value="">Automático</option>
                                {linhasPlanilhaOpcoes.map((nome) => (
                                  <option key={nome} value={nome}>
                                    {nome.length > 48 ? `${nome.slice(0, 46)}…` : nome}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2 px-1 align-top">
                              <button
                                type="button"
                                className="text-xs text-violet-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded"
                                onClick={() => setMatchExplainItem(pr)}
                              >
                                Ver motivo
                              </button>
                            </td>
                          </>
                        ) : null}
                        {HAS_BACKEND ? (
                          <td className="py-2.5 px-3 align-top">
                            {matchBancoQ.isLoading ? (
                              <span className="text-xs text-slate-400">…</span>
                            ) : matchBancoQ.isError ? (
                              <span className="text-xs text-amber-600">—</span>
                            ) : (
                              <MatchEquipeCell match={matchB} />
                            )}
                          </td>
                        ) : null}
                        <td className="py-2.5 px-3 text-right font-medium text-rose-900 tabular-nums">
                          {r.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">{r.descricao ?? '—'}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            </div>
          </details>
        )}

      {saidasPlanilha.length > 0 && (
        <div id="planilha-controle" className="scroll-mt-28 border-t border-slate-200">
          <div className="bg-amber-50/90 border-b border-amber-100 px-4 py-3">
            <h2 className="text-lg font-semibold text-amber-950">Planilha CONTROLE DE CAIXA</h2>
            <p className="text-sm text-amber-900 mt-0.5">
              Valores só da planilha. O detalhe por bloco fica recolhido para não poluir a tela.
            </p>
          </div>

          <details className="group border-b border-amber-100">
            <summary className="cursor-pointer list-none bg-amber-50/70 px-4 py-2.5 text-sm font-medium text-amber-950 select-none [&::-webkit-details-marker]:hidden flex justify-between items-center">
              <span>Ver totais e linhas da planilha (por bloco)</span>
              <span className="text-amber-800/80 group-open:rotate-90 transition-transform" aria-hidden>
                ▶
              </span>
            </summary>
          <div className="p-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 border-b border-amber-100">
            <KpiCard
              label="Parceiros + Fixas (planilha)"
              value={
                saidaSomaSecoesPrincipais != null && saidaSomaSecoesPrincipais > 0
                  ? saidaSomaSecoesPrincipais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
                  : totalSaidasPlanilha.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
              }
              accentColor="primary"
              isLoading={planilhaLoading || (HAS_BACKEND && painel.isLoading)}
            />
            <KpiCard
              label="Saídas Parceiros"
              value={
                saidaParceirosTotal != null
                  ? saidaParceirosTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
                  : '—'
              }
              accentColor="primary"
              isLoading={planilhaLoading}
            />
            <KpiCard
              label="Saídas Fixas"
              value={
                saidaFixasTotal != null
                  ? saidaFixasTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
                  : '—'
              }
              accentColor="primary"
              isLoading={planilhaLoading}
            />
            <KpiCard
              label="Todos os blocos (planilha)"
              value={totalSaidasPlanilha.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
              accentColor="primary"
              isLoading={planilhaLoading || (HAS_BACKEND && painel.isLoading)}
            />
            <KpiCard
              label="Linha Funcionários (planilha)"
              value={totalFuncionariosPlanilha.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
              accentColor="primary"
              isLoading={planilhaLoading}
            />
          </div>

          {usandoPainel && painel.data?.totais_planilha_por_bloco?.length ? (
            <div className="px-4 pb-4 pt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 border-b border-amber-100">
              {painel.data.totais_planilha_por_bloco.map((b) => (
                <div key={b.titulo} className="rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 text-sm">
                  <div className="text-amber-900 text-xs font-medium">{b.titulo}</div>
                  <div className="text-amber-950 font-semibold tabular-nums">
                    {b.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </div>
                  <div className="text-amber-800/80 text-xs">{b.qtd} linha(s)</div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="bg-amber-50/60 border-b border-amber-100 px-4 py-2">
            <h3 className="text-sm font-semibold text-amber-950">Detalhe por bloco (linhas da planilha)</h3>
            <p className="text-xs text-amber-900 mt-0.5">
              Parceiros, gastos fixos e demais — ordem das linhas na aba. Equipe cruza com o cadastro.
            </p>
          </div>
          <div className="p-4 border-t border-slate-200 max-h-80 overflow-y-auto">
            {blocosSaidasPlanilhaFinal.map((b, idx) => {
              const offsetBloco = blocosSaidasPlanilhaFinal
                .slice(0, idx)
                .reduce((s, x) => s + x.linhas.length, 0);
              return (
              <div key={idx} className="mb-4 last:mb-0 bg-white rounded-lg border border-amber-200 overflow-hidden">
                <div className="bg-amber-100 px-3 py-2 border-b border-amber-200">
                  <span className="text-sm font-semibold text-amber-900">{b.titulo}</span>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-amber-50 sticky top-0">
                    <tr>
                      <th className="text-left py-2.5 px-3 font-medium text-amber-900">Categoria / Descrição</th>
                      {HAS_BACKEND ? (
                        <th className="text-left py-2.5 px-3 font-medium text-amber-900 w-[9rem]">Equipe / unidade</th>
                      ) : null}
                      <th className="text-right py-2.5 px-3 font-medium text-amber-900">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.linhas.map((l, i) => {
                      const flatIdx = offsetBloco + i;
                      const matchP =
                        matchPlanilhaQ.data?.resultados?.[flatIdx]?.match ?? null;
                      return (
                        <tr key={i} className="border-t border-amber-100 hover:bg-amber-50/50">
                          <td className="py-2.5 px-3 text-slate-900">{l.label}</td>
                          {HAS_BACKEND ? (
                            <td className="py-2.5 px-3 align-top">
                              {matchPlanilhaQ.isLoading ? (
                                <span className="text-xs text-slate-400">…</span>
                              ) : matchPlanilhaQ.isError ? (
                                <span className="text-xs text-amber-600">—</span>
                              ) : (
                                <MatchEquipeCell match={matchP} />
                              )}
                            </td>
                          ) : null}
                          <td className="py-2.5 px-3 text-right font-medium text-slate-900 tabular-nums">
                            {l.valorNum != null
                              ? l.valorNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                              : l.valor ?? '–'}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="border-t border-amber-200 bg-amber-50/80">
                      <td
                        className="py-2.5 px-3 text-amber-900 font-semibold"
                        colSpan={HAS_BACKEND ? 2 : 1}
                      >
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
              );
            })}
            {planilhaLoading && (
              <p className="px-3 py-2 text-xs text-slate-500">Carregando dados da planilha CONTROLE DE CAIXA…</p>
            )}
          </div>
          </details>
        </div>
      )}
        </div>
      </section>

    </div>
  );
}
