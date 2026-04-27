/**
 * Migra um mês do CONTROLE DE CAIXA (planilha) para tabelas operacionais no Supabase.
 * Uso:
 *   npm run migrate:controle-mes -- 3 2026
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { criarMesAno } from '../src/domain/MesAno.js';
import { PlanilhaFluxoAdapter } from '../src/adapters/PlanilhaFluxoAdapter.js';
import { getSupabase } from '../src/services/supabaseClient.js';

function asNumber(v: number | null | undefined): number | null {
  return v == null ? null : Number(v);
}

async function main() {
  const mes = Number(process.argv[2]);
  const ano = Number(process.argv[3]);
  if (!Number.isFinite(mes) || mes < 1 || mes > 12 || !Number.isFinite(ano) || ano < 2000) {
    console.error('Uso: npm run migrate:controle-mes -- <mes 1-12> <ano>');
    process.exit(1);
  }

  const supabase = getSupabase();
  if (!supabase) {
    console.error('Supabase não configurado. Verifique SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const adapter = new PlanilhaFluxoAdapter();
  const mesAno = criarMesAno(mes, ano);
  const { totais, error } = await adapter.obterTotais(mesAno);
  if (error) {
    console.error(`Erro ao ler planilha: ${error}`);
    process.exit(1);
  }

  const upsertPeriodo = await supabase
    .from('controle_caixa_periodos')
    .upsert(
      {
        mes,
        ano,
        aba_ref: totais.aba,
        entrada_total: asNumber(totais.entradaTotal),
        saida_total: asNumber(totais.saidaTotal),
        lucro_total: asNumber(totais.lucroTotal),
        saida_parceiros_total: asNumber(totais.saidaParceirosTotal),
        saida_fixas_total: asNumber(totais.saidaFixasTotal),
        saida_soma_secoes_principais: asNumber(totais.saidaSomaSecoesPrincipais),
        origem: 'migracao_planilha',
      },
      { onConflict: 'mes,ano' }
    )
    .select('id')
    .single();

  if (upsertPeriodo.error || !upsertPeriodo.data) {
    console.error(`Erro ao upsert do período: ${upsertPeriodo.error?.message ?? 'sem id retornado'}`);
    process.exit(1);
  }

  const periodoId = upsertPeriodo.data.id as string;

  // Limpa blocos/linhas anteriores do mesmo mês para reprocessamento idempotente.
  const del = await supabase.from('controle_caixa_blocos').delete().eq('periodo_id', periodoId);
  if (del.error) {
    console.error(`Erro ao limpar blocos antigos: ${del.error.message}`);
    process.exit(1);
  }

  const blocosEntrada = totais.entradasBlocos ?? [];
  const blocosSaida = totais.saidasBlocos ?? [];
  const blocos = [
    ...blocosEntrada.map((b, i) => ({ tipo: 'entrada' as const, titulo: b.titulo, linhas: b.linhas, ordem: i })),
    ...blocosSaida.map((b, i) => ({ tipo: 'saida' as const, titulo: b.titulo, linhas: b.linhas, ordem: i })),
  ];

  for (const bloco of blocos) {
    const blocoInsert = await supabase
      .from('controle_caixa_blocos')
      .insert({
        periodo_id: periodoId,
        tipo: bloco.tipo,
        titulo: bloco.titulo,
        ordem: bloco.ordem,
      })
      .select('id')
      .single();

    if (blocoInsert.error || !blocoInsert.data) {
      console.error(`Erro ao inserir bloco "${bloco.titulo}": ${blocoInsert.error?.message ?? 'sem id'}`);
      process.exit(1);
    }

    const blocoId = blocoInsert.data.id as string;
    if (!bloco.linhas.length) continue;

    const linhasPayload = bloco.linhas.map((l, idx) => ({
      bloco_id: blocoId,
      label: l.label,
      valor: l.valorNum ?? null,
      valor_texto: l.valor,
      ordem: idx,
    }));

    const linhasInsert = await supabase.from('controle_caixa_linhas').insert(linhasPayload);
    if (linhasInsert.error) {
      console.error(`Erro ao inserir linhas do bloco "${bloco.titulo}": ${linhasInsert.error.message}`);
      process.exit(1);
    }
  }

  console.log(`OK: mês ${mes}/${ano} migrado para controle_caixa_* (periodo_id=${periodoId}).`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
