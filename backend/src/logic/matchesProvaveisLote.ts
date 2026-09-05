import { createHash } from 'node:crypto';
import { normalizePlanilhaId } from './fluxoPagamentoFingerprint.js';

export type GrupoUiMatch = 'seguro' | 'medio' | 'ambiguo';

export type MatchSeguroLote = {
  pode_confirmar: boolean;
  ambiguo: boolean;
  n_para_1: boolean;
  planilha_ids: string[];
  banco_id: string;
  data_fluxo: string;
  score: number;
};

export type VinculoExistenteLote = {
  planilha_id: string;
  banco_id: string;
};

export type PlanoConfirmacaoLote = {
  status: 'ok' | 'desatualizado';
  pares: Array<{ planilhaId: string; bancoId: string; dataFluxo: string }>;
  ignorados: number;
};

export type ParConfirmacaoLote = PlanoConfirmacaoLote['pares'][number];

export type ResultadoExecucaoLote = {
  aplicados: ParConfirmacaoLote[];
  ignorados: ParConfirmacaoLote[];
  erros: Array<ParConfirmacaoLote & { erro: string }>;
};

export function grupoUiParaMatch(item: MatchSeguroLote): GrupoUiMatch {
  if (item.ambiguo || item.n_para_1) return 'ambiguo';
  if (
    item.pode_confirmar &&
    item.planilha_ids.length === 1 &&
    Boolean(item.banco_id) &&
    Boolean(item.data_fluxo)
  ) {
    return 'seguro';
  }
  return 'medio';
}

function itensSeguros(itens: MatchSeguroLote[]): MatchSeguroLote[] {
  return itens.filter((item) => grupoUiParaMatch(item) === 'seguro');
}

export function analiseIdParaSeguros(itens: MatchSeguroLote[]): string {
  const payload = itensSeguros(itens)
    .map((item) => ({
      planilhaId: normalizePlanilhaId(item.planilha_ids[0]),
      bancoId: String(item.banco_id),
      dataFluxo: String(item.data_fluxo).slice(0, 10),
      score: Math.round(Number(item.score) * 10) / 10,
    }))
    .sort((a, b) =>
      `${a.planilhaId}|${a.bancoId}`.localeCompare(`${b.planilhaId}|${b.bancoId}`),
    );
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 24);
}

export function planejarConfirmacaoLote(args: {
  itensAtuais: MatchSeguroLote[];
  analiseId: string;
  vinculosExistentes: VinculoExistenteLote[];
}): PlanoConfirmacaoLote {
  const seguros = itensSeguros(args.itensAtuais);
  if (analiseIdParaSeguros(seguros) !== args.analiseId) {
    return { status: 'desatualizado', pares: [], ignorados: seguros.length };
  }

  const planilhasUsadas = new Set(
    args.vinculosExistentes.map((v) => normalizePlanilhaId(v.planilha_id)),
  );
  const bancosUsados = new Set(
    args.vinculosExistentes.map((v) => String(v.banco_id)).filter(Boolean),
  );
  const pares: PlanoConfirmacaoLote['pares'] = [];
  let ignorados = 0;

  for (const item of seguros) {
    const planilhaId = normalizePlanilhaId(item.planilha_ids[0]);
    const bancoId = String(item.banco_id).trim();
    if (!planilhaId || !bancoId || planilhasUsadas.has(planilhaId) || bancosUsados.has(bancoId)) {
      ignorados += 1;
      continue;
    }
    pares.push({
      planilhaId,
      bancoId,
      dataFluxo: String(item.data_fluxo).slice(0, 10),
    });
    planilhasUsadas.add(planilhaId);
    bancosUsados.add(bancoId);
  }

  return { status: 'ok', pares, ignorados };
}

export async function executarPlanoConfirmacao(args: {
  pares: ParConfirmacaoLote[];
  revalidar: (par: ParConfirmacaoLote) => Promise<boolean>;
  gravar: (par: ParConfirmacaoLote) => Promise<void>;
}): Promise<ResultadoExecucaoLote> {
  const resultado: ResultadoExecucaoLote = { aplicados: [], ignorados: [], erros: [] };
  for (const par of args.pares) {
    try {
      if (!(await args.revalidar(par))) {
        resultado.ignorados.push(par);
        continue;
      }
      await args.gravar(par);
      resultado.aplicados.push(par);
    } catch (e) {
      resultado.erros.push({
        ...par,
        erro: e instanceof Error ? e.message : 'Falha não identificada',
      });
    }
  }
  return resultado;
}
