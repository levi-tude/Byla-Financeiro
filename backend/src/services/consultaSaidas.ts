/**
 * Saídas do extrato: maiores saídas do mês e saídas com professores.
 * Só leitura. Nomes sem documento (limparDocumentoPessoa).
 */
import { normalizeText } from '../logic/conciliacaoTexto.js';
import { limparDocumentoPessoa } from '../ai/pseudonimizacao.js';
import { instrucaoIa } from '../ai/instrucaoIa.js';
import type { MapeamentoPessoa } from './consultaMovimentosPessoa.js';

export type SaidaExtrato = { data: string; pessoa: string | null; valor: number; descricao?: string | null };

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const p2 = (n: number) => String(n).padStart(2, '0');
const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function agruparPorPessoa(saidas: SaidaExtrato[]) {
  const m = new Map<string, { nome: string; total: number; qtd: number }>();
  for (const s of saidas) {
    const nome = limparDocumentoPessoa(s.pessoa) || 'Sem identificação';
    const k = normalizeText(nome);
    const g = m.get(k) ?? { nome, total: 0, qtd: 0 };
    g.total += Math.abs(s.valor);
    g.qtd += 1;
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}

export function textoMaioresSaidas(saidas: SaidaExtrato[], mes: number, ano: number, topN = 10): string {
  const ref = `${p2(mes)}/${ano}`;
  if (!saidas.length) return `Não há saídas no extrato bancário em ${ref}.`;
  const total = saidas.reduce((a, s) => a + Math.abs(s.valor), 0);
  const grupos = agruparPorPessoa(saidas).slice(0, topN);
  const maiores = [...saidas].sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor)).slice(0, 5);
  return [
    `Maiores saídas de ${ref} (extrato bancário): total de saídas ${brl(total)} em ${saidas.length} lançamento(s).`,
    `Por destinatário (top ${grupos.length}):`,
    ...grupos.map((g, i) => `${i + 1}. ${g.nome}: ${brl(g.total)} (${g.qtd} lançamento(s))`),
    'Maiores lançamentos individuais:',
    ...maiores.map((s) => `- ${dataBr(s.data)} · ${limparDocumentoPessoa(s.pessoa) || 'Sem identificação'} · ${brl(Math.abs(s.valor))}`),
  ].join('\n');
}

const RE_PROFESSOR = /\b(professor|professora|professores|prof|instrutor|instrutora|repasse)\b/i;

export function ehMapeamentoProfessor(m: MapeamentoPessoa): boolean {
  return RE_PROFESSOR.test(normalizeText(`${m.categoria ?? ''} ${m.subcategoria ?? ''}`));
}

export function textoSaidasProfessores(
  saidas: SaidaExtrato[],
  maps: MapeamentoPessoa[],
  mes: number,
  ano: number,
): string {
  const ref = `${p2(mes)}/${ano}`;
  const profs = maps.filter(ehMapeamentoProfessor);
  const chaves = new Set(profs.map((m) => normalizeText(limparDocumentoPessoa(m.pessoa_normalizada))).filter(Boolean));
  const doProf = saidas.filter((s) => chaves.has(normalizeText(limparDocumentoPessoa(s.pessoa))));
  if (profs.length && doProf.length) {
    const total = doProf.reduce((a, s) => a + Math.abs(s.valor), 0);
    const grupos = agruparPorPessoa(doProf);
    return [
      `Gastos com professores em ${ref} (extrato bancário, pessoas mapeadas como professor/repasse): ${brl(total)} em ${doProf.length} lançamento(s).`,
      ...grupos.map((g) => `- ${g.nome}: ${brl(g.total)} (${g.qtd} lançamento(s))`),
      'Obs.: o extrato não tem categoria "professor"; o total considera só quem está no mapeamento pessoa→categoria.',
    ].join('\n');
  }
  const motivo = profs.length
    ? `Há ${profs.length} pessoa(s) mapeada(s) como professor/repasse, mas nenhuma saída delas em ${ref}.`
    : 'O extrato bancário não tem categoria "professor" e não há pessoas mapeadas como professor no mapeamento pessoa→categoria.';
  const linhas = [
    `Não consigo separar os gastos com professores em ${ref}: ${motivo}`,
    'Para ver o pagamento de um professor específico, pergunte pelo nome (ex.: "quanto paguei ao professor Fulano em setembro?").',
  ];
  if (saidas.length) {
    linhas.push('Para referência, as maiores saídas do mês por destinatário:');
    linhas.push(...agruparPorPessoa(saidas).slice(0, 5).map((g) => `- ${g.nome}: ${brl(g.total)}`));
  }
  linhas.push(instrucaoIa('Não invente total de professores; explique a limitação.'));
  return linhas.join('\n');
}
