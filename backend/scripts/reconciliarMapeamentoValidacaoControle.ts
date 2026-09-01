/**
 * Reconcilia mapeamento_pessoa_categoria a partir dos vínculos Validação↔Fluxo
 * e re-sincroniza Controle Sistema (meses elegíveis).
 *
 * Uso:
 *   npx tsx scripts/reconciliarMapeamentoValidacaoControle.ts
 *   npx tsx scripts/reconciliarMapeamentoValidacaoControle.ts 2026
 *   npx tsx scripts/reconciliarMapeamentoValidacaoControle.ts 2026 6 8  (meses 6–8)
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { getSupabase } from '../src/services/supabaseClient.js';
import { sincronizarMapeamentoSugestoesFromVinculosMes } from '../src/services/mapeamentoFromValidacaoFluxo.js';
import { sincronizarControleCaixaSistema } from '../src/services/controleCaixaSincronizarEntradas.js';
import { mesPermiteSincronizarEntradasRepasses } from '../src/domain/entradas/syncEntradasRepassesEligible.js';

async function listMesesComVinculos(ano: number): Promise<Array<{ mes: number; ano: number }>> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase
    .from('validacao_pagamentos_vinculos')
    .select('mes, ano')
    .eq('ano', ano);
  if (error) throw new Error(error.message);
  const set = new Set<string>();
  for (const row of data ?? []) {
    set.add(`${row.mes}:${row.ano}`);
  }
  return [...set]
    .map((k) => {
      const [mes, a] = k.split(':').map(Number);
      return { mes, ano: a };
    })
    .sort((a, b) => a.mes - b.mes);
}

async function main() {
  const ano = Number(process.argv[2] ?? 2026);
  const mesIni = process.argv[3] != null ? Number(process.argv[3]) : null;
  const mesFim = process.argv[4] != null ? Number(process.argv[4]) : null;

  if (!Number.isFinite(ano) || ano < 2000) {
    console.error('Uso: npx tsx scripts/reconciliarMapeamentoValidacaoControle.ts [ano] [mesIni] [mesFim]');
    process.exit(1);
  }

  const supabase = getSupabase();
  if (!supabase) {
    console.error('Supabase não configurado (.env).');
    process.exit(1);
  }

  let meses = await listMesesComVinculos(ano);
  if (mesIni != null && mesFim != null) {
    meses = meses.filter((m) => m.mes >= mesIni && m.mes <= mesFim);
  }

  console.log(JSON.stringify({ ano, meses: meses.map((m) => m.mes), fase: 'mapeamento' }));

  let totalAplicados = 0;
  let totalIgnorados = 0;
  const errosMapeamento: string[] = [];

  for (const { mes } of meses) {
    const r = await sincronizarMapeamentoSugestoesFromVinculosMes(supabase, mes, ano);
    totalAplicados += r.aplicados;
    totalIgnorados += r.ignorados;
    errosMapeamento.push(...r.erros);
    console.log(JSON.stringify({ mes, ano, mapeamento: r }));
  }

  console.log(
    JSON.stringify({
      fase: 'mapeamento_resumo',
      aplicados: totalAplicados,
      ignorados: totalIgnorados,
      erros: errosMapeamento.length,
    }),
  );

  const mesesControle = meses.filter((m) => mesPermiteSincronizarEntradasRepasses(m.mes, m.ano));
  console.log(JSON.stringify({ fase: 'controle_sistema', meses: mesesControle.map((m) => m.mes) }));

  for (const { mes } of mesesControle) {
    const sync = await sincronizarControleCaixaSistema(mes, ano, 'competencia');
    if ('error' in sync) {
      console.error(JSON.stringify({ mes, ano, controle_erro: sync.error }));
    } else {
      const t = sync.data.totais;
      console.log(
        JSON.stringify({
          mes,
          ano,
          controle_ok: true,
          entradaTotal: t.entradaTotal,
          saidaTotal: t.saidaTotal,
          lucroTotal: t.lucroTotal,
        }),
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
