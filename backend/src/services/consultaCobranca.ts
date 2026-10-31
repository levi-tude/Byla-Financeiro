/**
 * Consultas de cobrança do chat (só leitura): quem não pagou, saldo do aluno e preços dos planos.
 * O status por mês vem de `calcularSituacaoAlunos` — o MESMO cálculo da tela Fluxo de caixa —
 * sobre os dados do banco (cadastro + pagamentos do Fluxo), sem ler o Google Sheets ao vivo.
 * Nunca devolve telefone, CPF, e-mail, responsável ou pagador.
 */
import { getSupabase } from './supabaseClient.js';
import { normalizeText as normalizeTextUpper } from '../logic/conciliacaoTexto.js';

/** Minúsculas, sem acento/pontuação. */
const normalizeText = (s: string) => normalizeTextUpper(s).toLowerCase();
import {
  calcularSituacaoAlunos,
  type AlunoFluxoStatusInput,
  type PagamentoFluxoStatusInput,
  type SituacaoAluno,
  type StatusCompetencia,
} from '../logic/fluxoStatusCompetencia.js';
import { limparDocumentoPessoa } from '../ai/pseudonimizacao.js';
import { instrucaoIa } from '../ai/instrucaoIa.js';
import { resolverRegimeCobranca } from '../logic/regimeCobrancaAluno.js';

export const PAGINA_QUEM_NAO_PAGOU = 40;

export const FONTE_COBRANCA =
  'Base: competência (mês a que o pagamento se refere, não a data em que foi pago). Fonte: cadastro e pagamentos do Fluxo de caixa no sistema (mesmo cálculo da tela Fluxo de caixa).';

export type CobrancaLoaders = {
  alunos: () => Promise<AlunoFluxoStatusInput[]>;
  pagamentos: (anos: number[]) => Promise<PagamentoFluxoStatusInput[]>;
  hoje?: () => { mes: number; ano: number };
};

export type PlanoPrecoRow = { atividade: string; plano: string; valor: number; ativo: boolean };
export type AlunoPrecoRow = {
  aba: string;
  modalidade: string;
  plano: string | null;
  valor_referencia: number | string | null;
  regime_cobranca: string | null;
};
export type PrecosLoaders = {
  planos: () => Promise<PlanoPrecoRow[]>;
  alunosAtivos: () => Promise<AlunoPrecoRow[]>;
};

type Pagina<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

async function lerTudo<T>(pagina: (de: number, ate: number) => Pagina<T>, max = 30000): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; de < max; de += 1000) {
    const { data, error } = await pagina(de, de + 999);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

function sb() {
  const s = getSupabase();
  if (!s) throw new Error('Supabase não configurado.');
  return s;
}

/** Só colunas necessárias (sem wpp, responsáveis, pagador). Mesmo filtro da tela: ativo = true. */
export const loadersCobrancaPadrao: CobrancaLoaders = {
  alunos: () =>
    lerTudo<AlunoFluxoStatusInput>((a, b) =>
      sb()
        .from('fluxo_alunos_operacionais')
        .select('aba, modalidade, linha_planilha, aluno_nome, plano, regime_cobranca, matricula, valor_referencia')
        .eq('ativo', true)
        .order('aba')
        .order('aluno_nome')
        .range(a, b) as unknown as Pagina<AlunoFluxoStatusInput>,
    ),
  pagamentos: (anos) =>
    lerTudo<PagamentoFluxoStatusInput>((a, b) =>
      sb()
        .from('fluxo_pagamentos_operacionais')
        .select('aba, modalidade, linha_planilha, aluno_nome, valor, mes_competencia, ano_competencia')
        .in('ano_competencia', anos)
        .order('id')
        .range(a, b) as unknown as Pagina<PagamentoFluxoStatusInput>,
    ),
};

export const loadersPrecosPadrao: PrecosLoaders = {
  planos: async () => {
    const { data, error } = await sb().from('planos').select('nome, valor_mensal, ativo, atividades(nome)').limit(2000);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => {
      const at = (r as { atividades?: { nome?: string } | Array<{ nome?: string }> | null }).atividades;
      const nomeAt = Array.isArray(at) ? at[0]?.nome : at?.nome;
      return { atividade: String(nomeAt ?? ''), plano: String(r.nome ?? ''), valor: Number(r.valor_mensal ?? 0), ativo: r.ativo !== false };
    });
  },
  alunosAtivos: () =>
    lerTudo<AlunoPrecoRow>((a, b) =>
      sb()
        .from('fluxo_alunos_operacionais')
        .select('aba, modalidade, plano, valor_referencia, regime_cobranca')
        .eq('ativo', true)
        .order('id')
        .range(a, b) as unknown as Pagina<AlunoPrecoRow>,
    ),
};

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function pad2(n: number) {
  return String(n).padStart(2, '0');
}
function hojeCivil() {
  const d = new Date();
  return { mes: d.getMonth() + 1, ano: d.getFullYear() };
}

/** Linha de cabeçalho importada da planilha ("(modalidade)") ou seção de inativos — não é aluno. */
function linhaNaoAluno(a: { modalidade: string; aluno_nome?: string }): boolean {
  const m = normalizeText(a.modalidade ?? '');
  return m === 'modalidade' || !String(a.aluno_nome ?? 'x').trim();
}

function casaModalidade(a: { aba: string; modalidade: string }, filtro?: string): boolean {
  if (!filtro) return true;
  const f = normalizeText(filtro);
  return normalizeText(a.aba).includes(f) || normalizeText(a.modalidade).includes(f);
}

function nomeAluno(a: AlunoFluxoStatusInput): string {
  return limparDocumentoPessoa(a.aluno_nome).trim();
}

function turma(s: SituacaoAluno): string {
  const mod = String(s.aluno.modalidade ?? '').trim();
  return mod && normalizeText(mod) !== normalizeText(s.aba) ? `${s.aba} / ${mod}` : s.aba;
}

const ORDEM: Partial<Record<StatusCompetencia, number>> = { pendente: 0, parcial: 1, sem_dado: 2, previsto: 3 };

/** quem_nao_pagou: lista completa e paginada (pendente, parcial, sem valor, previsto). */
export async function textoQuemNaoPagou(
  params: { mes: number; ano: number; modalidade?: string; pagina?: number },
  loaders: CobrancaLoaders = loadersCobrancaPadrao,
): Promise<string> {
  const { mes, ano } = params;
  const ref = (loaders.hoje ?? hojeCivil)();
  const filtro = params.modalidade?.trim() || undefined;
  const [alunosTodos, pagamentos] = await Promise.all([loaders.alunos(), loaders.pagamentos([ano])]);
  const alunos = alunosTodos.filter((a) => !linhaNaoAluno(a) && casaModalidade(a, filtro));
  const alvo = filtro ? ` — ${filtro}` : '';
  const head = `Quem não pagou — competência ${pad2(mes)}/${ano}${alvo}. ${FONTE_COBRANCA}`;
  if (alunos.length === 0) {
    return `${head}\nNENHUM ALUNO ATIVO encontrado${filtro ? ` para "${filtro}"` : ''} no cadastro do Fluxo.\n${instrucaoIa('Não diga que "todos pagaram" nem "ninguém deve": diga que não encontrou alunos com esse filtro.')}`;
  }
  const sit = calcularSituacaoAlunos(alunos, pagamentos, [{ mes, ano }], ref);
  const semCob = sit.filter((s) => s.semCobranca).length;
  const cob = sit.filter((s) => !s.semCobranca);
  const cont: Record<StatusCompetencia, number> = { pago: 0, parcial: 0, pendente: 0, sem_dado: 0, futuro: 0, previsto: 0 };
  for (const s of cob) cont[s.meses[0]!.status] += 1;

  const linhasResumo = [
    head,
    `Alunos ativos com cobrança: ${cob.length} (bolsa/exceção fora da conta: ${semCob}).`,
    `Pagos: ${cont.pago} · Parcial: ${cont.parcial} · Pendente: ${cont.pendente} · Sem pagamento e sem valor no cadastro: ${cont.sem_dado} · Previsto: ${cont.previsto}.`,
    'Pendente = sem pagamento lançado na competência. Previsto = plano de ciclo (ex.: semestral) cobre o mês, mas ainda não há lançamento; não é atraso confirmado.',
  ];
  if (cont.futuro > 0 && cont.futuro === cob.length) {
    return [...linhasResumo.slice(0, 2), `Competência futura (${pad2(mes)}/${ano}): ainda não há cobrança vencida.`].join('\n');
  }

  const abertos = cob
    .filter((s) => ['pendente', 'parcial', 'sem_dado', 'previsto'].includes(s.meses[0]!.status))
    .sort(
      (a, b) =>
        ORDEM[a.meses[0]!.status]! - ORDEM[b.meses[0]!.status]! ||
        a.aba.localeCompare(b.aba, 'pt-BR') ||
        nomeAluno(a.aluno).localeCompare(nomeAluno(b.aluno), 'pt-BR'),
    );
  if (abertos.length === 0) {
    return [...linhasResumo, `Todos os ${cob.length} aluno(s) com cobrança têm pagamento lançado na competência.`].join('\n');
  }
  const total = Math.max(1, Math.ceil(abertos.length / PAGINA_QUEM_NAO_PAGOU));
  const pagina = Math.min(total, Math.max(1, Math.trunc(params.pagina ?? 1) || 1));
  const fatia = abertos.slice((pagina - 1) * PAGINA_QUEM_NAO_PAGOU, pagina * PAGINA_QUEM_NAO_PAGOU);
  const rot: Record<string, string> = { pendente: 'PENDENTE', parcial: 'PARCIAL', sem_dado: 'SEM VALOR NO CADASTRO', previsto: 'PREVISTO' };
  const itens = fatia.map((s) => {
    const m = s.meses[0]!;
    const esp = m.valorEsperado != null ? brl(m.valorEsperado) : 'sem valor no cadastro';
    const extra = m.status === 'parcial' ? ` · pago ${brl(m.valorPago)} · falta ${brl(Math.max(0, (m.valorEsperado ?? 0) - m.valorPago))}` : '';
    return `${rot[m.status]}: ${nomeAluno(s.aluno)} (${turma(s)}) — esperado ${esp}${extra}`;
  });
  const rodape =
    total > 1
      ? [`Página ${pagina} de ${total} (${abertos.length} aluno(s) na lista).${pagina < total ? ` Peça "página ${pagina + 1}" para ver o resto.` : ''}`, instrucaoIa('A lista é paginada: não diga que são só estes; informe a página e o total.')]
      : [`Lista completa: ${abertos.length} aluno(s).`];
  return [...linhasResumo, ...itens, ...rodape].join('\n');
}

/** saldo_aluno: esperado × pago por mês e total em aberto (mesmo cálculo da tela). */
export async function textoSaldoAluno(
  params: { nome: string; mes: number; ano: number; meses?: number },
  loaders: CobrancaLoaders = loadersCobrancaPadrao,
): Promise<string> {
  const n = Math.min(12, Math.max(1, Math.trunc(params.meses ?? 6) || 6));
  const meses: Array<{ mes: number; ano: number }> = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(params.ano, params.mes - 1 - i, 1);
    meses.push({ mes: d.getMonth() + 1, ano: d.getFullYear() });
  }
  const anos = [...new Set(meses.map((m) => m.ano))];
  const ref = (loaders.hoje ?? hojeCivil)();
  const chave = normalizeText(params.nome);
  const alunos = (await loaders.alunos()).filter((a) => !linhaNaoAluno(a) && chave && normalizeText(a.aluno_nome).includes(chave));
  const periodo = `${pad2(meses[0]!.mes)}/${meses[0]!.ano} a ${pad2(params.mes)}/${params.ano}`;
  const head = `Saldo do aluno “${params.nome}” — ${periodo}. ${FONTE_COBRANCA}`;
  if (alunos.length === 0) {
    return `${head}\nNENHUM ALUNO ATIVO encontrado com esse nome no cadastro do Fluxo.\n${instrucaoIa('Não diga que a pessoa não deve nada: diga que não encontrou o aluno (pode ser professor/parceiro ou aluno inativo).')}`;
  }
  const pagamentos = await loaders.pagamentos(anos);
  const sit = calcularSituacaoAlunos(alunos.slice(0, 5), pagamentos, meses, ref);
  const linhas: string[] = [head];
  for (const s of sit) {
    linhas.push(`${nomeAluno(s.aluno)} (${turma(s)}) · plano ${s.aluno.plano?.trim() || 'não informado'}:`);
    if (s.semCobranca) {
      linhas.push(`  Regime ${s.regime === 'bolsa' ? 'bolsa' : 'exceção'}: sem cobrança obrigatória.`);
      continue;
    }
    let aberto = 0;
    let previsto = 0;
    for (const m of s.meses) {
      const esp = m.valorEsperado != null ? brl(m.valorEsperado) : 'sem valor';
      linhas.push(`  ${pad2(m.mes)}/${m.ano}: esperado ${esp} · pago ${brl(m.valorPago)} · ${m.status}`);
      const falta = Math.max(0, (m.valorEsperado ?? 0) - m.valorPago);
      if (m.status === 'pendente' || m.status === 'parcial') aberto += falta;
      if (m.status === 'previsto') previsto += falta;
    }
    linhas.push(`  Total em aberto (pendente + parcial): ${brl(aberto)}.${previsto > 0 ? ` Previsto pelo plano, ainda sem lançamento: ${brl(previsto)} (não somado).` : ''}`);
    if (s.meses.some((m) => m.status === 'sem_dado')) linhas.push('  Meses "sem_dado": sem valor de referência no cadastro; não dá para calcular o que falta.');
  }
  if (alunos.length > 5) linhas.push(`Há mais ${alunos.length - 5} aluno(s) com esse nome; refine o nome.`);
  return linhas.join('\n');
}

function freqDe(texto: string): number | null {
  const m = normalizeText(texto).match(/(\d)\s*x/);
  return m ? Number(m[1]) : null;
}
function tipoDe(texto: string): 'semestral' | 'trimestral' | 'mensal' | null {
  const t = normalizeText(texto);
  if (t.includes('semestr')) return 'semestral';
  if (t.includes('trimestr')) return 'trimestral';
  if (t.includes('mensal')) return 'mensal';
  return null;
}

/** precos_planos: tabela oficial `planos`; sem preço oficial (R$ 0) → valor praticado (não oficial). */
export async function textoPrecosPlanos(
  params: { modalidade?: string; frequencia?: string; tipo?: string },
  loaders: PrecosLoaders = loadersPrecosPadrao,
): Promise<string> {
  const filtroMod = params.modalidade?.trim() ? normalizeText(params.modalidade) : '';
  const freq = params.frequencia ? freqDe(params.frequencia.includes('x') ? params.frequencia : `${params.frequencia}x`) : null;
  const tipo = params.tipo ? tipoDe(params.tipo) : null;
  const casaPlano = (txt: string) => (freq == null || freqDe(txt) === freq) && (tipo == null || tipoDe(txt) === tipo);

  const planos = (await loaders.planos()).filter((p) => p.ativo && (!filtroMod || normalizeText(p.atividade).includes(filtroMod)));
  const oficiais = planos.filter((p) => p.valor > 0 && casaPlano(p.plano));
  const filtrosTxt = [params.modalidade, freq ? `${freq}x` : '', tipo ?? ''].filter(Boolean).join(', ');
  const linhas: string[] = [`Preços dos planos${filtrosTxt ? ` (${filtrosTxt})` : ''}.`];
  const comOficial = new Set(planos.filter((p) => p.valor > 0).map((p) => normalizeText(p.atividade)));

  if (oficiais.length) {
    linhas.push('Tabela oficial de planos do sistema (valor mensal):');
    const porAt = new Map<string, PlanoPrecoRow[]>();
    for (const p of oficiais) porAt.set(p.atividade, [...(porAt.get(p.atividade) ?? []), p]);
    for (const [at, ps] of porAt) {
      linhas.push(`${at}:`);
      for (const p of ps.sort((a, b) => a.plano.localeCompare(b.plano, 'pt-BR'))) linhas.push(`  ${p.plano}: ${brl(p.valor)}`);
    }
  }

  // Sem preço oficial: valor praticado pelos alunos ativos (só quando a atividade não tem tabela).
  const precisaPraticado = !oficiais.length || (!filtroMod && planos.some((p) => p.valor <= 0));
  if (precisaPraticado) {
    const alunos = (await loaders.alunosAtivos()).filter(
      (a) =>
        resolverRegimeCobranca({ regime_cobranca: a.regime_cobranca, plano: a.plano }) === 'normal' &&
        !linhaNaoAluno({ modalidade: a.modalidade, aluno_nome: 'x' }) &&
        a.valor_referencia != null &&
        Number(a.valor_referencia) > 0 &&
        (!filtroMod || normalizeText(a.aba).includes(filtroMod) || normalizeText(a.modalidade).includes(filtroMod)) &&
        !comOficial.has(normalizeText(a.aba)) &&
        ![...comOficial].some((c) => normalizeText(a.aba).includes(c)) &&
        casaPlano(a.plano ?? ''),
    );
    if (alunos.length) {
      linhas.push('VALOR PRATICADO pelos alunos ativos (NÃO é preço oficial; é o valor de referência cadastrado de cada aluno):');
      const grupos = new Map<string, number[]>();
      for (const a of alunos) {
        const k = `${a.aba.trim()} · ${(a.plano ?? 'plano não informado').trim().toLowerCase() || 'plano não informado'}`;
        grupos.set(k, [...(grupos.get(k) ?? []), Number(a.valor_referencia)]);
      }
      for (const [k, vs] of [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))) {
        const freqMap = new Map<number, number>();
        for (const v of vs) freqMap.set(v, (freqMap.get(v) ?? 0) + 1);
        const moda = [...freqMap.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0];
        const min = Math.min(...vs);
        const max = Math.max(...vs);
        linhas.push(`  ${k}: mais comum ${brl(moda)} (${vs.length} aluno(s)${min !== max ? `; de ${brl(min)} a ${brl(max)}` : ''})`);
      }
      linhas.push(instrucaoIa('Deixe claro que o valor praticado não é a tabela oficial de preços.'));
    } else if (!oficiais.length) {
      linhas.push('NENHUM PREÇO encontrado: não há tabela oficial nem valor de referência nos alunos ativos para esse filtro.');
      linhas.push(instrucaoIa('Não invente preço; sugira consultar a secretaria.'));
    }
  }
  return linhas.join('\n');
}
