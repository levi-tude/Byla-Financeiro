/**
 * Replay somente leitura: compara sugestões atuais com classificações humanas existentes.
 * Não grava nem altera Supabase.
 *
 * Uso: npm run audit:classificacao-replay -- 8 2026
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { avaliarReplayClassificacao, type CasoReplayClassificacao } from '../src/logic/classificacaoReplay.js';
import {
  buildEntradasContext,
  sugestaoEntradaParaGrupo,
  transacoesDoGrupoEntrada,
} from '../src/services/entradasClassificacaoService.js';
import {
  buildDespesasContext,
  sugestaoHeuristicaParaGrupo,
} from '../src/services/despesasClassificacaoService.js';
import { getSupabase } from '../src/services/supabaseClient.js';

async function main() {
  const mes = Number(process.argv[2]);
  const ano = Number(process.argv[3]);
  if (!Number.isInteger(mes) || mes < 1 || mes > 12 || !Number.isInteger(ano) || ano < 2000) {
    throw new Error('Uso: npm run audit:classificacao-replay -- <mes> <ano>');
  }
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase não configurado.');

  const [entradas, despesas] = await Promise.all([
    buildEntradasContext(supabase, mes, ano),
    buildDespesasContext(supabase, mes, ano),
  ]);

  const casosEntradas: CasoReplayClassificacao[] = entradas.grupos
    .filter((g) => g.estado === 'classificado' && g.template_key)
    .map((g) => ({
      esperado: String(g.template_key),
      sugestao: sugestaoEntradaParaGrupo(
        g,
        transacoesDoGrupoEntrada(g, entradas.transacoes),
        entradas.catalog,
      ),
    }));

  const transacoesDespesaPorPessoa = new Map<string, typeof despesas.transacoes>();
  for (const t of despesas.transacoes) {
    const itens = transacoesDespesaPorPessoa.get(t.pessoa_normalizada) ?? [];
    itens.push(t);
    transacoesDespesaPorPessoa.set(t.pessoa_normalizada, itens);
  }
  const despesasComSugestao = despesas.grupos
    .filter((g) => g.estado === 'classificado' && g.template_key)
    .map((g) => ({
      esperado: String(g.template_key),
      sugestao: sugestaoHeuristicaParaGrupo(
        transacoesDespesaPorPessoa.get(g.pessoa_normalizada) ?? [],
        despesas.catalog,
        g.score_repeticao,
      ),
    }));
  const casosDespesas: CasoReplayClassificacao[] = despesasComSugestao;
  const diagnosticoDespesasPorRegra = Object.fromEntries(
    [...new Set(despesasComSugestao.map((c) => c.sugestao?.regra).filter(Boolean))].map((regra) => {
      const casos = despesasComSugestao.filter((c) => c.sugestao?.regra === regra);
      const corretos = casos.filter((c) => c.sugestao?.template_key === c.esperado).length;
      return [
        regra,
        {
          casos: casos.length,
          corretos,
          acuraciaPct: casos.length ? Math.round((corretos / casos.length) * 1000) / 10 : 0,
        },
      ];
    }),
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        somenteLeitura: true,
        mes,
        ano,
        entradas: avaliarReplayClassificacao(casosEntradas),
        despesas: avaliarReplayClassificacao(casosDespesas),
        diagnosticoDespesasPorRegra,
        criterioParaAutomacao:
          'Só considerar automação quando elegiveisIncorretas=0 em vários meses; até lá, apenas sugestão.',
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
