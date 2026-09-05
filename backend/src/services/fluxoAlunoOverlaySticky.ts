/**
 * Cópia das marcações do app (ativo / bolsa / exceção) que NÃO é apagada na remigração.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeFluxoKeyPart, type FluxoAlunoOverlay } from '../logic/fluxoRemigracaoOverlays.js';

export function overlayStickyKey(aba: string, alunoNome: string): string {
  return `${normalizeFluxoKeyPart(aba)}|${normalizeFluxoKeyPart(alunoNome)}`;
}

export async function gravarOverlaysSticky(
  supabase: SupabaseClient,
  overlays: FluxoAlunoOverlay[],
  opts?: { permitirReativar?: boolean },
): Promise<{ gravados: number; erro?: string }> {
  const byKey = new Map<string, Record<string, unknown>>();
  for (const o of overlays) {
    const abaNorm = normalizeFluxoKeyPart(o.aba);
    const nomeNorm = normalizeFluxoKeyPart(o.aluno_nome);
    if (!abaNorm || !nomeNorm) continue;
    byKey.set(overlayStickyKey(o.aba, o.aluno_nome), {
      aba_norm: abaNorm,
      aluno_nome_norm: nomeNorm,
      aba: o.aba,
      aluno_nome: o.aluno_nome,
      linha_planilha: Number(o.linha_planilha) || 0,
      ativo: o.ativo !== false,
      regime_cobranca: String(o.regime_cobranca ?? 'normal').trim() || 'normal',
      pendencia_campos_ignorados: o.pendencia_campos_ignorados ?? [],
      cobranca_tentativas: o.cobranca_tentativas ?? [],
      updated_at: new Date().toISOString(),
    });
  }
  let rows = [...byKey.values()];
  if (rows.length === 0) return { gravados: 0 };

  if (opts?.permitirReativar !== true) {
    try {
      const existentes = await lerOverlaysSticky(supabase);
      const merged = mesclarOverlays(
        overlays,
        existentes,
      );
      const keep = new Map(merged.map((o) => [overlayStickyKey(o.aba, o.aluno_nome), o]));
      rows = rows.map((r) => {
        const k = overlayStickyKey(String(r.aba), String(r.aluno_nome));
        const keepRow = keep.get(k);
        if (keepRow?.ativo === false) return { ...r, ativo: false };
        return r;
      });
    } catch {
      /* se sticky ainda não existir, grava o lote como está */
    }
  }

  const { error } = await supabase.from('fluxo_alunos_overlays_sticky').upsert(rows, {
    onConflict: 'aba_norm,aluno_nome_norm',
  });
  if (error) return { gravados: 0, erro: error.message };
  return { gravados: rows.length };
}

export async function lerOverlaysSticky(supabase: SupabaseClient): Promise<FluxoAlunoOverlay[]> {
  const { data, error } = await supabase
    .from('fluxo_alunos_overlays_sticky')
    .select(
      'aba, aluno_nome, linha_planilha, ativo, regime_cobranca, pendencia_campos_ignorados, cobranca_tentativas',
    )
    .limit(20000);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    aba: String(r.aba ?? ''),
    aluno_nome: String(r.aluno_nome ?? ''),
    linha_planilha: Number(r.linha_planilha ?? 0),
    ativo: r.ativo !== false,
    regime_cobranca: r.regime_cobranca != null ? String(r.regime_cobranca) : null,
    pendencia_campos_ignorados: r.pendencia_campos_ignorados ?? [],
    cobranca_tentativas: r.cobranca_tentativas ?? [],
  }));
}

function regimeEspecial(r: string | null | undefined): boolean {
  const v = String(r ?? '').trim();
  return v === 'bolsa' || v === 'excecao';
}

/**
 * Caderninho (sticky) vence a planilha:
 * - se já estava inativo, continua inativo (planilha não reativa)
 * - bolsa/exceção do caderninho não volta para normal
 */
export function mesclarOverlays(atual: FluxoAlunoOverlay[], sticky: FluxoAlunoOverlay[]): FluxoAlunoOverlay[] {
  const map = new Map<string, FluxoAlunoOverlay>();
  for (const o of sticky) map.set(overlayStickyKey(o.aba, o.aluno_nome), o);
  for (const o of atual) {
    const prev = map.get(overlayStickyKey(o.aba, o.aluno_nome));
    if (!prev) {
      map.set(overlayStickyKey(o.aba, o.aluno_nome), o);
      continue;
    }
    map.set(overlayStickyKey(o.aba, o.aluno_nome), {
      ...o,
      ativo: prev.ativo === false || o.ativo === false ? false : o.ativo,
      regime_cobranca: regimeEspecial(prev.regime_cobranca) && !regimeEspecial(o.regime_cobranca)
        ? prev.regime_cobranca
        : (o.regime_cobranca ?? prev.regime_cobranca),
      pendencia_campos_ignorados: o.pendencia_campos_ignorados ?? prev.pendencia_campos_ignorados,
      cobranca_tentativas: o.cobranca_tentativas ?? prev.cobranca_tentativas,
    });
  }
  return [...map.values()];
}

export async function gravarOverlayStickyDoAluno(
  supabase: SupabaseClient,
  aluno: {
    aba?: string | null;
    aluno_nome?: string | null;
    linha_planilha?: number | null;
    ativo?: boolean | null;
    regime_cobranca?: string | null;
    pendencia_campos_ignorados?: unknown;
    cobranca_tentativas?: unknown;
  },
): Promise<void> {
  await gravarOverlaysSticky(
    supabase,
    [
      {
        aba: String(aluno.aba ?? ''),
        aluno_nome: String(aluno.aluno_nome ?? ''),
        linha_planilha: Number(aluno.linha_planilha ?? 0),
        ativo: aluno.ativo !== false,
        regime_cobranca: aluno.regime_cobranca != null ? String(aluno.regime_cobranca) : 'normal',
        pendencia_campos_ignorados: aluno.pendencia_campos_ignorados ?? [],
        cobranca_tentativas: aluno.cobranca_tentativas ?? [],
      },
    ],
    { permitirReativar: true },
  );
}
