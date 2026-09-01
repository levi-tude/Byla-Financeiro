/**
 * Audita se mapeamento_pessoa_categoria está alinhado com vínculos Validação↔Fluxo
 * por modalidade (Dança, Yoga, Pilates, Teatro, GR…).
 *
 * Uso: npx tsx scripts/auditMapeamentoVsValidacaoModalidades.ts [ano] [mesIni] [mesFim]
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { getSupabase } from '../src/services/supabaseClient.js';
import { hintAbaFluxoParaControle } from '../src/domain/entradas/abaControleMap.js';
import { pessoaNormParaMapeamentoEntrada } from '../src/logic/entradasVinculosGrupo.js';
import { normalizePessoa } from '../src/logic/normalizePessoa.js';

function parseFluxoId(planilhaId: string): string | null {
  const t = planilhaId.trim();
  if (t.startsWith('fluxo::')) return t.slice('fluxo::'.length);
  return null;
}

async function main() {
  const ano = Number(process.argv[2] ?? 2026);
  const mesIni = Number(process.argv[3] ?? 1);
  const mesFim = Number(process.argv[4] ?? 12);

  const supabase = getSupabase();
  if (!supabase) {
    console.error('Supabase não configurado.');
    process.exit(1);
  }

  const { data: vinculos, error } = await supabase
    .from('validacao_pagamentos_vinculos')
    .select('banco_id, planilha_id, mes, ano')
    .eq('ano', ano)
    .gte('mes', mesIni)
    .lte('mes', mesFim);
  if (error) throw new Error(error.message);

  const fluxoIds = [
    ...new Set(
      (vinculos ?? [])
        .map((v) => parseFluxoId(String(v.planilha_id)))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const bancoIds = [...new Set((vinculos ?? []).map((v) => String(v.banco_id)))];

  const fluxoById = new Map<
    string,
    { aba: string; modalidade: string; aluno_nome: string; pagador_pix: string | null }
  >();
  if (fluxoIds.length > 0) {
    for (let i = 0; i < fluxoIds.length; i += 200) {
      const slice = fluxoIds.slice(i, i + 200);
      const { data: fluxos } = await supabase
        .from('fluxo_pagamentos_operacionais')
        .select('id, aba, modalidade, aluno_nome, pagador_pix')
        .in('id', slice);
      for (const f of fluxos ?? []) {
        fluxoById.set(String(f.id), {
          aba: String(f.aba ?? ''),
          modalidade: String(f.modalidade ?? ''),
          aluno_nome: String(f.aluno_nome ?? ''),
          pagador_pix: f.pagador_pix != null ? String(f.pagador_pix) : null,
        });
      }
    }
  }

  const bancoPessoaById = new Map<string, string>();
  if (bancoIds.length > 0) {
    for (let i = 0; i < bancoIds.length; i += 200) {
      const slice = bancoIds.slice(i, i + 200);
      const { data: bancos } = await supabase.from('transacoes').select('id, pessoa').in('id', slice);
      for (const b of bancos ?? []) {
        const p = String((b as { pessoa?: string }).pessoa ?? '').trim();
        if (p) bancoPessoaById.set(String((b as { id: string }).id), p);
      }
    }
  }

  const pessoasNorm = new Set<string>();
  type Caso = {
    mes: number;
    abaEsperada: string;
    templateEsperado: string;
    pessoaNorm: string;
    templateAtual: string | null;
    origemRegra: string | null;
  };
  const casos: Caso[] = [];
  const okPorModalidade = new Map<string, number>();
  const divergePorModalidade = new Map<string, number>();
  const semMapeamentoPorModalidade = new Map<string, number>();

  for (const v of vinculos ?? []) {
    const fluxoId = parseFluxoId(String(v.planilha_id));
    if (!fluxoId) continue;
    const fluxo = fluxoById.get(fluxoId);
    if (!fluxo) continue;
    const hint = hintAbaFluxoParaControle(fluxo.aba, fluxo.modalidade);
    if (!hint) continue;

    const pessoaNorm = pessoaNormParaMapeamentoEntrada({
      bancoPessoa: bancoPessoaById.get(String(v.banco_id)) ?? null,
      pagadorPix: fluxo.pagador_pix,
      aluno: fluxo.aluno_nome,
      fallbackId: fluxoId,
    });
    if (!pessoaNorm) continue;
    pessoasNorm.add(pessoaNorm);

    const modLabel = hint.labelEsperado;
    // será preenchido após load mapeamento
    casos.push({
      mes: Number(v.mes),
      abaEsperada: modLabel,
      templateEsperado: hint.templateKeyPreferido,
      pessoaNorm,
      templateAtual: null,
      origemRegra: null,
    });
  }

  const mapAtual = new Map<string, { template_key: string; origem_regra: string | null }>();
  const pessoas = [...pessoasNorm];
  for (let i = 0; i < pessoas.length; i += 200) {
    const slice = pessoas.slice(i, i + 200);
    const { data: maps } = await supabase
      .from('mapeamento_pessoa_categoria')
      .select('pessoa_normalizada, template_key, origem_regra')
      .eq('aplica_tipo', 'entrada')
      .in('pessoa_normalizada', slice);
    for (const m of maps ?? []) {
      mapAtual.set(String(m.pessoa_normalizada), {
        template_key: String(m.template_key ?? ''),
        origem_regra: m.origem_regra != null ? String(m.origem_regra) : null,
      });
    }
  }

  const divergencias: Array<{ mes: number; modalidade: string; qtd: number; exemplos: string[] }> = [];
  const divergenciasDetalhe = new Map<string, { mes: number; modalidade: string; exemplos: Set<string> }>();

  for (const c of casos) {
    const atual = mapAtual.get(c.pessoaNorm);
    c.templateAtual = atual?.template_key ?? null;
    c.origemRegra = atual?.origem_regra ?? null;

    const mod = c.abaEsperada;
    if (!atual) {
      semMapeamentoPorModalidade.set(mod, (semMapeamentoPorModalidade.get(mod) ?? 0) + 1);
      continue;
    }
    if (atual.template_key === c.templateEsperado) {
      okPorModalidade.set(mod, (okPorModalidade.get(mod) ?? 0) + 1);
    } else {
      divergePorModalidade.set(mod, (divergePorModalidade.get(mod) ?? 0) + 1);
      const key = `${c.mes}:${mod}`;
      const cur = divergenciasDetalhe.get(key) ?? { mes: c.mes, modalidade: mod, exemplos: new Set<string>() };
      // Hash parcial — não expor nomes completos no log
      cur.exemplos.add(`${normalizePessoa(c.pessoaNorm).slice(0, 12)}… → ${atual.template_key}`);
      divergenciasDetalhe.set(key, cur);
    }
  }

  for (const [, v] of divergenciasDetalhe) {
    divergencias.push({
      mes: v.mes,
      modalidade: v.modalidade,
      qtd: v.exemplos.size,
      exemplos: [...v.exemplos].slice(0, 5),
    });
  }

  console.log(
    JSON.stringify(
      {
        ano,
        mesIni,
        mesFim,
        vinculos_analisados: casos.length,
        ok_por_modalidade: Object.fromEntries(okPorModalidade),
        diverge_por_modalidade: Object.fromEntries(divergePorModalidade),
        sem_mapeamento_por_modalidade: Object.fromEntries(semMapeamentoPorModalidade),
        divergencias_amostra: divergencias.sort((a, b) => a.mes - b.mes || a.modalidade.localeCompare(b.modalidade)),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
