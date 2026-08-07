/**
 * Overlays operacionais do app que devem sobreviver à remigração do Fluxo.
 * Overlay do app vence a planilha (ex.: ativo=false nunca é reativado pela planilha).
 */

export type FluxoAlunoOverlay = {
  aba: string;
  aluno_nome: string;
  linha_planilha: number;
  ativo: boolean;
  regime_cobranca: string | null;
  pendencia_campos_ignorados: unknown;
  cobranca_tentativas: unknown;
};

export type FluxoAlunoMigracaoRow = {
  aba: string;
  aluno_nome: string;
  linha_planilha: number;
  ativo: boolean;
  regime_cobranca?: string | null;
  pendencia_campos_ignorados?: unknown;
  cobranca_tentativas?: unknown;
  plano?: string | null;
  [key: string]: unknown;
};

export function normalizeFluxoKeyPart(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function chaveOverlayPorNome(aba: string, alunoNome: string): string {
  return `${normalizeFluxoKeyPart(aba)}|${normalizeFluxoKeyPart(alunoNome)}`;
}

export function chaveOverlayPorLinha(aba: string, linha: number): string {
  return `${normalizeFluxoKeyPart(aba)}|${Number(linha)}`;
}

export function indexarOverlaysAlunos(rows: FluxoAlunoOverlay[]): {
  porNome: Map<string, FluxoAlunoOverlay>;
  porLinha: Map<string, FluxoAlunoOverlay>;
} {
  const porNome = new Map<string, FluxoAlunoOverlay>();
  const porLinha = new Map<string, FluxoAlunoOverlay>();
  for (const r of rows) {
    const nomeKey = chaveOverlayPorNome(r.aba, r.aluno_nome);
    if (normalizeFluxoKeyPart(r.aluno_nome)) {
      porNome.set(nomeKey, r);
    }
    porLinha.set(chaveOverlayPorLinha(r.aba, r.linha_planilha), r);
  }
  return { porNome, porLinha };
}

export function localizarOverlayAluno(
  row: { aba: string; aluno_nome: string; linha_planilha: number },
  index: { porNome: Map<string, FluxoAlunoOverlay>; porLinha: Map<string, FluxoAlunoOverlay> },
): FluxoAlunoOverlay | null {
  const porNome = index.porNome.get(chaveOverlayPorNome(row.aba, row.aluno_nome));
  if (porNome) return porNome;
  return index.porLinha.get(chaveOverlayPorLinha(row.aba, row.linha_planilha)) ?? null;
}

/**
 * Aplica overlay do app sobre a linha vinda da planilha.
 * - ativo: app é fonte da verdade (nunca reativa se app tinha false)
 * - regime_cobranca / pendencias / tentativas: preservados quando havia overlay
 */
export function aplicarOverlayAlunoMigracao(
  row: FluxoAlunoMigracaoRow,
  overlay: FluxoAlunoOverlay | null,
  opts?: { planoSugereBolsa?: boolean },
): FluxoAlunoMigracaoRow {
  const out: FluxoAlunoMigracaoRow = { ...row };

  if (overlay) {
    out.ativo = Boolean(overlay.ativo);
    if (overlay.regime_cobranca != null && String(overlay.regime_cobranca).trim()) {
      out.regime_cobranca = String(overlay.regime_cobranca).trim();
    }
    if (overlay.pendencia_campos_ignorados != null) {
      out.pendencia_campos_ignorados = overlay.pendencia_campos_ignorados;
    }
    if (overlay.cobranca_tentativas != null) {
      out.cobranca_tentativas = overlay.cobranca_tentativas;
    }
  } else {
    const plano = String(row.plano ?? '').toLowerCase();
    const sugereBolsa = opts?.planoSugereBolsa ?? plano.includes('bolsa');
    if (!out.regime_cobranca) {
      out.regime_cobranca = sugereBolsa ? 'bolsa' : 'normal';
    }
  }

  // Garantia explícita: planilha nunca força ativo=true se o app tinha false.
  if (overlay && overlay.ativo === false) {
    out.ativo = false;
  }

  return out;
}

export function aplicarOverlaysNaMigracao(
  alunosPayload: FluxoAlunoMigracaoRow[],
  overlays: FluxoAlunoOverlay[],
): { rows: FluxoAlunoMigracaoRow[]; aplicados: number; inativosPreservados: number } {
  const index = indexarOverlaysAlunos(overlays);
  let aplicados = 0;
  let inativosPreservados = 0;
  const rows = alunosPayload.map((row) => {
    const overlay = localizarOverlayAluno(row, index);
    if (overlay) {
      aplicados += 1;
      if (overlay.ativo === false) inativosPreservados += 1;
    }
    return aplicarOverlayAlunoMigracao(row, overlay);
  });
  return { rows, aplicados, inativosPreservados };
}
