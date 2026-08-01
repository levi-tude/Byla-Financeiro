/**
 * Catálogo do Consulta Byla: menu pronto + roteamento determinístico de intenção.
 * A IA (quando usada) só escolhe entre estes tools — nunca inventa fatos.
 */

export type ConsultaToolId =
  | 'resumo_mes'
  | 'resumo_semana'
  | 'resumo_dia'
  | 'resumo_periodo'
  | 'resumo_modalidades'
  | 'controle_oficial_vs_sistema'
  | 'resumo_categoria_extrato'
  | 'resumo_meio_pagamento'
  | 'pendentes_conciliacao'
  | 'pagamentos_fluxo_dia'
  | 'movimentos_banco_dia'
  | 'sem_vinculo_validacao'
  | 'busca_aluno'
  | 'busca_por_valor';

export type ConsultaIntent = {
  tool: ConsultaToolId;
  params: Record<string, string>;
  confidence: number;
  source: 'menu' | 'keyword';
};

/** Labels exatos do menu (também usados no frontend). */
export const CONSULTA_MENU: Array<{ label: string; tool: ConsultaToolId }> = [
  { label: 'Resumo do mês', tool: 'resumo_mes' },
  { label: 'Resumo da semana', tool: 'resumo_semana' },
  { label: 'Resumo do dia', tool: 'resumo_dia' },
  { label: 'Resumo por período', tool: 'resumo_periodo' },
  { label: 'Entradas por modalidade', tool: 'resumo_modalidades' },
  { label: 'Controle oficial vs sistema', tool: 'controle_oficial_vs_sistema' },
  { label: 'Resumo por categoria do extrato', tool: 'resumo_categoria_extrato' },
  { label: 'Resumo por meio de pagamento', tool: 'resumo_meio_pagamento' },
  { label: 'Pendentes de conciliação', tool: 'pendentes_conciliacao' },
  { label: 'Pagamentos do Fluxo no dia', tool: 'pagamentos_fluxo_dia' },
  { label: 'Movimentos do banco no dia', tool: 'movimentos_banco_dia' },
  { label: 'Sem vínculo na validação', tool: 'sem_vinculo_validacao' },
  { label: 'Situação do aluno…', tool: 'busca_aluno' },
  { label: 'Lançamento de R$ … ?', tool: 'busca_por_valor' },
];

export const CONSULTA_MENU_LABELS = CONSULTA_MENU.map((m) => m.label);

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Interpreta monthYear do contexto da UI (ex.: "07/2026", "7-2026", "2026-07"). */
export function parseMonthYearContext(monthYear?: string | null): { mes: number; ano: number } | null {
  if (!monthYear) return null;
  const raw = monthYear.trim();
  let m: RegExpMatchArray | null =
    raw.match(/^(\d{1,2})[\/\-](\d{4})$/) ?? raw.match(/^(\d{4})[\/\-](\d{1,2})$/);
  if (!m) return null;
  let mes: number;
  let ano: number;
  if (m[1]!.length === 4) {
    ano = Number(m[1]);
    mes = Number(m[2]);
  } else {
    mes = Number(m[1]);
    ano = Number(m[2]);
  }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return null;
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) return null;
  return { mes, ano };
}

export function todayIsoLocal(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function extractValorBrl(message: string): number | null {
  const m =
    message.match(/r\$\s*([\d.]+,\d{2})/i) ??
    message.match(/r\$\s*([\d]+(?:[.,]\d{1,2})?)/i) ??
    message.match(/(?:valor|de)\s+([\d.]+,\d{2})/i);
  if (!m) return null;
  const raw = m[1]!.replace(/\./g, '').replace(',', '.');
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function extractAlunoNome(message: string): string | null {
  const n = norm(message);
  const patterns = [
    /(?:situacao|status|como esta|como estao|aluno[a]?)\s+(?:d[oa]\s+)?(.+)$/i,
    /(?:buscar|busca|procurar|sobre)\s+(?:o\s+|a\s+)?aluno[a]?\s+(.+)$/i,
  ];
  for (const p of patterns) {
    const m = message.match(p);
    if (m?.[1]) {
      const nome = m[1].replace(/[?.!]+$/, '').trim();
      if (nome.length >= 2 && !/^r\$/i.test(nome)) return nome;
    }
  }
  // "aluno X" simples
  const m2 = n.match(/\baluno[a]?\s+([a-z0-9 ].{1,60})$/);
  if (m2?.[1] && !m2[1].includes('?')) return m2[1].trim();
  return null;
}

export function extractIsoDate(message: string, now = new Date()): string | null {
  const iso = message.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1]!;
  const br = message.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})\b/);
  if (br) {
    return `${br[3]}-${br[2]!.padStart(2, '0')}-${br[1]!.padStart(2, '0')}`;
  }
  const n = norm(message);
  if (/\bhoje\b/.test(n)) return todayIsoLocal(now);
  if (/\bontem\b/.test(n)) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return todayIsoLocal(d);
  }
  return null;
}

/**
 * Resolve intenção a partir do texto. Preferência: match exato do menu → keywords.
 * Retorna null se não couber no catálogo (orquestrador deve recusar + sugerir menu).
 */
export function resolveConsultaIntent(message: string, now = new Date()): ConsultaIntent | null {
  const trimmed = message.trim();
  if (!trimmed) return null;
  const n = norm(trimmed);

  for (const item of CONSULTA_MENU) {
    if (norm(item.label) === n || n === norm(item.label.replace(/…/g, '').trim())) {
      const params: Record<string, string> = {};
      if (
        item.tool === 'resumo_dia' ||
        item.tool === 'pagamentos_fluxo_dia' ||
        item.tool === 'movimentos_banco_dia'
      ) {
        params.data = todayIsoLocal(now);
      }
      if (item.tool === 'resumo_semana') {
        params.data_ref = todayIsoLocal(now);
      }
      if (item.tool === 'busca_aluno' || item.tool === 'busca_por_valor') {
        params.precisa_dado = '1';
      }
      return { tool: item.tool, params, confidence: 1, source: 'menu' };
    }
  }

  const data = extractIsoDate(trimmed, now);
  const valor = extractValorBrl(trimmed);
  const aluno = extractAlunoNome(trimmed);

  if (valor != null || /\blancamento\b/.test(n) && /\br\$\b|\bvalor\b/.test(n)) {
    const params: Record<string, string> = {};
    if (valor != null) params.valor = String(valor);
    else params.precisa_dado = '1';
    if (data) params.data = data;
    return { tool: 'busca_por_valor', params, confidence: 0.85, source: 'keyword' };
  }

  if (aluno || (/\baluno\b/.test(n) && n.length > 8)) {
    const params: Record<string, string> = {};
    if (aluno) params.nome = aluno;
    else params.precisa_dado = '1';
    return { tool: 'busca_aluno', params, confidence: 0.85, source: 'keyword' };
  }

  if (/\bpendente/.test(n) && /\bconcili/.test(n)) {
    return { tool: 'pendentes_conciliacao', params: {}, confidence: 0.9, source: 'keyword' };
  }
  if (/\bsem vinculo|\bnao vinculado|\bnão vinculado|\bvalidacao/.test(n) && /\bvinculo|validacao/.test(n)) {
    return { tool: 'sem_vinculo_validacao', params: {}, confidence: 0.85, source: 'keyword' };
  }
  if (/\boficial\b/.test(n) && /\bsistema\b/.test(n)) {
    return { tool: 'controle_oficial_vs_sistema', params: {}, confidence: 0.9, source: 'keyword' };
  }
  if (/\bcategoria/.test(n) && /\bextrato|banco/.test(n)) {
    return { tool: 'resumo_categoria_extrato', params: {}, confidence: 0.85, source: 'keyword' };
  }
  if (/\bmeio\b/.test(n) && /\bpagamento|pix|credito|debito/.test(n)) {
    return { tool: 'resumo_meio_pagamento', params: {}, confidence: 0.85, source: 'keyword' };
  }
  if (/\bmodalidade|parceiro/.test(n) && /\bentrada/.test(n)) {
    return { tool: 'resumo_modalidades', params: {}, confidence: 0.85, source: 'keyword' };
  }

  // Período explícito YYYY-MM-DD a YYYY-MM-DD (antes de "resumo + data" → dia)
  const range = trimmed.match(/(20\d{2}-\d{2}-\d{2})\s*(?:a|ate|até|-)\s*(20\d{2}-\d{2}-\d{2})/i);
  if (range) {
    return {
      tool: 'resumo_periodo',
      params: { inicio: range[1]!, fim: range[2]! },
      confidence: 0.95,
      source: 'keyword',
    };
  }

  if (/\bresumo\b/.test(n) && /\bsemana/.test(n)) {
    return { tool: 'resumo_semana', params: { data_ref: data ?? todayIsoLocal(now) }, confidence: 0.9, source: 'keyword' };
  }
  if (/\bresumo\b/.test(n) && /\bperiodo|período/.test(n)) {
    return { tool: 'resumo_periodo', params: { precisa_dado: '1' }, confidence: 0.8, source: 'keyword' };
  }
  if (/\bresumo\b/.test(n) && /\bmes|mês|competencia|competência/.test(n)) {
    return { tool: 'resumo_mes', params: {}, confidence: 0.9, source: 'keyword' };
  }
  if (/\bresumo\b/.test(n) && (/\bdia\b/.test(n) || data)) {
    return { tool: 'resumo_dia', params: { data: data ?? todayIsoLocal(now) }, confidence: 0.9, source: 'keyword' };
  }
  if (/\bfluxo\b/.test(n) && (/\bdia\b/.test(n) || /\bpagamento/.test(n))) {
    return {
      tool: 'pagamentos_fluxo_dia',
      params: { data: data ?? todayIsoLocal(now) },
      confidence: 0.85,
      source: 'keyword',
    };
  }
  if (/\bbanco\b|\bextrato\b/.test(n) && (/\bdia\b/.test(n) || /\bmovimento/.test(n))) {
    return {
      tool: 'movimentos_banco_dia',
      params: { data: data ?? todayIsoLocal(now) },
      confidence: 0.85,
      source: 'keyword',
    };
  }

  return null;
}

export function mensagemRecusaForaDoCatalogo(): string {
  const exemplos = CONSULTA_MENU_LABELS.slice(0, 6).join('; ');
  return (
    `Não tenho essa consulta no catálogo ainda. Use um dos atalhos do menu ou pergunte algo como: ${exemplos}.`
  );
}
