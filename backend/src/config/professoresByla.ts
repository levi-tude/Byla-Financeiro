/**
 * Quem é PROFESSOR para a consulta de repasses (regra do Levi, 31/10/2026):
 * professor = quem dá aula de Pilates, Funcional ou das outras atividades.
 * Sócios e funcionários que não dão aula NÃO são professores.
 *
 * Lista em código (não altera o mapeamento pessoa→categoria do banco). Só apelidos/primeiro nome,
 * nunca nome completo, CPF ou contato (o repositório é público).
 * `confirmado: true` = confirmado pelo Levi (31/10/2026 12:49); `false` = inferência a conferir.
 */
export type ProfessorConfig = {
  apelido: string;
  atividade: string;
  /** Início do nome (normalizado, minúsculo) como aparece no extrato: "marina", "maria clara". */
  primeiroNomeExtrato: string[];
  /** Linha do bloco "Saídas Parceiros" do Controle de caixa (comparação exata, normalizada). */
  linhaControle: string[];
  confirmado: boolean;
  obs?: string;
};

export const PROFESSORES_BYLA: readonly ProfessorConfig[] = [
  { apelido: 'Mari', atividade: 'Pilates', primeiroNomeExtrato: ['marina'], linhaControle: ['pilates mari'], confirmado: true },
  { apelido: 'Bruna', atividade: 'GR', primeiroNomeExtrato: ['bruna'], linhaControle: ['bruna gr'], confirmado: true },
  { apelido: 'João', atividade: 'Teatro', primeiroNomeExtrato: ['joao'], linhaControle: ['teatro'], confirmado: true },
  { apelido: 'Ludmila', atividade: 'Yoga', primeiroNomeExtrato: ['ludmila'], linhaControle: ['yoga'], confirmado: true },
  {
    apelido: 'Maria Clara',
    atividade: 'Byla Dança',
    primeiroNomeExtrato: ['maria clara'],
    // A linha "Dança" do Controle cobre várias professoras/organizadoras ainda não nomeadas: não atribuir.
    linhaControle: [],
    confirmado: true,
    obs: 'Byla Dança tem outras professoras e organizadoras ainda não identificadas.',
  },
  { apelido: 'Sara', atividade: 'Byla Dança', primeiroNomeExtrato: ['sara'], linhaControle: [], confirmado: true },
  { apelido: 'Naluh', atividade: 'Jazz (Byla Dança)', primeiroNomeExtrato: ['naluh'], linhaControle: [], confirmado: true },
];

/**
 * Repasses que NÃO são de professor (confirmado pelo Levi): aparecem em linha separada,
 * fora do total de professores.
 */
export type RepasseGeralConfig = { rotulo: string; nomeExtrato: string[] };
export const REPASSES_GERAIS: readonly RepasseGeralConfig[] = [
  { rotulo: 'Repasse Byla Dança / Luciana (Academia Cultural)', nomeExtrato: ['academia cultural'] },
];

/** Sócios: nunca são professores. */
export const SOCIOS_PRIMEIRO_NOME: readonly string[] = ['samuel', 'luciana'];
/** Funcionários que não dão aula (confirmado pelo Levi). */
export const FUNCIONARIOS_NAO_PROFESSORES: readonly string[] = ['andrea', 'maria eduarda'];
/** Nunca entram como professores. */
export const NAO_PROFESSORES_PRIMEIRO_NOME: readonly string[] = [...SOCIOS_PRIMEIRO_NOME, ...FUNCIONARIOS_NAO_PROFESSORES];

/**
 * NÃO são professores: pagam coworking ao Byla (entrada), confirmado pelo Levi 31/10/2026.
 * `aliases` = como podem perguntar; `nomeExtrato` = início do nome no extrato.
 */
export type CoworkingConfig = { rotulo: string; aliases: string[]; nomeExtrato: string[] };
export const COWORKING_PAGANTES: readonly CoworkingConfig[] = [
  { rotulo: 'Pholha (Funcional)', aliases: ['pholha', 'weider', 'wendel', 'funcional'], nomeExtrato: ['weider'] },
];
