#!/usr/bin/env node
/**
 * Paths that must never enter the public GitHub repo (PII, secrets, estágio, dumps).
 * Human list: docs/NAO_COMMITAR.md — keep this file in sync with .gitignore (Local-only / PII).
 */
export const FORBIDDEN_PATH_RULES = [
  {
    id: 'dotenv',
    glob: '.env',
    reason: '.env com valores reais (exceto .env.example)',
  },
  {
    id: 'mcp-json',
    glob: '.cursor/mcp.json',
    reason: 'MCP Cursor com chaves',
  },
  {
    id: 'service-account',
    glob: '**/service-account*.json',
    reason: 'JSON de service account',
  },
  {
    id: 'credentials-json',
    glob: '**/*.credentials.json',
    reason: 'JSON de credencial',
  },
  {
    id: 'n8n-sa',
    glob: 'backend/n8n-byla-14b9ea6e929d.json',
    reason: 'Credencial n8n / Google',
  },
  {
    id: 'pem',
    glob: '**/*.{pem,p12,pfx}',
    reason: 'Certificado ou chave privada',
  },
  {
    id: 'byla-privado',
    glob: 'Byla-Privado/',
    reason: 'Arquivo privado fora do Git público',
  },
  {
    id: 'tmp-any',
    glob: '_tmp*',
    reason: 'Dump / rascunho local (_tmp)',
  },
  {
    id: 'backend-tmp',
    glob: 'backend/_tmp*',
    reason: 'Dump local em backend/_tmp',
  },
  {
    id: 'backend-audit',
    glob: 'backend/scripts/_audit*',
    reason: 'Script local _audit (não é o audit de produto)',
  },
  {
    id: 'backend-diag',
    glob: 'backend/scripts/_diag*',
    reason: 'Script local _diag',
  },
  {
    id: 'backend-check',
    glob: 'backend/scripts/_check*',
    reason: 'Script local _check',
  },
  {
    id: 'backend-list',
    glob: 'backend/scripts/_list*',
    reason: 'Script local _list',
  },
  {
    id: 'scripts-underscore',
    glob: 'scripts/_*',
    reason: 'Rascunho em scripts/_',
  },
  {
    id: 'build-anexo',
    glob: 'scripts/build_anexo*',
    reason: 'Script de anexo de estágio',
  },
  {
    id: 'generate-relatorio',
    glob: 'scripts/generate_relatorio*',
    reason: 'Gerador de relatório de estágio',
  },
  {
    id: 'merge-relatorio',
    glob: 'scripts/merge_relatorio*',
    reason: 'Merge de relatório de estágio',
  },
  {
    id: 'generate-quimica',
    glob: 'scripts/generate_quimica*',
    reason: 'Script local de relatório',
  },
  {
    id: 'setup-gh',
    glob: 'scripts/setup-gh-e-renomear-repo.ps1',
    reason: 'Script local de rename/setup GitHub',
  },
  {
    id: 'relatorio-parcial',
    glob: 'docs/RELATORIO_PARCIAL*',
    reason: 'Relatório de estágio',
  },
  {
    id: 'docs-anexos',
    glob: 'docs/anexos/',
    reason: 'Anexos pessoais / de estágio',
  },
  {
    id: 'prompt-estagio',
    glob: 'docs/PROMPT_*ESTAGIO*',
    reason: 'Prompt de estágio',
  },
  {
    id: 'prompt-anexo',
    glob: 'docs/PROMPT_ANEXO*',
    reason: 'Prompt de anexo de estágio',
  },
  {
    id: 'auditoria-cyber',
    glob: 'docs/AUDITORIA_CYBER*',
    reason: 'Auditoria cyber local',
  },
  {
    id: 'cyber-skills-doc',
    glob: 'docs/CYBER_SKILLS*',
    reason: 'Pacote cyber local',
  },
  {
    id: 'hardening-docs',
    glob: 'docs/HARDENING_*',
    reason: 'Inventário de hardening local',
  },
  {
    id: 'superpowers-audits',
    glob: 'docs/superpowers/audits/',
    reason: 'Auditorias superpowers locais',
  },
  {
    id: 'publish-wave',
    glob: '_publish-wave/',
    reason: 'Pacote local de onda (não commitar o WIP)',
  },
  {
    id: 'worktrees',
    glob: '.worktrees/',
    reason: 'Worktrees locais',
  },
  {
    id: 'dot-superpowers',
    glob: '.superpowers/',
    reason: 'Estado local superpowers',
  },
  {
    id: 'cyber-skill-sbom',
    glob: '.cursor/skills/analyzing-sbom-for-supply-chain-vulnerabilities/',
    reason: 'Skill genérica de cyber (não é produto)',
  },
  {
    id: 'cyber-skill-api-test',
    glob: '.cursor/skills/conducting-api-security-testing/',
    reason: 'Skill genérica de cyber (não é produto)',
  },
  {
    id: 'cyber-skill-prompt-inject',
    glob: '.cursor/skills/detecting-ai-model-prompt-injection-attacks/',
    reason: 'Skill genérica de cyber (não é produto)',
  },
  {
    id: 'cyber-skill-bola',
    glob: '.cursor/skills/detecting-broken-object-property-level-authorization/',
    reason: 'Skill genérica de cyber (não é produto)',
  },
  {
    id: 'cyber-skill-depconf',
    glob: '.cursor/skills/detecting-dependency-confusion/',
    reason: 'Skill genérica de cyber (não é produto)',
  },
  {
    id: 'cyber-skill-indirect-inject',
    glob: '.cursor/skills/detecting-indirect-prompt-injection/',
    reason: 'Skill genérica de cyber (não é produto)',
  },
  {
    id: 'cyber-skill-shadow-api',
    glob: '.cursor/skills/detecting-shadow-api-endpoints/',
    reason: 'Skill genérica de cyber (não é produto)',
  },
  {
    id: 'cyber-skill-api-key',
    glob: '.cursor/skills/implementing-api-key-security-controls/',
    reason: 'Skill genérica de cyber (não é produto)',
  },
  {
    id: 'cyber-skill-rate-limit',
    glob: '.cursor/skills/implementing-api-rate-limiting-and-throttling/',
    reason: 'Skill genérica de cyber (não é produto)',
  },
  {
    id: 'cyber-skill-devsecops',
    glob: '.cursor/skills/implementing-devsecops-security-scanning/',
    reason: 'Skill genérica de cyber (não é produto)',
  },
  {
    id: 'cyber-skill-jwt',
    glob: '.cursor/skills/implementing-jwt-signing-and-verification/',
    reason: 'Skill genérica de cyber (não é produto)',
  },
  {
    id: 'cyber-skill-llm-guard',
    glob: '.cursor/skills/implementing-llm-guardrails-for-security/',
    reason: 'Skill genérica de cyber (não é produto)',
  },
  {
    id: 'cyber-skill-secrets-ci',
    glob: '.cursor/skills/implementing-secrets-scanning-in-ci-cd/',
    reason: 'Skill genérica de cyber (não é produto)',
  },
  {
    id: 'cyber-skill-owasp',
    glob: '.cursor/skills/testing-api-security-with-owasp-top-10/',
    reason: 'Skill genérica de cyber (não é produto)',
  },
  {
    id: 'cyber-skill-bac',
    glob: '.cursor/skills/testing-for-broken-access-control/',
    reason: 'Skill genérica de cyber (não é produto)',
  },
];

export function normalizeGitPath(input) {
  return String(input || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
}

function escapeRegexChar(ch) {
  return /[.+^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
}

/**
 * gitignore-like glob → RegExp.
 * `*` = um segmento; `**` = vários; `{a,b}` = alternativas; sem `/` casa em qualquer pasta.
 */
export function globToRegExp(glob) {
  const dirOnly = glob.endsWith('/');
  const source = dirOnly ? glob.slice(0, -1) : glob;
  const matchAnyDirectory = !source.includes('/');

  let i = 0;
  let out = '';
  while (i < source.length) {
    const c = source[i];
    if (c === '*' && source[i + 1] === '*') {
      if (source[i + 2] === '/') {
        out += '(?:.*/)?';
        i += 3;
      } else {
        out += '.*';
        i += 2;
      }
      continue;
    }
    if (c === '*') {
      out += '[^/]*';
      i += 1;
      continue;
    }
    if (c === '?') {
      out += '[^/]';
      i += 1;
      continue;
    }
    if (c === '{') {
      const close = source.indexOf('}', i);
      if (close !== -1) {
        const inner = source.slice(i + 1, close);
        const alts = inner.split(',').map((part) => part.replace(/[.+^${}()|[\]\\]/g, '\\$&'));
        out += `(?:${alts.join('|')})`;
        i = close + 1;
        continue;
      }
    }
    out += escapeRegexChar(c);
    i += 1;
  }

  const prefix = matchAnyDirectory ? '(?:^|/)' : '^';
  return new RegExp(`${prefix}${out}(?:/|$)`, 'i');
}

function isDotEnvExample(relPath) {
  const base = relPath.split('/').pop();
  return base === '.env.example';
}

function isDotEnvForbidden(relPath) {
  if (isDotEnvExample(relPath)) return false;
  const base = relPath.split('/').pop() || '';
  return base === '.env' || base.startsWith('.env.');
}

export function matchForbiddenRule(relPath) {
  const p = normalizeGitPath(relPath);
  if (!p) return null;

  for (const rule of FORBIDDEN_PATH_RULES) {
    if (rule.id === 'dotenv') {
      if (isDotEnvForbidden(p)) return rule;
      continue;
    }
    const rx = globToRegExp(rule.glob);
    if (rx.test(p)) return rule;
  }
  return null;
}

export function findForbiddenInList(paths) {
  const hits = [];
  for (const path of paths) {
    const rule = matchForbiddenRule(path);
    if (rule) {
      hits.push({
        path: normalizeGitPath(path),
        id: rule.id,
        glob: rule.glob,
        reason: rule.reason,
      });
    }
  }
  return hits;
}
