/**
 * Pessoas e unidade do Espaço Byla para match em planilhas / descrições.
 * Sobrescreva com env `BYLA_FUNCIONARIOS_JSON` (array de objetos com nome, funcao, aliases, opcional subempresa).
 */

export type EntidadeByla = {
  nome: string;
  funcao: string;
  aliases: string[];
  /** Marca/unidade (ex.: Byla Dança) em oposição a pessoa física. */
  subempresa?: boolean;
  categoriasSugeridas?: string[];
};

/** Lista informada pelo operador — nomes canônicos + aliases comuns na planilha/extrato. */
export const ENTIDADES_BYLA_PADRAO: EntidadeByla[] = [
  {
    nome: 'Nilson',
    funcao: 'Equipe',
    aliases: ['NILSON', 'JOSÉ NILSON', 'JOSE NILSON', 'NILSON ALVES'],
  },
  {
    nome: 'Samuel',
    funcao: 'Equipe',
    aliases: ['SAMUEL', 'SAMUEL DAVI', 'SAMUEL DAVI TUDE'],
  },
  {
    nome: 'Maria Eduarda',
    funcao: 'Equipe',
    aliases: ['MARIA EDUARDA', 'MARIA', 'EDUARDA', 'M. EDUARDA'],
  },
  {
    nome: 'Luciana',
    funcao: 'Equipe',
    aliases: ['LUCIANA', 'LU'],
  },
  {
    nome: 'Levi',
    funcao: 'Equipe',
    aliases: ['LEVI'],
  },
  {
    nome: 'Andrea',
    funcao: 'Equipe',
    aliases: ['ANDREA', 'ANDRÉA'],
  },
  {
    nome: 'Sara',
    funcao: 'Equipe',
    aliases: ['SARA', 'SÁRA'],
  },
  {
    nome: 'BylaDança',
    funcao: 'Subempresa / Byla Dança',
    subempresa: true,
    aliases: [
      'BYLA DANÇA',
      'BYLA DANCA',
      'BYLADANÇA',
      'BYLADANCA',
      'BYLA DAN',
      'ESPACO BYLA',
      'ESPAÇO BYLA',
    ],
    categoriasSugeridas: ['Operacional', 'Byla Dança'],
  },
];

function parseEnvJson(): EntidadeByla[] | null {
  const raw = (process.env.BYLA_FUNCIONARIOS_JSON ?? '').trim();
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) return null;
    const out: EntidadeByla[] = [];
    for (const row of j) {
      if (!row || typeof row !== 'object') continue;
      const o = row as Record<string, unknown>;
      const nome = String(o.nome ?? '').trim();
      const funcao = String(o.funcao ?? '').trim();
      if (!nome) continue;
      const aliasesRaw = o.aliases;
      const aliases = Array.isArray(aliasesRaw)
        ? aliasesRaw.map((x) => String(x).trim()).filter(Boolean)
        : [];
      const categoriasSugeridas = Array.isArray(o.categoriasSugeridas)
        ? (o.categoriasSugeridas as unknown[]).map((x) => String(x).trim()).filter(Boolean)
        : undefined;
      out.push({
        nome,
        funcao: funcao || 'Equipe',
        aliases,
        subempresa: Boolean(o.subempresa),
        categoriasSugeridas,
      });
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

/** Lista usada em match: env tem prioridade sobre o padrão. */
export function getEntidadesByla(): EntidadeByla[] {
  return parseEnvJson() ?? ENTIDADES_BYLA_PADRAO;
}
