/**
 * Quem é PROFESSOR para a consulta de repasses (regra do Levi, 31/10/2026):
 * professor = quem dá aula de Pilates, Funcional ou das outras atividades.
 * Sócios e funcionários que não dão aula NÃO são professores.
 *
 * Lista em código (não altera o mapeamento pessoa→categoria do banco). Só apelidos/primeiro nome,
 * nunca nome completo, CPF ou contato (o repositório é público).
 * `inferencia: true` = ligação deduzida (ex.: apelido "Mari" ≈ primeiro nome "Marina" no extrato) e precisa
 * de conferência do Levi.
 */
export type ProfessorConfig = {
  apelido: string;
  atividade: string;
  /** Primeiro nome (normalizado) como aparece no extrato bancário. */
  primeiroNomeExtrato: string[];
  /** Linha do bloco "Saídas Parceiros" do Controle de caixa. */
  linhaControle: string[];
  inferencia: boolean;
  obs?: string;
};

export const PROFESSORES_BYLA: readonly ProfessorConfig[] = [
  {
    apelido: 'Mari',
    atividade: 'Pilates',
    primeiroNomeExtrato: ['marina'],
    linhaControle: ['pilates mari'],
    inferencia: true,
    obs: 'Apelido "Mari" ligado ao primeiro nome "Marina" no extrato por inferência.',
  },
  {
    apelido: 'Bruna',
    atividade: 'GR',
    primeiroNomeExtrato: ['bruna'],
    linhaControle: ['bruna gr'],
    inferencia: true,
    obs: 'Ligação ao extrato pelo primeiro nome "Bruna" (inferência).',
  },
  {
    apelido: 'Pholha',
    atividade: 'Funcional',
    primeiroNomeExtrato: ['pholha'],
    linhaControle: ['funcional', 'pholha'],
    inferencia: true,
    obs: 'Apelido: o nome no extrato ainda não foi identificado.',
  },
];

/** Nunca são professores (sócios). Funcionários só entram se derem aula (incluir acima). */
export const NAO_PROFESSORES_PRIMEIRO_NOME: readonly string[] = ['samuel'];
