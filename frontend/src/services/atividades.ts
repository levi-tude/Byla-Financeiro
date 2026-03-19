import { supabase } from './supabase';
import type {
  ResumoAtividadeRow,
  AlunoPorAtividadeRow,
  MensalidadePorAtividadeRow,
} from '../types/atividades';

function getClient() {
  if (!supabase) throw new Error('Supabase não configurado.');
  return supabase;
}

export async function getResumoAtividade(): Promise<ResumoAtividadeRow[]> {
  const client = getClient();
  const { data, error } = await client
    .from('v_resumo_atividade')
    .select('atividade_id, atividade_nome, total_alunos, total_mensalidades, total_valor')
    .order('total_valor', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ResumoAtividadeRow[];
}

export async function getAlunosPorAtividade(
  atividadeId?: number
): Promise<AlunoPorAtividadeRow[]> {
  const client = getClient();
  let query = client
    .from('v_alunos_por_atividade')
    .select(
      'atividade_id, atividade_nome, aluno_id, aluno_nome, plano_id, plano_nome'
    )
    .order('atividade_nome')
    .order('aluno_nome');
  if (atividadeId != null) {
    query = query.eq('atividade_id', atividadeId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AlunoPorAtividadeRow[];
}

export async function getMensalidadesPorAtividade(
  atividadeId?: number,
  /** Limite de linhas (para filtrar por mês no frontend). */
  limit = 500
): Promise<MensalidadePorAtividadeRow[]> {
  const client = getClient();
  let query = client
    .from('v_mensalidades_por_atividade')
    .select(
      'id, atividade_id, atividade_nome, plano_nome, aluno_id, aluno_nome, valor, data_pagamento, forma_pagamento, nome_pagador, ativo'
    )
    .order('data_pagamento', { ascending: false })
    .limit(limit);
  if (atividadeId != null) {
    query = query.eq('atividade_id', atividadeId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as MensalidadePorAtividadeRow[];
}
