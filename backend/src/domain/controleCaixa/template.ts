export type ControleLockedLevel = 'none' | 'warn' | 'strong';

export type ControleTemplateLinha = {
  templateKey: string | null;
  label: string;
  ordem: number;
  valor: number | null;
  valorTexto: string | null;
  isDefault: boolean;
  isCustom: boolean;
  lockedLevel: ControleLockedLevel;
};

export type ControleTemplateBloco = {
  templateKey: string | null;
  tipo: 'entrada' | 'saida';
  titulo: string;
  ordem: number;
  isDefault: boolean;
  isCustom: boolean;
  lockedLevel: ControleLockedLevel;
  linhas: ControleTemplateLinha[];
};

export type ControleTemplatePayload = {
  abaRef: string | null;
  totais: {
    entradaTotal: number | null;
    saidaTotal: number | null;
    lucroTotal: number | null;
    saidaParceirosTotal: number | null;
    saidaFixasTotal: number | null;
    saidaSomaSecoesPrincipais: number | null;
  };
  blocos: ControleTemplateBloco[];
};

function linha(
  key: string | null,
  label: string,
  ordem: number,
  lockedLevel: ControleLockedLevel = 'warn',
  isCustom = true,
): ControleTemplateLinha {
  return {
    templateKey: key,
    label,
    ordem,
    valor: null,
    valorTexto: null,
    isDefault: !isCustom,
    isCustom,
    lockedLevel,
  };
}

/**
 * Fallback quando não há mês anterior no banco — espelha estrutura operacional (ref. maio/2026).
 * Novos meses normais herdam via readControleCaixa → mes_anterior.
 */
export function buildControleCaixaTemplate(): ControleTemplatePayload {
  return {
    abaRef: null,
    totais: {
      entradaTotal: null,
      saidaTotal: null,
      lucroTotal: null,
      saidaParceirosTotal: null,
      saidaFixasTotal: null,
      saidaSomaSecoesPrincipais: null,
    },
    blocos: [
      {
        templateKey: 'entrada_parceiros',
        tipo: 'entrada',
        titulo: 'ENTRADAS PARCEIROS',
        ordem: 0,
        isDefault: true,
        isCustom: false,
        lockedLevel: 'strong',
        linhas: [
          linha(null, 'Dança', 0),
          linha(null, 'Yoga', 1),
          linha(null, 'Pilates Mari', 2),
          linha(null, 'Teatro', 3),
          linha(null, 'Bruna GR', 4),
        ],
      },
      {
        templateKey: 'entrada_aluguel_coworking',
        tipo: 'entrada',
        titulo: 'ENTRADAS ALUGUEL / COWORKING',
        ordem: 1,
        isDefault: true,
        isCustom: false,
        lockedLevel: 'strong',
        linhas: [
          linha(null, 'Neto (SBA)', 0),
          linha(null, 'Pholha (Funcional)', 1),
          linha(null, 'Forró e Alma', 2),
          linha(null, 'Pilates Fabi', 3),
          linha(null, 'Loja (Everaldo)', 4),
        ],
      },
      {
        templateKey: 'saida_parceiros',
        tipo: 'saida',
        titulo: 'Saídas Parceiros',
        ordem: 2,
        isDefault: true,
        isCustom: false,
        lockedLevel: 'strong',
        linhas: [
          linha(null, 'Dança', 0),
          linha(null, 'Yoga', 1),
          linha(null, 'Pilates Mari', 2),
          linha(null, 'Teatro', 3),
          linha(null, 'Teatro Infantil', 4),
          linha(null, 'Bruna GR', 5),
        ],
      },
      {
        templateKey: 'saida_gastos_fixos',
        tipo: 'saida',
        titulo: 'Saídas Fixas',
        ordem: 3,
        isDefault: true,
        isCustom: false,
        lockedLevel: 'strong',
        linhas: [
          linha(null, 'Energia', 0),
          linha(null, 'Água', 1),
          linha(null, 'Net', 2),
          linha(null, 'Materiais', 3),
          linha(null, 'Energia Solar', 4),
          linha(null, 'Contadora', 5),
          linha(null, 'Parcela Pilates', 6),
          linha(null, 'Eli Ar Condicionado', 7),
          linha(null, 'Impostos', 8),
          linha(null, 'IPTU', 9),
          linha(null, 'Samuel', 10),
          linha(null, 'Luciana', 11),
          linha(null, 'Funcionários', 12),
          linha(null, 'Transporte', 13),
        ],
      },
    ],
  };
}
