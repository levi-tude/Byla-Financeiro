import { supabase } from './supabase';
import type { ReconciliacaoMensalidadeRow } from '../types/conciliacao';

function getClient() {
  if (!supabase) throw new Error('Supabase não configurado.');
  return supabase;
}

export interface ReconciliacaoFiltro {
  ano?: number;
  mes?: number;
  atividade?: string;
  status?: 'pendente' | 'confirmado' | 'todos';
}

export async function getReconciliacaoMensalidades(
  filtro: ReconciliacaoFiltro = {}
): Promise<ReconciliacaoMensalidadeRow[]> {
  const client = getClient();
  let query = client
    .from('v_reconciliacao_mensalidades')
    .select(
      'aluno_plano_id, atividade_nome, aluno_nome, valor, data_pagamento, forma_pagamento, nome_pagador_cadastro, valor_preenchido, transacao_id, pessoa_banco, data_banco, valor_banco, confirmado_banco'
    )
    .order('data_pagamento', { ascending: false })
    .limit(500);

  const { data, error } = await query;
  if (error) throw error;

  let rows = (data ?? []) as ReconciliacaoMensalidadeRow[];
  if (filtro.ano != null) {
    rows = rows.filter((r) => new Date(r.data_pagamento).getFullYear() === filtro.ano);
  }
  if (filtro.mes != null) {
    rows = rows.filter((r) => new Date(r.data_pagamento).getMonth() + 1 === filtro.mes);
  }
  if (filtro.atividade) {
    rows = rows.filter(
      (r) => r.atividade_nome?.toLowerCase().includes(filtro.atividade!.toLowerCase())
    );
  }
  if (filtro.status === 'pendente') {
    rows = rows.filter((r) => !r.confirmado_banco);
  }
  if (filtro.status === 'confirmado') {
    rows = rows.filter((r) => r.confirmado_banco);
  }
  return rows;
}

export async function getKpisInadimplencia(
  filtro: ReconciliacaoFiltro = {}
): Promise<{ qtdPendentes: number; valorPendente: number; total: number; taxaAdimplencia: number }> {
  const rows = await getReconciliacaoMensalidades(filtro);
  const total = rows.length;
  const pendentes = rows.filter((r) => !r.confirmado_banco);
  const qtdPendentes = pendentes.length;
  const valorPendente = pendentes.reduce((s, r) => s + (r.valor ?? 0), 0);
  const taxaAdimplencia = total > 0 ? (total - qtdPendentes) / total : 0;
  return { qtdPendentes, valorPendente, total, taxaAdimplencia };
}
