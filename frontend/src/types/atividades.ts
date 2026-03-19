export interface ResumoAtividadeRow {
  atividade_id: number;
  atividade_nome: string;
  total_alunos: number;
  total_mensalidades: number;
  total_valor: number;
}

export interface AlunoPorAtividadeRow {
  atividade_id: number;
  atividade_nome: string;
  aluno_id: number;
  aluno_nome: string;
  plano_id: number;
  plano_nome: string;
}

export interface MensalidadePorAtividadeRow {
  id: number;
  atividade_id: number;
  atividade_nome: string;
  plano_nome: string;
  aluno_id: number;
  aluno_nome: string;
  valor: number | null;
  data_pagamento: string;
  forma_pagamento: string | null;
  nome_pagador: string | null;
  ativo: boolean | null;
}
