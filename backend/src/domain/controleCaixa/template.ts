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
 * Fallback quando não há mês anterior no banco — espelha o último oficial migrado
 * (competência jun/2026 = aba JULHO 26 da planilha). Teatro Infantil fica nas saídas
 * parceiros (como em mai/2026) para o Fluxo poder classificar quando houver valor.
 * Novos meses normais herdam via readControleCaixa → mes_anterior / oficial.
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
          linha('ent_parc_danca', 'Dança', 0),
          linha('ent_parc_yoga', 'Yoga', 1),
          linha('ent_parc_pilates_mari', 'Pilates Mari', 2),
          linha('ent_parc_teatro', 'Teatro', 3),
          linha('ent_parc_bruna_gr', 'Bruna GR', 4),
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
          linha('ent_alug_neto_sba', 'Neto (SBA)', 0),
          linha('ent_alug_pholha', 'Pholha (Funcional)', 1),
          linha('ent_alug_forro_alma', 'Forró e Alma', 2),
          linha('ent_alug_pilates_fabi', 'Pilates Fabi', 3),
          linha('ent_alug_loja_everaldo', 'Loja (Everaldo)', 4),
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
          linha('sai_parc_danca', 'Dança', 0),
          linha('sai_parc_yoga', 'Yoga', 1),
          linha('sai_parc_pilates_mari', 'Pilates Mari', 2),
          linha('sai_parc_teatro', 'Teatro', 3),
          linha('sai_parc_teatro_infantil', 'Teatro Infantil', 4),
          linha('sai_parc_bruna_gr', 'Bruna GR', 5),
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
          linha('sai_fix_energia', 'Energia', 0),
          linha('sai_fix_agua', 'Água', 1),
          linha('sai_fix_net', 'Net', 2),
          linha('sai_fix_materiais', 'Materiais', 3),
          linha('sai_fix_energia_solar', 'Energia Solar', 4),
          linha('sai_fix_contadora', 'Contadora', 5),
          linha('sai_fix_eli_ar', 'Eli Ar Condicionado', 6),
          linha('sai_fix_impostos', 'Impostos', 7),
          linha('sai_fix_iptu', 'IPTU', 8),
          linha('sai_fix_samuel', 'Samuel', 9),
          linha('sai_fix_luciana', 'Luciana', 10),
          linha('sai_fix_funcionarios', 'Funcionários', 11),
          linha('sai_fix_transporte', 'Transporte', 12),
        ],
      },
    ],
  };
}
