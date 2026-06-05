import type { SupabaseClient } from '@supabase/supabase-js';
import type { ControleTemplatePayload } from './template.js';
import type { ControleCaixaReadDto } from '../../services/controleCaixaRead.js';

export function mesAnoAnterior(mes: number, ano: number): { mes: number; ano: number } {
  if (mes <= 1) return { mes: 12, ano: ano - 1 };
  return { mes: mes - 1, ano };
}

/** Converte período lido em payload novo mês: mesma estrutura, valores zerados. */
export function controleDtoToNovoMesPayload(dto: ControleCaixaReadDto): ControleTemplatePayload {
  return {
    abaRef: dto.abaRef,
    totais: {
      entradaTotal: null,
      saidaTotal: null,
      lucroTotal: null,
      saidaParceirosTotal: null,
      saidaFixasTotal: null,
      saidaSomaSecoesPrincipais: null,
    },
    blocos: dto.blocos.map((b) => ({
      templateKey: b.templateKey,
      tipo: b.tipo,
      titulo: b.titulo,
      ordem: b.ordem,
      isDefault: b.isDefault,
      isCustom: b.isCustom,
      lockedLevel: b.lockedLevel,
      linhas: b.linhas.map((l) => ({
        templateKey: l.templateKey,
        label: l.label,
        ordem: l.ordem,
        valor: null,
        valorTexto: null,
        isDefault: l.isDefault,
        isCustom: l.isCustom,
        lockedLevel: l.lockedLevel,
      })),
    })),
  };
}

type LoadFn = (mes: number, ano: number) => Promise<{ data: ControleCaixaReadDto } | { error: string }>;

/**
 * Busca o Controle do mês anterior mais recente (até maxSaltos).
 * `loadExisting` deve retornar erro se o período não existir (sem auto-criar).
 */
export async function buildPayloadFromMesAnterior(
  mes: number,
  ano: number,
  loadExisting: LoadFn,
  maxSaltos = 36,
): Promise<ControleTemplatePayload | null> {
  let m = mes;
  let a = ano;
  for (let i = 0; i < maxSaltos; i += 1) {
    ({ mes: m, ano: a } = mesAnoAnterior(m, a));
    const prev = await loadExisting(m, a);
    if ('data' in prev) return controleDtoToNovoMesPayload(prev.data);
  }
  return null;
}

/** Ignora bloco legado "Saídas Aluguel" ao copiar (removido da operação). */
export function stripBlocoSaidasAluguel(payload: ControleTemplatePayload): ControleTemplatePayload {
  return {
    ...payload,
    blocos: payload.blocos.filter((b) => {
      const t = (b.templateKey ?? '').toLowerCase();
      const titulo = b.titulo.toLowerCase();
      if (t.includes('saida_aluguel') || t.includes('sai_alug')) return false;
      if (titulo.includes('saídas aluguel') || titulo.includes('saidas aluguel')) return false;
      return true;
    }),
  };
}
