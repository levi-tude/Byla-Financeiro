/** Chaves estáveis Aluguel/Coworking e Saídas Fixas (espelham `ent_parc_*` / `sai_parc_*`). */

function normLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

const STABLE_ENTRADA_ALUGUEL_BY_LABEL: Record<string, string> = {
  'neto (sba)': 'ent_alug_neto_sba',
  neto: 'ent_alug_neto_sba',
  'pholha (funcional)': 'ent_alug_pholha',
  pholha: 'ent_alug_pholha',
  'forro e alma': 'ent_alug_forro_alma',
  'forró e alma': 'ent_alug_forro_alma',
  'pilates fabi': 'ent_alug_pilates_fabi',
  'loja (everaldo)': 'ent_alug_loja_everaldo',
  loja: 'ent_alug_loja_everaldo',
  everaldo: 'ent_alug_loja_everaldo',
};

const STABLE_SAIDA_FIXA_BY_LABEL: Record<string, string> = {
  energia: 'sai_fix_energia',
  agua: 'sai_fix_agua',
  água: 'sai_fix_agua',
  net: 'sai_fix_net',
  internet: 'sai_fix_net',
  materiais: 'sai_fix_materiais',
  'energia solar': 'sai_fix_energia_solar',
  contadora: 'sai_fix_contadora',
  'eli ar condicionado': 'sai_fix_eli_ar',
  eli: 'sai_fix_eli_ar',
  impostos: 'sai_fix_impostos',
  iptu: 'sai_fix_iptu',
  samuel: 'sai_fix_samuel',
  luciana: 'sai_fix_luciana',
  funcionarios: 'sai_fix_funcionarios',
  funcionários: 'sai_fix_funcionarios',
  transporte: 'sai_fix_transporte',
  'parcela pilates': 'sai_fix_parcela_pilates',
};

export const LEGACY_ENTRADA_ALUGUEL_TEMPLATE_KEY_LABELS: Record<string, string> = {
  ent_alug_neto_sba: 'Neto (SBA)',
  ent_alug_pholha: 'Pholha (Funcional)',
  ent_alug_forro_alma: 'Forró e Alma',
  ent_alug_pilates_fabi: 'Pilates Fabi',
  ent_alug_loja_everaldo: 'Loja (Everaldo)',
};

export const LEGACY_SAIDA_FIXA_TEMPLATE_KEY_LABELS: Record<string, string> = {
  sai_fix_energia: 'Energia',
  sai_fix_agua: 'Água',
  sai_fix_net: 'Net',
  sai_fix_materiais: 'Materiais',
  sai_fix_energia_solar: 'Energia Solar',
  sai_fix_contadora: 'Contadora',
  sai_fix_eli_ar: 'Eli Ar Condicionado',
  sai_fix_impostos: 'Impostos',
  sai_fix_iptu: 'IPTU',
  sai_fix_samuel: 'Samuel',
  sai_fix_luciana: 'Luciana',
  sai_fix_funcionarios: 'Funcionários',
  sai_fix_transporte: 'Transporte',
  sai_fix_parcela_pilates: 'Parcela Pilates',
};

export function stableEntradaAluguelTemplateKeyForLabel(label: string): string | null {
  const withCedilla = label.trim().toLowerCase();
  const norm = normLabel(label);
  return (
    STABLE_ENTRADA_ALUGUEL_BY_LABEL[withCedilla] ??
    STABLE_ENTRADA_ALUGUEL_BY_LABEL[norm] ??
    null
  );
}

export function stableSaidaFixaTemplateKeyForLabel(label: string): string | null {
  const withCedilla = label.trim().toLowerCase();
  const norm = normLabel(label);
  return (
    STABLE_SAIDA_FIXA_BY_LABEL[withCedilla] ?? STABLE_SAIDA_FIXA_BY_LABEL[norm] ?? null
  );
}

export function isStableEntradaAluguelKey(templateKey: string): boolean {
  return templateKey.trim().startsWith('ent_alug_');
}

export function isStableSaidaFixaKey(templateKey: string): boolean {
  return templateKey.trim().startsWith('sai_fix_');
}
