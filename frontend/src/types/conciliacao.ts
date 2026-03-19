export interface ReconciliacaoMensalidadeRow {
  aluno_plano_id: number;
  atividade_nome: string;
  aluno_nome: string;
  valor: number;
  data_pagamento: string;
  forma_pagamento: string | null;
  nome_pagador_cadastro: string | null;
  valor_preenchido: boolean;
  transacao_id: string | null;
  pessoa_banco: string | null;
  data_banco: string | null;
  valor_banco: number | null;
  confirmado_banco: boolean;
}
