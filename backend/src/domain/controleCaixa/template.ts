export type ControleLockedLevel = 'none' | 'warn' | 'strong';

export type ControleTemplateLinha = {
  templateKey: string;
  label: string;
  ordem: number;
  valor: number | null;
  valorTexto: string | null;
  isDefault: boolean;
  isCustom: boolean;
  lockedLevel: ControleLockedLevel;
};

export type ControleTemplateBloco = {
  templateKey: string;
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
  key: string,
  label: string,
  ordem: number,
  lockedLevel: ControleLockedLevel = 'warn'
): ControleTemplateLinha {
  return {
    templateKey: key,
    label,
    ordem,
    valor: null,
    valorTexto: null,
    isDefault: true,
    isCustom: false,
    lockedLevel,
  };
}

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
        titulo: 'Entradas Parceiros',
        ordem: 0,
        isDefault: true,
        isCustom: false,
        lockedLevel: 'strong',
        linhas: [
          linha('ent_parc_pilates', 'Pilates', 0),
          linha('ent_parc_danca', 'Dança', 1),
          linha('ent_parc_teatro', 'Teatro', 2),
          linha('ent_parc_yoga', 'Yoga', 3),
          linha('ent_parc_funcional', 'Funcional', 4),
          linha('ent_parc_outros', 'Outros parceiros', 5),
        ],
      },
      {
        templateKey: 'entrada_aluguel_coworking',
        tipo: 'entrada',
        titulo: 'Entradas Aluguel / Coworking',
        ordem: 1,
        isDefault: true,
        isCustom: false,
        lockedLevel: 'strong',
        linhas: [
          linha('ent_alug_sala1', 'Aluguel sala 1', 0),
          linha('ent_alug_sala2', 'Aluguel sala 2', 1),
          linha('ent_alug_coworking', 'Coworking', 2),
          linha('ent_alug_outros', 'Outras entradas aluguel', 3),
        ],
      },
      {
        templateKey: 'saida_parceiros',
        tipo: 'saida',
        titulo: 'Total Saídas (Parceiros)',
        ordem: 2,
        isDefault: true,
        isCustom: false,
        lockedLevel: 'strong',
        linhas: [
          linha('sai_parc_pilates', 'Repasse Pilates', 0),
          linha('sai_parc_danca', 'Repasse Dança', 1),
          linha('sai_parc_teatro', 'Repasse Teatro', 2),
          linha('sai_parc_yoga', 'Repasse Yoga', 3),
          linha('sai_parc_funcional', 'Repasse Funcional', 4),
          linha('sai_parc_outros', 'Outros repasses', 5),
        ],
      },
      {
        templateKey: 'saida_gastos_fixos',
        tipo: 'saida',
        titulo: 'Gastos Fixos',
        ordem: 3,
        isDefault: true,
        isCustom: false,
        lockedLevel: 'strong',
        linhas: [
          linha('sai_fixo_aluguel', 'Aluguel', 0),
          linha('sai_fixo_energia', 'Energia', 1),
          linha('sai_fixo_agua', 'Água', 2),
          linha('sai_fixo_internet', 'Internet', 3),
          linha('sai_fixo_salarios', 'Salários / Pró-labore', 4),
          linha('sai_fixo_impostos', 'Impostos e taxas', 5),
          linha('sai_fixo_sistemas', 'Sistemas / assinaturas', 6),
          linha('sai_fixo_marketing', 'Marketing', 7),
          linha('sai_fixo_outros', 'Outros gastos fixos', 8),
        ],
      },
      {
        templateKey: 'saida_aluguel_coworking',
        tipo: 'saida',
        titulo: 'Saídas Aluguel',
        ordem: 4,
        isDefault: true,
        isCustom: false,
        lockedLevel: 'strong',
        linhas: [
          linha('sai_alug_limpeza', 'Limpeza', 0),
          linha('sai_alug_manutencao', 'Manutenção', 1),
          linha('sai_alug_condominio', 'Condomínio', 2),
          linha('sai_alug_outros', 'Outras saídas aluguel', 3),
        ],
      },
    ],
  };
}
