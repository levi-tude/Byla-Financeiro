/**
 * Auditoria retrospectiva SOMENTE LEITURA do motor mensal.
 * A saída contém apenas métricas agregadas; nunca nomes, descrições ou valores.
 */
import { avaliarReplayMatchesProvaveis } from '../src/logic/matchesProvaveisReplay.js';
import { normalizePlanilhaId, planilhaIdFromFluxoUuid } from '../src/logic/fluxoPagamentoFingerprint.js';
import { getMatchesProvaveisMes } from '../src/services/matchesProvaveisMes.js';
import { getSupabase } from '../src/services/supabaseClient.js';
import { listVinculosPorPlanilhaIds } from '../src/services/validacaoVinculos.js';

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

const ano = Number(arg('ano') ?? new Date().getFullYear());
const meses = (arg('meses') ?? '6,7,8')
  .split(',')
  .map(Number)
  .filter((mes) => mes >= 1 && mes <= 12);
if (!Number.isInteger(ano) || ano < 2000 || meses.length === 0) {
  throw new Error('Use --ano=2026 --meses=6,7,8');
}

const supabase = getSupabase();
if (!supabase) throw new Error('Supabase não configurado.');

const resultados = [];
for (const mes of meses) {
  const { data: fluxos, error } = await supabase
    .from('fluxo_pagamentos_operacionais')
    .select('id')
    .eq('ano_competencia', ano)
    .eq('mes_competencia', mes);
  if (error) throw new Error(error.message);

  const ids = (fluxos ?? []).map((row) => planilhaIdFromFluxoUuid(String(row.id)));
  const vinculos = await listVinculosPorPlanilhaIds(ids);
  const humanos = vinculos.filter(
    (v) => !String(v.observacao ?? '').startsWith('auto_match'),
  );
  const humanosIds = new Set(humanos.map((v) => normalizePlanilhaId(v.planilha_id)));
  const analise = await getMatchesProvaveisMes(mes, ano, { replayPlanilhaIds: humanosIds });
  const segurosItens = analise.por_dia
    .flatMap((dia) => dia.itens)
    .filter((item) => item.grupo_ui === 'seguro');
  const seguros = segurosItens.map((item) => ({
      planilhaId: normalizePlanilhaId(item.planilha_ids[0]),
      bancoId: item.banco_id,
    }));
  const esperadoPorPlanilha = new Map(
    humanos.map((v) => [normalizePlanilhaId(v.planilha_id), v.banco_id]),
  );
  const diagnostico_falsos_positivos = segurosItens
    .filter(
      (item) =>
        esperadoPorPlanilha.get(normalizePlanilhaId(item.planilha_ids[0])) !== item.banco_id,
    )
    .map((item) => {
      const esperado = esperadoPorPlanilha.get(normalizePlanilhaId(item.planilha_ids[0]));
      const posicaoEsperado = item.candidatos_alternativos.findIndex(
        (candidato) => candidato.banco_id === esperado,
      );
      return {
        score: Math.round(item.score * 10) / 10,
        gap_2o: item.gap_2o,
        esperado_nos_top3: posicaoEsperado >= 0,
        posicao_esperado: posicaoEsperado >= 0 ? posicaoEsperado + 1 : null,
        motivos: item.motivos,
      };
    });

  resultados.push({
    mes,
    ano,
    diagnostico_falsos_positivos,
    ...avaliarReplayMatchesProvaveis({
      vinculosHumanos: humanos.map((v) => ({
        planilhaId: normalizePlanilhaId(v.planilha_id),
        bancoId: v.banco_id,
      })),
      segurosSugeridos: seguros,
    }),
  });
}

const consolidado = {
  meses_avaliados: resultados.length,
  total_vinculos_humanos: resultados.reduce((n, r) => n + r.total_vinculos_humanos, 0),
  seguros_sugeridos: resultados.reduce((n, r) => n + r.seguros_sugeridos, 0),
  acertos: resultados.reduce((n, r) => n + r.acertos, 0),
  falsos_positivos: resultados.reduce((n, r) => n + r.falsos_positivos, 0),
  colisoes: resultados.reduce((n, r) => n + r.colisoes, 0),
};
const precisao =
  consolidado.seguros_sugeridos > 0
    ? Math.round((consolidado.acertos / consolidado.seguros_sugeridos) * 1000) / 10
    : 0;

console.log(
  JSON.stringify(
    {
      somente_leitura: true,
      sem_pii: true,
      resultados,
      consolidado: {
        ...consolidado,
        precisao_pct: precisao,
        aprovado_para_aplicacao:
          consolidado.seguros_sugeridos > 0 &&
          consolidado.falsos_positivos === 0 &&
          consolidado.colisoes === 0,
      },
    },
    null,
    2,
  ),
);
