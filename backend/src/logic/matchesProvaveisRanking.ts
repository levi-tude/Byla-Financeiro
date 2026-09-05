/**
 * Ranking 1:1 e N→1 de matches prováveis a partir de itens já carregados.
 */
import {
  matchUmPagamentoPlanilhaBanco,
  matchPagamentosAgrupadosPlanilhaBanco,
  grupoNpara1Compativel,
  type PlanilhaItem,
  type BancoItem,
} from './conciliacaoPagamentoMatch.js';
import { planilhaIdFromFluxoUuid } from './fluxoPagamentoFingerprint.js';
import {
  MATCHES_PROVAVEIS_BUCKETS,
  MATCHES_PROVAVEIS_GAP_ALTO,
  bucketMatchesProvaveis,
  scoreParMatchesProvaveis,
  type MatchesProvaveisBucket,
  type MatchesProvaveisScoreBreakdown,
} from './matchesProvaveisScore.js';

export type MatchesProvaveisSugestao = {
  bucket: MatchesProvaveisBucket;
  score: number;
  engine: string;
  ambiguo: boolean;
  n_para_1: boolean;
  /** IDs canônicos `fluxo::<uuid>` para POST validacao-vinculos. */
  planilha_ids: string[];
  banco_id: string;
  aluno: string;
  aba: string;
  modalidade: string;
  forma: string;
  data_fluxo: string;
  data_banco: string;
  valor_fluxo: number;
  valor_banco: number;
  pessoa_banco: string;
  breakdown: MatchesProvaveisScoreBreakdown;
  gap_2o: number | null;
  candidatos_alternativos: Array<{
    banco_id: string;
    pessoa_banco: string;
    data_banco: string;
    valor_banco: number;
    score: number;
    razoes: string[];
  }>;
  /** true só quando alto, único, sem N→1 — seguro para Confirmar na UI. */
  pode_confirmar: boolean;
};

export type MatchesProvaveisRankingResult = {
  sugestoes: MatchesProvaveisSugestao[];
  n1: MatchesProvaveisSugestao[];
  semCandidato: PlanilhaItem[];
  stats: {
    sem_vinculo: number;
    alto: number;
    medio: number;
    baixo: number;
    sem_candidato: number;
  };
};

function toPlanilhaId(id: string): string {
  return planilhaIdFromFluxoUuid(id);
}

function buildSugestao(params: {
  bucket: MatchesProvaveisBucket;
  score: number;
  engine: string;
  ambiguo: boolean;
  n_para_1: boolean;
  planilha_ids: string[];
  banco_id: string;
  aluno: string;
  aba: string;
  modalidade: string;
  forma: string;
  data_fluxo: string;
  data_banco: string;
  valor_fluxo: number;
  valor_banco: number;
  pessoa_banco: string;
  breakdown: MatchesProvaveisScoreBreakdown;
  gap_2o: number | null;
  candidatos_alternativos?: MatchesProvaveisSugestao['candidatos_alternativos'];
}): MatchesProvaveisSugestao {
  const pode_confirmar =
    params.bucket === 'alto' && !params.ambiguo && !params.n_para_1 && params.planilha_ids.length === 1;
  return {
    ...params,
    candidatos_alternativos: params.candidatos_alternativos ?? [],
    pode_confirmar,
  };
}

/**
 * Ranqueia pagamentos do Fluxo sem vínculo × entradas bancárias livres.
 * Inclui baixo no resultado interno; a API filtra alto/médio para a lista do admin.
 */
export function ranquearMatchesProvaveis(params: {
  pendentes: PlanilhaItem[];
  bancoLivres: BancoItem[];
  stickyKeys: Set<string>;
  flexDays: number;
}): MatchesProvaveisRankingResult {
  const { pendentes, bancoLivres, stickyKeys, flexDays } = params;
  const B = MATCHES_PROVAVEIS_BUCKETS;
  const sugestoesRaw: MatchesProvaveisSugestao[] = [];
  let semCandidato = 0;

  for (const p of pendentes) {
    const scored: Array<{ banco: BancoItem; bd: MatchesProvaveisScoreBreakdown }> = [];
    for (const b of bancoLivres) {
      const bd = scoreParMatchesProvaveis(p, b, stickyKeys, flexDays);
      if (bd && bd.total >= B.baixo) scored.push({ banco: b, bd });
    }
    scored.sort((a, b) => b.bd.total - a.bd.total);

    const engine = matchUmPagamentoPlanilhaBanco(p, bancoLivres, new Set(), []);

    if (scored.length === 0) {
      semCandidato += 1;
      continue;
    }

    const top = scored[0];
    const second = scored[1];
    const gap = second ? top.bd.total - second.bd.total : 99;
    // Segurança do lote: "alto" exige exatamente um candidato compatível.
    // O gap serve para explicar o ranking, nunca para escolher sozinho entre dois bancos.
    const ambiguo =
      scored.length > 1 ||
      scored.filter((s) => s.bd.total >= top.bd.total - MATCHES_PROVAVEIS_GAP_ALTO).length > 1 ||
      (engine.status === 'possivel' && engine.candidatos.length > 1 && gap < 10);

    let bucket = bucketMatchesProvaveis(top.bd.total, ambiguo);
    if (engine.status === 'confirmado' && top.banco.id === engine.banco.id && !ambiguo) {
      bucket = top.bd.total >= B.medio ? 'alto' : bucket;
    }
    if (!bucket) {
      semCandidato += 1;
      continue;
    }

    sugestoesRaw.push(
      buildSugestao({
        bucket,
        score: top.bd.total,
        engine: engine.status,
        ambiguo,
        n_para_1: false,
        planilha_ids: [toPlanilhaId(p.id)],
        banco_id: top.banco.id,
        aluno: p.aluno,
        aba: p.aba,
        modalidade: p.modalidade || p.aba,
        forma: p.forma,
        data_fluxo: p.data.slice(0, 10),
        data_banco: String(top.banco.data).slice(0, 10),
        valor_fluxo: Number(p.valor || 0),
        valor_banco: Number(top.banco.valor || 0),
        pessoa_banco: top.banco.pessoa || '',
        breakdown: top.bd,
        gap_2o: second ? Math.round(gap * 10) / 10 : null,
        candidatos_alternativos: scored.slice(0, 3).map(({ banco, bd }) => ({
          banco_id: banco.id,
          pessoa_banco: banco.pessoa || '',
          data_banco: String(banco.data).slice(0, 10),
          valor_banco: Number(banco.valor || 0),
          score: bd.total,
          razoes: bd.razoes,
        })),
      }),
    );
  }

  // Dedup: melhor score por planilha_id
  const bestByFluxo = new Map<string, MatchesProvaveisSugestao>();
  for (const s of sugestoesRaw) {
    const id = s.planilha_ids[0];
    const prev = bestByFluxo.get(id);
    if (!prev || s.score > prev.score) bestByFluxo.set(id, s);
  }
  const sugestoes = [...bestByFluxo.values()].sort((a, b) => b.score - a.score);

  // Um mesmo banco concorrendo com mais de um pagamento nunca é confirmação automática.
  const qtdPorBanco = new Map<string, number>();
  for (const s of sugestoes) qtdPorBanco.set(s.banco_id, (qtdPorBanco.get(s.banco_id) ?? 0) + 1);
  for (const s of sugestoes) {
    if ((qtdPorBanco.get(s.banco_id) ?? 0) <= 1) continue;
    s.ambiguo = true;
    s.pode_confirmar = false;
    if (s.bucket === 'alto') s.bucket = 'medio';
  }

  // N→1: mesmo dia, mesmo aluno / família / pagador
  const n1: MatchesProvaveisSugestao[] = [];
  const matchedIds = new Set(sugestoes.map((s) => s.planilha_ids[0]));
  const porDia = new Map<string, PlanilhaItem[]>();
  for (const p of pendentes) {
    const d = p.data.slice(0, 10);
    const arr = porDia.get(d) ?? [];
    arr.push(p);
    porDia.set(d, arr);
  }

  for (const [, diaItems] of porDia) {
    if (diaItems.length < 2) continue;
    const used = new Set<string>();
    for (const seed of diaItems) {
      if (used.has(seed.id)) continue;
      const grupo = [seed];
      used.add(seed.id);
      for (const other of diaItems) {
        if (used.has(other.id)) continue;
        if (grupo.some((g) => grupoNpara1Compativel(g, other))) {
          grupo.push(other);
          used.add(other.id);
        }
      }
      if (grupo.length < 2) continue;
      // Só sugerir N→1 se nenhum do grupo já tem 1:1 alto inequívoco
      const grupoIds = grupo.map((g) => toPlanilhaId(g.id));
      if (grupoIds.every((id) => matchedIds.has(id))) {
        const todosAlto = grupoIds.every((id) => {
          const s = bestByFluxo.get(id);
          return s && s.bucket === 'alto' && !s.ambiguo;
        });
        if (todosAlto) continue;
      }

      const agg = matchPagamentosAgrupadosPlanilhaBanco(grupo, bancoLivres, new Set(), []);
      if (agg.status !== 'possivel' || agg.candidatos.length === 0) continue;
      const banco = agg.candidatos[0];
      const sintetico: PlanilhaItem = {
        ...grupo[0],
        id: `agrupado::${grupo.map((g) => g.id).join('|')}`,
        valor: grupo.reduce((s, g) => s + g.valor, 0),
        responsaveis: Array.from(
          new Set(
            grupo.flatMap(
              (g) => [g.aluno, ...(g.responsaveis ?? []), g.pagadorPix].filter(Boolean) as string[],
            ),
          ),
        ),
      };
      const bd = scoreParMatchesProvaveis(sintetico, banco, stickyKeys, flexDays);
      if (!bd || bd.total < B.baixo) continue;
      const bucket = bucketMatchesProvaveis(bd.total, agg.candidatos.length > 1) ?? 'baixo';
      // N→1 nunca sobe a "pode confirmar" — revisão na Validação
      const capped: MatchesProvaveisBucket = bucket === 'alto' ? 'medio' : bucket;
      n1.push(
        buildSugestao({
          bucket: capped,
          score: bd.total,
          engine: 'n1_possivel',
          ambiguo: true,
          n_para_1: true,
          planilha_ids: grupoIds,
          banco_id: banco.id,
          aluno: grupo.map((g) => g.aluno).join(' + '),
          aba: [...new Set(grupo.map((g) => g.aba))].join(', '),
          modalidade: [...new Set(grupo.map((g) => g.modalidade || g.aba))].join(', '),
          forma: grupo.map((g) => g.forma).join('/'),
          data_fluxo: grupo[0].data.slice(0, 10),
          data_banco: String(banco.data).slice(0, 10),
          valor_fluxo: sintetico.valor,
          valor_banco: Number(banco.valor || 0),
          pessoa_banco: banco.pessoa || '',
          breakdown: bd,
          gap_2o: null,
          candidatos_alternativos: agg.candidatos.slice(0, 3).map((candidato) => ({
            banco_id: candidato.id,
            pessoa_banco: candidato.pessoa || '',
            data_banco: String(candidato.data).slice(0, 10),
            valor_banco: Number(candidato.valor || 0),
            score: bd.total,
            razoes: bd.razoes,
          })),
        }),
      );
    }
  }

  const matchedAfter = new Set([
    ...sugestoes
      .filter((s) => s.bucket === 'alto' || s.bucket === 'medio')
      .flatMap((s) => s.planilha_ids),
    ...n1.flatMap((s) => s.planilha_ids),
  ]);
  const semCandidatoItens = pendentes.filter((p) => !matchedAfter.has(toPlanilhaId(p.id)));
  semCandidato = semCandidatoItens.length;

  return {
    sugestoes,
    n1,
    semCandidato: semCandidatoItens,
    stats: {
      sem_vinculo: pendentes.length,
      alto: sugestoes.filter((s) => s.bucket === 'alto').length,
      medio: sugestoes.filter((s) => s.bucket === 'medio').length,
      baixo: sugestoes.filter((s) => s.bucket === 'baixo').length,
      sem_candidato: semCandidato,
    },
  };
}
