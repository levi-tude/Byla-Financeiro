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

/** Período usable para herdar estrutura (existe e tem pelo menos um bloco). */
export function periodoTemEstrutura(dto: Pick<ControleCaixaReadDto, 'blocos'> | null | undefined): boolean {
  return (dto?.blocos?.length ?? 0) > 0;
}

/**
 * True quando o Controle tem as seções operacionais mínimas da planilha
 * (entradas parceiros + saídas parceiros + saídas fixas).
 */
export function estruturaControleCompleta(dto: Pick<ControleCaixaReadDto, 'blocos'>): boolean {
  const blocos = dto.blocos ?? [];
  if (blocos.length < 3) return false;
  const titulos = blocos.map((b) => `${b.templateKey ?? ''}|${b.titulo}`.toLowerCase());
  const hasEntradaParceiros = titulos.some(
    (t) => t.includes('entrada_parceiros') || (t.includes('entrada') && t.includes('parceir')),
  );
  const hasSaidaParceiros = titulos.some(
    (t) =>
      t.includes('saida_parceiros') ||
      ((t.includes('saída') || t.includes('saida')) && t.includes('parceir')),
  );
  const hasSaidaFixas = titulos.some(
    (t) =>
      t.includes('saida_gastos_fixos') ||
      t.includes('saídas fixas') ||
      t.includes('saidas fixas') ||
      t.includes('gastos fixos'),
  );
  return hasEntradaParceiros && hasSaidaParceiros && hasSaidaFixas;
}

/**
 * Busca o Controle do mês anterior mais recente (até maxSaltos).
 * `loadExisting` deve retornar erro se o período não existir (sem auto-criar).
 * Períodos sem blocos são ignorados (ex.: sistema vazio criado por engano).
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
    if ('data' in prev && periodoTemEstrutura(prev.data)) {
      return controleDtoToNovoMesPayload(prev.data);
    }
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
