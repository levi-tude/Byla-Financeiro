/**
 * repasses_professores: quanto foi repassado a cada professor no mês.
 * Fontes: bloco "Saídas Parceiros" do Controle de caixa + saídas do extrato bancário.
 * Quem é professor vem de `config/professoresByla.ts` (não do banco).
 */
import { normalizeText as normalizeTextUpper } from '../logic/conciliacaoTexto.js';

/** Minúsculas, sem acento/pontuação. */
const normalizeText = (s: string) => normalizeTextUpper(s).toLowerCase();
import { instrucaoIa } from '../ai/instrucaoIa.js';
import { REPASSES_GERAIS, FUNCIONARIOS_NAO_PROFESSORES, SOCIOS_PRIMEIRO_NOME, NAO_PROFESSORES_PRIMEIRO_NOME, PROFESSORES_BYLA, type ProfessorConfig } from '../config/professoresByla.js';
import type { SaidaExtrato } from './consultaSaidas.js';

export type LinhaParceiro = { label: string; valor: number | null };

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
const pad2 = (n: number) => String(n).padStart(2, '0');
const comeca = (nome: string, k: string) => nome === k || nome.startsWith(`${k} `);
const casaLista = (nome: string, ks: readonly string[]) => ks.some((k) => comeca(nome, k));

export function professorDaSaida(s: SaidaExtrato, lista: readonly ProfessorConfig[] = PROFESSORES_BYLA): ProfessorConfig | null {
  const nome = normalizeText(String(s.pessoa ?? ''));
  if (!nome || casaLista(nome, NAO_PROFESSORES_PRIMEIRO_NOME)) return null;
  return lista.find((p) => casaLista(nome, p.primeiroNomeExtrato)) ?? null;
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
  const papel = filtro && casaLista(filtro, SOCIOS_PRIMEIRO_NOME) ? 'sócio' : filtro && casaLista(filtro, FUNCIONARIOS_NAO_PROFESSORES) ? 'funcionário' : '';
  if (papel) {
    return [
      `${input.professor} não é professor (${papel}): não entra em repasses de professores.`,
      instrucaoIa('Para ver pagamentos a essa pessoa, sugira perguntar "quanto paguei a <nome> em <mês>" (movimentos por pessoa).'),
    ].join('\n');
  }
  const alvo = filtro
    ? lista.filter((p) => normalizeText(p.apelido) === filtro || normalizeText(p.atividade) === filtro || casaLista(filtro, p.primeiroNomeExtrato))
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
    const ctrl = input.controle?.filter((l) => p.linhaControle.some((k) => normalizeText(l.label) === k));
    const ctrlTxt =
      input.controle == null
        ? 'Controle indisponível'
        : ctrl && ctrl.length
          ? ctrl.some((l) => l.valor != null)
            ? `Controle ${brl(ctrl.reduce((a, l) => a + Number(l.valor ?? 0), 0))}`
            : 'Controle sem valor lançado'
          : 'sem linha no Controle';
    linhas.push(
      `${p.apelido} (${p.atividade}): extrato ${brl(ext)} em ${doExtrato.length} saída(s) · ${ctrlTxt}${p.confirmado ? ' · confirmado pelo Levi' : ' · identificação por inferência'}`,
    );
  }
  if (!filtro) {
    linhas.push(`Total no extrato (professores da lista): ${brl(totalExtrato)}.`);
    for (const g of REPASSES_GERAIS) {
      const doExt = input.saidas.filter((s) => casaLista(normalizeText(String(s.pessoa ?? '')), g.nomeExtrato));
      if (!doExt.length) continue;
      const v = doExt.reduce((a, s) => a + Math.abs(Number(s.valor)), 0);
      linhas.push(`${g.rotulo}: extrato ${brl(v)} em ${doExt.length} saída(s) · não é professor, fora do total acima.`);
    }
  }
  const outrasCtrl = (input.controle ?? []).filter(
    (l) => Number(l.valor ?? 0) !== 0 && !lista.some((p) => p.linhaControle.includes(normalizeText(l.label))),
  );
  if (!filtro && outrasCtrl.length) {
    linhas.push(
      `Outras linhas de "Saídas Parceiros" com professores não identificados: ${outrasCtrl.map((l) => `${l.label} ${brl(Number(l.valor))}`).join('; ')}.`,
    );
  }
  linhas.push(
    'Atenção: o Controle é por competência; o repasse pago no extrato em um mês costuma corresponder ao Controle do mês anterior (ex.: pago em setembro = Controle de agosto).',
  );
  linhas.push(instrucaoIa('Não some extrato com Controle. Sócios e funcionários não são professores. A linha Dança do Controle tem professores não identificados.'));
  return linhas.join('\n');
}
