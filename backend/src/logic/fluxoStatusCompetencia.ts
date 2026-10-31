/**
 * Status por competência de cada aluno do Fluxo de caixa (pago / parcial / pendente / previsto / futuro / sem_dado).
 * Fonte única do cálculo: usada pela tela Fluxo de caixa (`/fluxo-operacional/resumo-multi-mes`)
 * e pelas consultas do chat (`quem_nao_pagou`, `saldo_aluno`), para os dois darem o mesmo número.
 */
import { resolverRegimeCobranca } from './regimeCobrancaAluno.js';
import { competenciaNoCicloAtual } from './planoCicloPrevisto.js';

export type StatusCompetencia = 'pago' | 'parcial' | 'pendente' | 'sem_dado' | 'futuro' | 'previsto';

export function competenciaKeyFluxo(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

export function normalizarAbaFluxo(aba: string): string {
  const raw = String(aba ?? '').trim();
  const upper = raw
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase();
  if (upper === 'PILATES MARINA') return 'PILATES';
  return raw;
}

/** Chave aluno (aba normalizada + modalidade + linha + nome), igual à da tela. */
export function keyAlunoFluxo(aba: string, modalidade: string, linha: number, nome: string): string {
  return `${normalizarAbaFluxo(aba).trim().toLowerCase()}|${String(modalidade).trim().toLowerCase()}|${linha}|${String(nome).trim().toLowerCase()}`;
}

/** Regra de status de um mês (idêntica à tela). */
export function statusCompetenciaAluno(input: {
  semCobranca: boolean;
  pago: number;
  esperado: number | null;
  noCicloPrevisto: boolean;
  keyMes: string;
  mesAtualRealKey: string;
}): StatusCompetencia {
  const { semCobranca, pago, esperado, noCicloPrevisto, keyMes, mesAtualRealKey } = input;
  if (semCobranca) return 'sem_dado';
  if (pago > 0) {
    if (esperado == null) return 'pago';
    return pago < esperado ? 'parcial' : 'pago';
  }
  // Virtual: Previsto (plano) ≠ lançado.
  if (noCicloPrevisto) return 'previsto';
  if (keyMes > mesAtualRealKey) return 'futuro';
  if (esperado == null) return 'sem_dado';
  return 'pendente';
}

export type AlunoFluxoStatusInput = {
  aba: string;
  modalidade: string;
  linha_planilha: number;
  aluno_nome: string;
  plano: string | null;
  regime_cobranca: string | null;
  matricula: string | null;
  valor_referencia: number | string | null;
};

export type PagamentoFluxoStatusInput = {
  aba: string;
  modalidade: string;
  linha_planilha: number;
  aluno_nome: string;
  valor: number | string | null;
  mes_competencia: number | string | null;
  ano_competencia: number | string | null;
};

export type MesSituacao = {
  ano: number;
  mes: number;
  key: string;
  valorEsperado: number | null;
  valorPago: number;
  status: StatusCompetencia;
};

export type SituacaoAluno = {
  aluno: AlunoFluxoStatusInput;
  aba: string;
  regime: 'normal' | 'bolsa' | 'excecao';
  semCobranca: boolean;
  meses: MesSituacao[];
};

/**
 * Calcula a situação de cada aluno ativo nos meses pedidos, por COMPETÊNCIA
 * (soma dos pagamentos com mes/ano_competencia do mês).
 */
export function calcularSituacaoAlunos(
  alunos: AlunoFluxoStatusInput[],
  pagamentos: PagamentoFluxoStatusInput[],
  meses: Array<{ mes: number; ano: number }>,
  refCivil: { mes: number; ano: number },
): SituacaoAluno[] {
  const keys = new Set(meses.map((m) => competenciaKeyFluxo(m.ano, m.mes)));
  const pago = new Map<string, number>();
  for (const p of pagamentos) {
    const km = competenciaKeyFluxo(Number(p.ano_competencia), Number(p.mes_competencia));
    if (!keys.has(km)) continue;
    const k = `${keyAlunoFluxo(p.aba, p.modalidade, Number(p.linha_planilha), p.aluno_nome)}|${km}`;
    pago.set(k, (pago.get(k) ?? 0) + Number(p.valor ?? 0));
  }
  const mesAtualRealKey = competenciaKeyFluxo(refCivil.ano, refCivil.mes);
  return alunos.map((a) => {
    const ak = keyAlunoFluxo(a.aba, a.modalidade, Number(a.linha_planilha), a.aluno_nome);
    const regime = resolverRegimeCobranca({ regime_cobranca: a.regime_cobranca, plano: a.plano });
    const semCobranca = regime === 'bolsa' || regime === 'excecao';
    const esperado = a.valor_referencia != null && a.valor_referencia !== '' ? Number(a.valor_referencia) : null;
    return {
      aluno: a,
      aba: normalizarAbaFluxo(a.aba),
      regime,
      semCobranca,
      meses: meses.map((m) => {
        const key = competenciaKeyFluxo(m.ano, m.mes);
        const valorPago = pago.get(`${ak}|${key}`) ?? 0;
        const noCicloPrevisto =
          !semCobranca &&
          valorPago <= 0 &&
          competenciaNoCicloAtual({ matricula: a.matricula, plano: a.plano, referencia: refCivil, alvo: m });
        return {
          ano: m.ano,
          mes: m.mes,
          key,
          valorEsperado: esperado,
          valorPago,
          status: statusCompetenciaAluno({ semCobranca, pago: valorPago, esperado, noCicloPrevisto, keyMes: key, mesAtualRealKey }),
        };
      }),
    };
  });
}
