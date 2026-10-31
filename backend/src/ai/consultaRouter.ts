/**
 * Roteador determinístico da Consulta Byla (roda ANTES da IA).
 *
 * Só responde perguntas comuns com alta confiança (balanço do mês, últimos N meses,
 * comparação de meses, entradas de uma modalidade, pagamentos de uma pessoa, resumo do
 * dia/semana, recusas de escrita/dados pessoais). Qualquer dúvida → null → vai para a IA.
 * Também escolhe o subconjunto de 3–6 ferramentas relevantes enviado à IA.
 */
import type { ConsultaToolId } from './consultaCatalog.js';
import { extrairModalidadeEntrada, todayIsoLocal } from './consultaCatalog.js';

export type MesAno = { mes: number; ano: number };

export type RotaDeterministica =
  | { kind: 'tool'; tool: ConsultaToolId; params: Record<string, string>; ctx: MesAno; motivo: string }
  | { kind: 'recusa'; message: string; motivo: string };

const MESES: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8,
  setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};
const MESES_ABREV: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

export function normRouter(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9$,.\s-]/g, ' ')
    .replace(/(\d)\.(\d{3})/g, '$1$2')
    .replace(/[.,](?!\d)/g, ' ')
    .replace(/-/g, ' a ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PREP_MES = '(?:em|de|no|na|a|ate|e|com|vs|x|entre|do|da|mes de)';

/** Meses citados na frase (ordem de aparição). Abreviações só após preposição. */
export function extrairMeses(n: string): number[] {
  const out: number[] = [];
  const re = new RegExp(
    `\\b(${Object.keys(MESES).join('|')})\\b|(?:\\b${PREP_MES}\\s+)(${Object.keys(MESES_ABREV).join('|')})\\b|\\b(${Object.keys(MESES_ABREV).join('|')})(?=\\s+(?:a|ate)\\s+(?:${[...Object.keys(MESES), ...Object.keys(MESES_ABREV)].join('|')})\\b)`,
    'g',
  );
  for (const m of n.matchAll(re)) {
    const v = m[1] ? MESES[m[1]] : MESES_ABREV[(m[2] ?? m[3])!];
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

function ym(mes: number, ano: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

function shift(ctx: MesAno, delta: number): MesAno {
  const idx = ctx.ano * 12 + (ctx.mes - 1) + delta;
  return { ano: Math.floor(idx / 12), mes: (idx % 12) + 1 };
}

/** Mês citado → ano: mesmo ano do contexto (mês futuro responde "sem dados"). */
function comAno(mes: number, ctx: MesAno): MesAno {
  return { mes, ano: ctx.ano };
}

function isoDate(d: Date): string {
  return todayIsoLocal(d);
}

const NUM_EXTENSO: Record<string, number> = {
  dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
};

const NAO_PESSOA = new Set([
  'Pilates', 'Yoga', 'Teatro', 'Ballet', 'Jazz', 'Byla', 'Pix', 'PIX', 'Quanto', 'Quem', 'Qual', 'Teve', 'Tem',
  ...Object.keys(MESES).map((m) => m[0]!.toUpperCase() + m.slice(1)),
]);

const NOME = "([A-ZÀ-Ý][a-zà-ÿ']+(?:\\s+(?:de |da |do |dos |das )?[A-ZÀ-Ý][a-zà-ÿ']+)?)";

/** Nome próprio (com maiúscula) em "pagamento do X", "o X pagou", "recebemos da X", "pagamos ao X". */
export function extrairPessoa(original: string): string | null {
  const padroes = [
    new RegExp(`\\bpagamentos?\\s+(?:do|da|de|pro|pra|para o|para a|ao|à)\\s+${NOME}`),
    new RegExp(`(?:^|\\b(?:o|a|quanto o|quanto a)\\s+)${NOME}\\s+(?:pagou|pagaram|transferiu|mandou)\\b`, 'i'),
    new RegExp(`\\b(?:recebemos|recebido|recebi)\\s+(?:do|da|de)\\s+${NOME}`),
    new RegExp(`\\b(?:pagamos|paguei|pago)\\s+(?:ao|à|a|o|pro|pra|para o|para a)\\s+${NOME}`),
  ];
  for (const re of padroes) {
    const m = original.match(re);
    const nome = m?.[1]?.trim();
    if (nome && /^[A-ZÀ-Ý]/.test(nome) && !NAO_PESSOA.has(nome.split(/\s+/)[0]!)) return nome;
  }
  return null;
}

/**
 * Decide se a pergunta pode ser respondida sem IA. `null` = baixa confiança (vai para a IA).
 */
export function rotearConsultaDeterministica(message: string, ctx: MesAno, now = new Date()): RotaDeterministica | null {
  const original = message.trim();
  const n = normRouter(original);
  if (!n) return null;

  // Recusas (só leitura / dados pessoais) — nunca precisam de IA.
  if (/\b(apaga|apague|apagar|deleta|delete|deletar|exclui|exclua|excluir|remove|remova|remover|altera|altere|alterar|edita|edite|editar|lanca|lance|lancar|cadastra|cadastre)\b/.test(n)) {
    return {
      kind: 'recusa',
      motivo: 'escrita',
      message: 'A Consulta Byla é só leitura: não apago, altero nem lanço pagamentos. Faça essa correção direto na tela/planilha correspondente.',
    };
  }
  if (/\b(cpf|cnpj|rg|telefone|celular|whatsapp|endereco|e mail|email)\b/.test(n)) {
    return {
      kind: 'recusa',
      motivo: 'dados_pessoais',
      message: 'Não informo dados pessoais (CPF, telefone, endereço, e-mail) pela Consulta Byla. Consulte o cadastro do aluno no sistema.',
    };
  }

  // Perguntas encadeadas ("e de yoga?") dependem do histórico → IA.
  if (/^e\s/.test(n)) return null;

  const meses = extrairMeses(n);
  const ehRange = meses.length === 2 && /\b(a|ate|entre)\s+\S*\s*\b/.test(n) && !/\b(compar\w*|vs|x|versus)\b/.test(n);

  // Resumo do dia / semana.
  if (/\b(essa|esta|nesta|nessa)\s+semana\b|\bresumo\s+da\s+semana\b|\bsemana\s+atual\b/.test(n) && meses.length === 0) {
    return { kind: 'tool', tool: 'resumo_semana', params: { data_ref: isoDate(now) }, ctx, motivo: 'semana' };
  }
  if (/\b(hoje|resumo do dia|ontem)\b/.test(n) && meses.length === 0 && !/\bsemana\b/.test(n)) {
    const d = new Date(now);
    if (/\bontem\b/.test(n)) d.setDate(d.getDate() - 1);
    return { kind: 'tool', tool: 'resumo_dia', params: { data: isoDate(d) }, ctx, motivo: 'dia' };
  }

  // Últimos N meses.
  const ult = n.match(/\bultim[oa]s?\s+(\d{1,2}|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)\s+mes(?:es)?\b/);
  if (ult) {
    const qtd = /^\d+$/.test(ult[1]!) ? Number(ult[1]) : NUM_EXTENSO[ult[1]!]!;
    if (qtd >= 1 && qtd <= 12) {
      return { kind: 'tool', tool: 'balanco_meses', params: { meses: String(qtd) }, ctx, motivo: 'ultimos_n' };
    }
  }

  // Comparação de dois meses.
  if (meses.length === 2 && /\b(compar\w*|vs|x|versus|contra)\b/.test(n)) {
    const a = comAno(meses[0]!, ctx);
    const b = comAno(meses[1]!, ctx);
    return { kind: 'tool', tool: 'comparar_meses', params: { mes_a: ym(a.mes, a.ano), mes_b: ym(b.mes, b.ano) }, ctx, motivo: 'comparar' };
  }

  // Saídas: gastos com professores (antes de "pagamento de pessoa": não há nome).
  const mesUnico = meses.length === 1 ? comAno(meses[0]!, ctx) : meses.length === 0 ? ctx : null;
  if (mesUnico && /\bprofessor\w*\b/.test(n) && /\b(gast\w*|pag\w*|saida\w*|despesa\w*|custo\w*|repasse\w*)\b/.test(n) && !extrairPessoa(original)) {
    return { kind: 'tool', tool: 'repasses_professores', params: {}, ctx: mesUnico, motivo: 'professores' };
  }
  if (mesUnico && /\brepasses?\b/.test(n) && !extrairPessoa(original)) {
    return { kind: 'tool', tool: 'repasses_professores', params: {}, ctx: mesUnico, motivo: 'repasses' };
  }

  // Saldo de um aluno ("quanto o fulano deve?", "saldo do aluno fulano").
  const devedor =
    n.match(/\bquanto\s+(?:o|a)\s+(?:alun[oa]\s+)?([a-z]{2,20}(?:\s+[a-z]{2,20})?)\s+(?:deve|ta devendo|esta devendo)\b/)?.[1] ??
    n.match(/\bsaldo\s+d[oa]\s+alun[oa]\s+([a-z]{2,20}(?:\s+[a-z]{2,20})?)\b/)?.[1] ??
    null;
  if (mesUnico && devedor && !MESES[devedor.split(' ').at(-1)!]) {
    return { kind: 'tool', tool: 'saldo_aluno', params: { nome: devedor }, ctx: mesUnico, motivo: 'saldo_aluno' };
  }

  // Quem não pagou (por competência, mesmo cálculo da tela Fluxo de caixa).
  if (
    mesUnico &&
    !/\bquanto\b/.test(n) &&
    /\b(nao pag(ou|aram)|ainda nao pag\w*|inadimpl\w*|quem (esta|ta|tao|estao) devendo|em atraso|atrasad\w*|mensalidades? em aberto)\b/.test(n)
  ) {
    const cand = [...n.matchAll(/\b(?:no|na|do|da|de|em)\s+([a-z]{2,20})\b/g)]
      .map((x) => x[1]!)
      .filter((w) => !['mes', 'sistema', 'total', 'byla', 'hoje', 'momento', 'agora', 'alunos', 'aluno', 'mensalidade', 'atraso', 'aberto'].includes(w) && !MESES[w] && !MESES_ABREV[w]);
    const params: Record<string, string> = {};
    if (cand.length) params.modalidade = cand[0]!;
    const pg = n.match(/\bpagina\s+(\d{1,2})\b/)?.[1];
    if (pg) params.pagina = pg;
    return { kind: 'tool', tool: 'quem_nao_pagou', params, ctx: mesUnico, motivo: 'quem_nao_pagou' };
  }

  // Preços dos planos.
  if (
    /\b(precos?|quanto custa\w*|valor(es)?|tabela)\b/.test(n) &&
    /\b(planos?|mensalidades?)\b/.test(n) &&
    !/\b(pag\w*|entrou|recebe\w*)\b/.test(n)
  ) {
    const params: Record<string, string> = {};
    const f = n.match(/\b(\d)\s*x\b/)?.[1];
    if (f) params.frequencia = `${f}x`;
    const t = n.match(/\b(mensal|trimestral|semestral)\b/)?.[1];
    if (t) params.tipo = t;
    const IGN = ['plano', 'planos', 'preco', 'precos', 'mensalidade', 'mensal', 'semestral', 'trimestral', 'valor', 'valores', 'tabela', 'quanto', 'custa', 'o', 'a', 'os', 'as', 'do', 'da', 'de', 'no', 'na', 'e', 'qual', 'quais', 'sao', 'e', 'x', 'vezes', 'semana', 'por', 'custo', 'dos', 'das'];
    const m = n
      .replace(/\b\d\s*x\b/g, ' ')
      .split(/\s+/)
      .find((w) => w.length >= 2 && !IGN.includes(w) && !/^\d/.test(w));
    if (m) params.modalidade = m;
    return { kind: 'tool', tool: 'precos_planos', params, ctx, motivo: 'precos_planos' };
  }
  // Maiores saídas / pra quem foram os gastos.
  if (
    mesUnico &&
    /\bmaior\w*\s+(saida|gasto|despesa|pagamento)\w*|\b(saida|gasto|despesa)\w*\s+maior\w*|\bpra quem (foram|foi)\b|\bpara quem (foram|foi)\b|\bonde (gastamos|foi o dinheiro)\b/.test(n)
  ) {
    return { kind: 'tool', tool: 'maiores_saidas', params: {}, ctx: mesUnico, motivo: 'maiores_saidas' };
  }
  // Alunos ativos (opcionalmente de uma modalidade).
  const at = /\balunos?\s+(?:ativos?|matriculados?)\b|\bquantos alunos\b/.test(n);
  if (at && !/\b(pag\w*|deve\w*|devendo|inadimpl\w*|atrasad\w*)\b/.test(n)) {
    const cand = [...n.matchAll(/\b(?:no|na|do|da|de|em)\s+([a-z]{3,20})\b/g)].map((x) => x[1]!).filter(
      (w) => !['mes', 'sistema', 'total', 'byla', 'hoje', 'momento', 'agora', 'ativos', 'alunos'].includes(w) && !MESES[w],
    );
    const m = cand.at(-1) ?? '';
    return { kind: 'tool', tool: 'alunos_por_modalidade', params: m ? { modalidade: m } : {}, ctx, motivo: 'alunos_ativos' };
  }

  // Entradas por modalidade (tabela).
  if (/\b(entradas?|entrou|receita)\s+(por|de cada)\s+modalidade/.test(n) && meses.length <= 1) {
    const c = meses.length ? comAno(meses[0]!, ctx) : ctx;
    return { kind: 'tool', tool: 'resumo_modalidades', params: {}, ctx: c, motivo: 'por_modalidade' };
  }

  // Quanto entrou de <modalidade> (uma só) no mês/período.
  const mesesRe = [...Object.keys(MESES), ...Object.keys(MESES_ABREV)].join('|');
  let mod = extrairModalidadeEntrada(n)?.replace(new RegExp(`\\s+(?:(?:de|em|no|na|a|ate)\\s+)?(?:${mesesRe})\\b.*$`), '') ?? null;
  if (!mod) mod = n.match(/\b(?:o|a)\s+([a-z]{2,20})\s+(?:trouxe|rendeu|faturou|gerou|arrecadou)\b/)?.[1] ?? null;
  const varias = /\b(?:de|do|da)\s+\w+\s+(?:e|ou)\s+(?:de|do|da)?\s*\w+/.test(n) && !ehRange && meses.length < 2;
  if (mod && !varias && !extrairPessoa(original) && !/\s(e|ou)\s/.test(mod)) {
    const primeira = mod.split(' ')[0]!;
    if (!MESES[primeira] && !MESES_ABREV[primeira] && !/\b(aluno|alunos|professor|pessoa)\b/.test(mod)) {
      const params: Record<string, string> = { modalidade: mod };
      if (meses.length === 1) {
        const m = comAno(meses[0]!, ctx);
        params.mes_inicio = ym(m.mes, m.ano);
        params.mes_fim = ym(m.mes, m.ano);
      } else if (ehRange) {
        const a = comAno(meses[0]!, ctx);
        const b = comAno(meses[1]!, ctx);
        params.mes_inicio = ym(a.mes, a.ano);
        params.mes_fim = ym(b.mes, b.ano);
      } else if (meses.length > 2) {
        return null;
      }
      return { kind: 'tool', tool: 'entradas_modalidade_periodo', params, ctx, motivo: 'modalidade' };
    }
  }

  // Pagamento / recebimento de uma pessoa.
  const pessoa = extrairPessoa(original);
  if (pessoa && !/\b(deve|devendo|divida)\b/.test(n)) {
    const params: Record<string, string> = { nome: pessoa };
    if (meses.length === 1) {
      const m = comAno(meses[0]!, ctx);
      params.mes_inicio = ym(m.mes, m.ano);
      params.mes_fim = ym(m.mes, m.ano);
    } else if (ehRange) {
      params.mes_inicio = ym(meses[0]!, ctx.ano);
      params.mes_fim = ym(meses[1]!, ctx.ano);
    }
    return { kind: 'tool', tool: 'movimentos_por_pessoa', params, ctx, motivo: 'pessoa' };
  }

  // Balanço / resultado / quanto entrou no mês (sem modalidade nem pessoa).
  const ehBalanco = /\b(balanco|resultado|saldo|resumo|fechamento|como (ta|esta|foi|anda))\b/.test(n);
  const ehEntrou = /\bquanto\s+(entrou|entraram|recebemos|faturamos|arrecadamos)\b/.test(n);
  if (ehBalanco || ehEntrou) {
    // Algo além de período (modalidade, categoria, pessoa, professores…) → IA.
    if (new RegExp(`\\b(?:entrou|entraram|recebemos|faturamos)\\s+(?:de|do|da|com)\\s+(?!(?:${mesesRe})\\b)`).test(n)) return null;
    if (/\b(professor\w*|aluno\w*|modalidade\w*|categoria\w*|pix|cartao|dinheiro|gast\w*|saida\w*|despesa\w*|planilha|conciliac\w*|pendente\w*)\b/.test(n)) return null;
    if (/\bmes passado\b|\bmes anterior\b|\bultimo mes\b/.test(n) && meses.length === 0) {
      return { kind: 'tool', tool: 'resumo_mes', params: {}, ctx: shift(ctx, -1), motivo: 'mes_passado' };
    }
    if (meses.length === 0) {
      const resto = n
        .replace(/\b(como|ta|tá|esta|foi|anda|o|a|os|as|do|da|de|desse|deste|neste|nesse|esse|este|mes|atual|qual|quanto|entrou|entraram|recebemos|faturamos|arrecadamos|balanco|resultado|saldo|resumo|fechamento|me|mostra|mostre|fala|diz|ai|aí|em|no|na)\b/g, '')
        .trim();
      if (resto) return null;
      return { kind: 'tool', tool: 'resumo_mes', params: {}, ctx, motivo: 'mes' };
    }
    if (meses.length === 1) {
      return { kind: 'tool', tool: 'resumo_mes', params: {}, ctx: comAno(meses[0]!, ctx), motivo: 'mes_citado' };
    }
    // Vários meses contíguos ("maio e junho", "de jul a out") → balanço mês a mês.
    const ord = [...meses].sort((x, y) => x - y);
    const ini = ehRange ? meses[0]! : ord[0]!;
    const fim = ehRange ? meses[1]! : ord[ord.length - 1]!;
    const contiguo = ehRange || ord.every((m, i) => i === 0 || m === ord[i - 1]! + 1);
    if (contiguo && fim >= ini) {
      return { kind: 'tool', tool: 'balanco_meses', params: { meses: String(fim - ini + 1) }, ctx: comAno(fim, ctx), motivo: 'meses_citados' };
    }
    return null;
  }

  return null;
}

/** Grupos de palavras-chave → ferramentas relevantes para a IA. */
const GRUPOS: Array<{ re: RegExp; tools: ConsultaToolId[] }> = [
  { re: /\b(nao pagou|inadimpl\w*|atrasad\w*|pendente\w*|devendo)\b/, tools: ['quem_nao_pagou', 'saldo_aluno', 'pendentes_conciliacao'] },
  { re: /\b(ultim\w*\s+\d+|meses|trimestre|semestre)\b/, tools: ['balanco_meses', 'resumo_mes'] },
  { re: /\b(compar\w*|vs|versus|x|gastamos mais|diferenca)\b/, tools: ['comparar_meses', 'resumo_mes'] },
  { re: /\b(modalidade\w*|pilates|yoga|teatro|gr|ballet|jazz|danca|aula\w*)\b/, tools: ['entradas_modalidade_periodo', 'resumo_modalidades', 'alunos_por_modalidade'] },
  { re: /\b(pagou|pagamento\w*|pagar|recebe\w*|professor\w*|repasse\w*|deve|devendo)\b/, tools: ['movimentos_por_pessoa', 'saldo_aluno', 'busca_aluno', 'repasses_professores', 'saidas_planilha_controle'] },
  { re: /\b(r\$|\d+\s*reais|valor|pix de|\d{2,})\b|r\$/, tools: ['busca_por_valor', 'movimentos_banco_dia'] },
  { re: /\b(gast\w*|saida\w*|despesa\w*|custo\w*|maiores)\b/, tools: ['maiores_saidas', 'saidas_planilha_controle', 'resumo_categoria_extrato', 'resumo_mes'] },
  { re: /\b(alunos?|ativos?|matricul\w*|plano|preco|mensalidade\w*)\b/, tools: ['precos_planos', 'alunos_por_modalidade', 'resumo_planilha_fluxo', 'busca_aluno'] },
  { re: /\b(semana)\b/, tools: ['resumo_semana'] },
  { re: /\b(hoje|ontem|dia)\b/, tools: ['resumo_dia', 'pagamentos_fluxo_dia', 'movimentos_banco_dia'] },
  { re: /\b(atualizad\w*|extrato|banco|conciliac\w*|vinculo)\b/, tools: ['resumo_mes', 'sem_vinculo_validacao', 'pendentes_conciliacao'] },
  { re: /\b(categoria\w*)\b/, tools: ['resumo_categoria_extrato'] },
  { re: /\b(pix|cartao|dinheiro|meio)\b/, tools: ['resumo_meio_pagamento'] },
  { re: /\b(controle|planilha|sistema)\b/, tools: ['controle_oficial_vs_sistema', 'resumo_planilha_fluxo'] },
];

const PADRAO: ConsultaToolId[] = ['resumo_mes', 'resumo_periodo', 'balanco_meses', 'movimentos_por_pessoa'];

/** 3–6 ferramentas relevantes para a pergunta (inclui o histórico recente para perguntas encadeadas). */
export function selecionarToolsRelevantes(message: string, historico: string[] = [], min = 3, max = 6): ConsultaToolId[] {
  const sel: ConsultaToolId[] = [];
  const add = (t: ConsultaToolId) => {
    if (!sel.includes(t) && sel.length < max) sel.push(t);
  };
  const textos = [message, ...historico.slice(-2)].map(normRouter);
  for (const texto of textos) {
    for (const g of GRUPOS) if (g.re.test(texto)) g.tools.forEach(add);
  }
  for (const t of PADRAO) {
    if (sel.length >= min) break;
    add(t);
  }
  return sel;
}
