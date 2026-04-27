/**
 * Adapter: implementa IAlunosRepository usando Supabase.
 * Contexto: cadastro (fallback quando planilha não disponível).
 */

import { getSupabase } from '../services/supabaseClient.js';
import type { IAlunosRepository, AlunoRecord } from '../ports/IAlunosRepository.js';

export class SupabaseAlunosAdapter implements IAlunosRepository {
  async listar(): Promise<AlunoRecord[]> {
    const supabase = getSupabase();
    if (!supabase) return [];
    // Fonte operacional nova (snapshot da planilha FLUXO) — mantém colunas e estrutura por aba/modalidade.
    const op = await supabase
      .from('fluxo_alunos_operacionais')
      .select(
        'id, aluno_nome, aba, modalidade, linha_planilha, ativo, wpp, responsaveis, plano, matricula, fim, venc, valor_referencia, pagador_pix, observacoes'
      )
      .order('aba')
      .order('linha_planilha');
    if (!op.error && (op.data?.length ?? 0) > 0) {
      return (op.data ?? []).map((r) => ({
        id: r.id,
        nome: r.aluno_nome,
        _aba: r.aba,
        _modalidade: r.modalidade,
        _linha: r.linha_planilha,
        _ativo: r.ativo,
        WPP: r.wpp,
        'RESPONSÁVEIS': r.responsaveis,
        PLANO: r.plano,
        MATRICULA: r.matricula,
        FIM: r.fim,
        VENC: r.venc,
        VALOR: r.valor_referencia,
        'PRÓ': r.pagador_pix,
        'OBSERVAÇÕES': r.observacoes,
      })) as AlunoRecord[];
    }

    const { data, error } = await supabase.from('alunos').select('id, nome').order('nome');
    if (error) return [];
    return (data ?? []) as AlunoRecord[];
  }
}
