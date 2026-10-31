/**
 * repasses_professores: quanto foi repassado a cada professor no mês.
 * Fontes: bloco "Saídas Parceiros" do Controle de caixa + saídas do extrato bancário.
 * Quem é professor vem de `config/professoresByla.ts` (não do banco).
 */
import { normalizeText as normalizeTextUpper } from '../logic/conciliacaoTexto.js';

/** Minúsculas, sem acento/pontuação. */
const normalizeText = (s: string) => normalizeTextUpper(s).toLowerCase();
import { instrucaoIa } from '../ai/instrucaoIa.js';
import { NAO_PROFESSORES_PRIMEIRO_NOME, PROFESSORES_BYLA, type ProfessorConfig } from '../config/professoresByla.js';
import type { SaidaExtrato } from './consultaSaidas.js';

export type LinhaParceiro = { label: string; valor: number | null };

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
const pad2 = (n: number) => String(n).padStart(2, '0');
const primeiroNome = (p: string | null) => normalizeText(String(p ?? '')).split(/\s+/)[0] ?? '';

export function professorDaSaida(s: SaidaExtrato, lista: readonly ProfessorConfig[] = PROFESSORES_BYLA): ProfessorConfig | null {
  const pn = primeiroNome(s.pessoa);
  if (!pn || NAO_PROFESSORES_PRIMEIRO_NOME.includes(pn)) return null;
  return lista.find((p) => p.primeiroNomeExtrato.includes(pn)) ?? null;
}

export function textoRepassesProfessores(input: {
  mes: number;
  ano: number;
  professor?: string;
  saidas: SaidaExtrato[];
  /** null = Controle do mês indisponível. */
  controle: LinhaParceiro[] | null;
  lista?: readonly ProfessorConfig[];
}): string {
  const lista = input.lista ?? PROFESSORES_BYLA;
  const ref = `${pad2(input.mes)}/${input.ano}`;
  const filtro = input.professor ? normalizeText(input.professor) : '';
  if (filtro && NAO_PROFESSORES_PRIMEIRO_NOME.some((n) => filtro.split(/\s+/).includes(n))) {
    return [
      `${input.professor} não é professor (sócio): não entra em repasses de professores.`,
      instrucaoIa('Para ver pagamentos a essa pessoa, sugira perguntar "quanto paguei a <nome> em <mês>" (movimentos por pessoa).'),
    ].join('\n');
  }
  const alvo = filtro
    ? lista.filter((p) => normalizeText(p.apelido) === filtro || normalizeText(p.atividade) === filtro || p.primeiroNomeExtrato.includes(filtro.split(/\s+/)[0]!))
    : lista;
  if (filtro && alvo.length === 0) {
    return [
      `"${input.professor}" não está na lista de professores do sistema (${lista.map((p) => `${p.apelido}/${p.atividade}`).join(', ')}).`,
      instrucaoIa('Não invente repasse; diga que a pessoa não está cadastrada como professor.'),
    ].join('\n');
  }
  const linhas: string[] = [
    `Repasses a professores — ${ref}. Base: data do pagamento (extrato) e mês do Controle de caixa.`,
    'Fontes: bloco "Saídas Parceiros" do Controle de caixa e saídas do extrato bancário (não somadas entre si: são a mesma despesa vista em duas fontes).',
  ];
  let totalExtrato = 0;
  for (const p of alvo) {
    const doExtrato = input.saidas.filter((s) => professorDaSaida(s, lista) === p);
    const ext = doExtrato.reduce((a, s) => a + Math.abs(Number(s.valor)), 0);
    totalExtrato += ext;
    const ctrl = input.controle?.filter((l) => p.linhaControle.some((k) => normalizeText(l.label) === k || normalizeText(l.label).includes(k)));
    const ctrlTxt =
      input.controle == null
        ? 'Controle indisponível'
        : ctrl && ctrl.length
          ? ctrl.some((l) => l.valor != null)
            ? `Controle ${brl(ctrl.reduce((a, l) => a + Number(l.valor ?? 0), 0))}`
            : 'Controle sem valor lançado'
          : 'sem linha no Controle';
    linhas.push(
      `${p.apelido} (${p.atividade}): extrato ${brl(ext)} em ${doExtrato.length} saída(s) · ${ctrlTxt}${p.inferencia ? ' · identificação por inferência' : ''}`,
    );
  }
  if (!filtro) linhas.push(`Total no extrato (professores da lista): ${brl(totalExtrato)}.`);
  const outrasCtrl = (input.controle ?? []).filter(
    (l) => Number(l.valor ?? 0) !== 0 && !lista.some((p) => p.linhaControle.some((k) => normalizeText(l.label).includes(k))),
  );
  if (!filtro && outrasCtrl.length) {
    linhas.push(
      `Outras linhas de "Saídas Parceiros" sem professor identificado: ${outrasCtrl.map((l) => `${l.label} ${brl(Number(l.valor))}`).join('; ')}.`,
    );
  }
  linhas.push(instrucaoIa('Não some extrato com Controle. Sócios (ex.: Samuel) não são professores. Diga que a lista de professores é provisória.'));
  return linhas.join('\n');
}
