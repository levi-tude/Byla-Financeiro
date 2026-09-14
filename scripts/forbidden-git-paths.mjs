/**
 * Padrões de caminho/conteúdo que NUNCA devem ser commitados.
 * Fonte humana: docs/NAO_COMMITAR.md
 * Usado por: verify-forbidden-paths.mjs, verify-git-push-safety.mjs
 */

/** Caminho relativo ao repo — string = substring, RegExp = test no path */
export const FORBIDDEN_PATH_RULES = [
  // Env e credenciais
  { id: 'env-file', test: (p) => {
    const b = p.split('/').pop() ?? p;
    return b === '.env' || (b.startsWith('.env.') && b !== '.env.example');
  }, reason: 'arquivo .env com valores reais' },
  { id: 'service-account', test: (p) => /service-account.*\.json$/i.test(p), reason: 'JSON de service account' },
  { id: 'credentials-json', test: (p) => /\.credentials\.json$/i.test(p), reason: 'arquivo .credentials.json' },
  { id: 'n8n-cred', test: (p) => /n8n-byla-.*\.json$/i.test(p), reason: 'credencial n8n local' },
  { id: 'pem-key', test: (p) => /\.(pem|p12|pfx)$/i.test(p), reason: 'certificado/chave privada' },

  // PII / dumps
  { id: 'backend-tmp', test: (p) => /^backend\/_tmp/i.test(p), reason: 'export temporário do backend (_tmp)' },
  { id: 'seed-real-alunos', test: (p) => /^scripts\/seed-modalidades-alunos/i.test(p), reason: 'seed com alunos reais' },
  { id: 'seed-real-profiles', test: (p) => /^scripts\/seed-profiles-roles-byla/i.test(p), reason: 'seed com usuários reais' },

  // Estágio e anexos
  { id: 'relatorio-estagio', test: (p) => /^docs\/RELATORIO_PARCIAL/i.test(p), reason: 'relatório de estágio' },
  { id: 'anexos', test: (p) => /^docs\/anexos\//i.test(p), reason: 'anexos pessoais (docs/anexos/)' },
  { id: 'prompt-estagio', test: (p) => /^docs\/PROMPT_.*(ESTAGIO|ANEXO)/i.test(p), reason: 'prompt de estágio/anexo' },
  { id: 'cyber-internal', test: (p) => /^docs\/(AUDITORIA_CYBER|CYBER_SKILLS|HARDENING_)/i.test(p), reason: 'doc interno cyber/hardening' },
  { id: 'audits-export', test: (p) => /^docs\/superpowers\/audits\//i.test(p) && /\.json$/i.test(p), reason: 'export JSON de auditoria com dados reais' },

  // Scripts locais
  { id: 'scripts-underscore', test: (p) => /^scripts\/_/i.test(p), reason: 'script local (scripts/_*)' },
  { id: 'scripts-estagio', test: (p) => /^scripts\/(build_anexo|generate_relatorio|merge_relatorio|generate_quimica)/i.test(p), reason: 'script de geração de estágio' },
  { id: 'backend-audit-scripts', test: (p) => /^backend\/scripts\/_(audit|diag|check|list)/i.test(p), reason: 'script de auditoria/diagnóstico local' },

  // n8n obsoleto com segredos
  { id: 'n8n-pluggy', test: (p) => /workflow-pluggy|verificar-retorno-edi/i.test(p), reason: 'workflow n8n obsoleto (Pluggy/EDI)' },
];

export function findForbiddenPath(relativePath) {
  const norm = relativePath.replace(/\\/g, '/');
  for (const rule of FORBIDDEN_PATH_RULES) {
    if (rule.test(norm)) return rule;
  }
  return null;
}

export function findForbiddenInList(paths) {
  const hits = [];
  for (const p of paths) {
    const rule = findForbiddenPath(p);
    if (rule) hits.push({ path: p, id: rule.id, reason: rule.reason });
  }
  return hits;
}
