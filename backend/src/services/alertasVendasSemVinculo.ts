import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeText, shiftISODate } from '../logic/conciliacaoTexto.js';
import {
  isCreditoGenericoExtrato,
  OFFSET_DIAS_EXTRATO_PADRAO,
} from '../logic/creditoRecorrente.js';
import { listVinculosMes } from './validacaoVinculos.js';

export type AlertaVendasSemVinculo = {
  banco_id: string;
  data: string;
  valor: number;
  pessoa: string;
  /** Dia de cobrança sugerido no Fluxo (banco − offset padrão). */
  data_fluxo_sugerida?: string;
  /** Sempre true nesta lista (já filtrado). */
  possivel_nova_assinatura: true;
  mensagem: string;
};

const MSG =
  'Possível nova assinatura. Abra Assinaturas no PagBank, identifique quem pagou e vincule aqui na Validação.';

export function inferirDataFluxoSugerida(dataBancoIso: string, offsetDias = OFFSET_DIAS_EXTRATO_PADRAO): string {
  return shiftISODate(String(dataBancoIso).slice(0, 10), -offsetDias);
}

export function filtrarVendasSemVinculo(
  transacoes: Array<{ id: string; data: string; valor: number; pessoa: string; descricao?: string | null }>,
  bancoIdsVinculados: Set<string>,
  opts?: { offsetDiasExtrato?: number },
): AlertaVendasSemVinculo[] {
  const offset = opts?.offsetDiasExtrato ?? OFFSET_DIAS_EXTRATO_PADRAO;
  return transacoes
    .filter((t) => isCreditoGenericoExtrato(t.pessoa, t.descricao))
    .filter((t) => normalizeText(`${t.pessoa} ${t.descricao ?? ''}`).includes('VENDAS'))
    .filter((t) => !bancoIdsVinculados.has(t.id))
    .map((t) => {
      const data = String(t.data).slice(0, 10);
      return {
        banco_id: t.id,
        data,
        valor: Number(t.valor || 0),
        pessoa: String(t.pessoa ?? ''),
        data_fluxo_sugerida: inferirDataFluxoSugerida(data, offset),
        possivel_nova_assinatura: true as const,
        mensagem: MSG,
      };
    });
}

function ultimoDiaMes(mes: number, ano: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export async function listAlertasVendasSemVinculo(
  supabase: SupabaseClient,
  mes: number,
  ano: number,
): Promise<AlertaVendasSemVinculo[]> {
  const vinculos = await listVinculosMes(mes, ano);
  const bancoIdsVinculados = new Set(vinculos.map((v) => v.banco_id));

  const inicio = `${ano}-${pad2(mes)}-01`;
  const fim = `${ano}-${pad2(mes)}-${pad2(ultimoDiaMes(mes, ano))}`;

  const { data: txRows, error } = await supabase
    .from('transacoes')
    .select('id, data, valor, pessoa, descricao')
    .gte('data', inicio)
    .lte('data', fim)
    .limit(20000);

  if (error) throw new Error(error.message);

  const transacoes = (txRows ?? []).map((r) => ({
    id: String((r as { id: string }).id),
    data: String((r as { data: string }).data),
    valor: Number((r as { valor?: number }).valor || 0),
    pessoa: String((r as { pessoa?: string }).pessoa ?? ''),
    descricao: (r as { descricao?: string | null }).descricao ?? null,
  }));

  return filtrarVendasSemVinculo(transacoes, bancoIdsVinculados);
}
