import { config } from '../config.js';
import { createSheetsApi } from './googleSheetsClient.js';
import { getSupabase } from './supabaseClient.js';
import { classificarTransacaoParaPlanilha, type CategoriaExportInput } from '../logic/categoriaExportByla.js';

const ABA_MOV = 'Movimentações';

/** Contrato da aba Movimentações (alinhado ao extrato + classificação em 2 níveis). */
export const COLUNAS_FINAIS = [
  'id',
  'data',
  'tipo_fluxo',
  'valor',
  'pessoa_extrato',
  'referencia_negocio',
  'categoria',
  'subcategoria',
] as const;

export type LinhaPlanilhaMovimentacoes = {
  id: string;
  data: string;
  tipo_fluxo: string;
  valor: string;
  pessoa_extrato: string;
  referencia_negocio: string;
  categoria: string;
  subcategoria: string;
};

export type SyncCategoriasResult = {
  ok: boolean;
  atualizadas: number;
  linhasPlanilha: number;
  linhasSupabase: number;
  error?: string;
};

export type ExportRowInput = {
  id: string;
  data: string;
  tipo: string;
  pessoa: string;
  valor: unknown;
  descricao: string | null;
  categoria_sugerida: string | null;
  subcategoria_sugerida: string | null;
  modalidade: string | null;
  nome_aluno: string | null;
  origem_categoria: string | null;
};

function normCell(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

export function normalizeTipoFluxo(tipo: string | unknown): 'entrada' | 'saida' {
  const t = String(tipo ?? '').trim().toLowerCase();
  return t === 'saida' ? 'saida' : 'entrada';
}

export function formatValorPlanilha(valor: number): string {
  return valor.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Monta uma linha da planilha a partir de uma linha de `v_transacoes_export` (mesma lógica do sync e do n8n).
 */
export function montarLinhaMovimentacoes(db: ExportRowInput): LinhaPlanilhaMovimentacoes {
  const input: CategoriaExportInput = {
    id: normCell(db.id),
    data: normCell(db.data),
    tipo: db.tipo ?? '',
    pessoa: db.pessoa ?? '',
    valor: Number(db.valor || 0),
    descricao: db.descricao,
    categoria_sugerida: db.categoria_sugerida,
    subcategoria_sugerida: db.subcategoria_sugerida,
    modalidade: db.modalidade,
    nome_aluno: db.nome_aluno,
    origem_categoria: db.origem_categoria,
  };
  const cls = classificarTransacaoParaPlanilha(input);
  return {
    id: normCell(db.id),
    data: normCell(db.data),
    tipo_fluxo: normalizeTipoFluxo(db.tipo),
    valor: formatValorPlanilha(Number(db.valor || 0)),
    pessoa_extrato: normCell(db.pessoa),
    referencia_negocio: cls.referencia_negocio,
    categoria: cls.categoria,
    subcategoria: cls.subcategoria,
  };
}

async function fetchAllExportRows(): Promise<{ rows: ExportRowInput[]; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { rows: [], error: 'Supabase não configurado' };

  const rows: ExportRowInput[] = [];
  const pageSize = 800;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('v_transacoes_export')
      .select(
        'id, data, tipo, pessoa, valor, descricao, categoria_sugerida, subcategoria_sugerida, modalidade, nome_aluno, origem_categoria',
      )
      .order('data', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) return { rows: [], error: error.message };
    const chunk = (data ?? []) as ExportRowInput[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return { rows };
}

/**
 * Reescreve a aba Movimentações no contrato final (8 colunas) usando dados do banco + classificação consolidada.
 */
export async function syncCategoriasMovimentacoes(): Promise<SyncCategoriasResult> {
  const spreadsheetId = config.sheets.entradaSaidaSpreadsheetId;
  if (!spreadsheetId) {
    return { ok: false, atualizadas: 0, linhasPlanilha: 0, linhasSupabase: 0, error: 'GOOGLE_SHEETS_ENTRADA_SAIDA_ID não configurado' };
  }

  const sheets = createSheetsApi(['https://www.googleapis.com/auth/spreadsheets']);
  if (!sheets) {
    return { ok: false, atualizadas: 0, linhasPlanilha: 0, linhasSupabase: 0, error: 'Credenciais Google não configuradas' };
  }

  const { rows: dbRows, error: dbErr } = await fetchAllExportRows();
  if (dbErr) {
    return { ok: false, atualizadas: 0, linhasPlanilha: 0, linhasSupabase: 0, error: dbErr };
  }

  const rowsOut: string[][] = [Array.from(COLUNAS_FINAIS)];
  for (const db of dbRows) {
    const linha = montarLinhaMovimentacoes(db);
    rowsOut.push([
      linha.id,
      linha.data,
      linha.tipo_fluxo,
      linha.valor,
      linha.pessoa_extrato,
      linha.referencia_negocio,
      linha.categoria,
      linha.subcategoria,
    ]);
  }

  try {
    const writeRange = `'${ABA_MOV.replace(/'/g, "''")}'!A1:H${rowsOut.length}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: writeRange,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rowsOut },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, atualizadas: 0, linhasPlanilha: 0, linhasSupabase: dbRows.length, error: msg };
  }

  return {
    ok: true,
    atualizadas: rowsOut.length > 0 ? rowsOut.length - 1 : 0,
    linhasPlanilha: rowsOut.length > 0 ? rowsOut.length - 1 : 0,
    linhasSupabase: dbRows.length,
  };
}

export async function syncEntradaSaidaPlanilhaCompleto(): Promise<{
  sync: SyncCategoriasResult;
}> {
  const sync = await syncCategoriasMovimentacoes();
  return { sync };
}
