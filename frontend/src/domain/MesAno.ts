/**
 * Value object: mês e ano de referência.
 * Alinhado ao domínio do backend; sem dependências de React ou API.
 */

export interface MesAno {
  mes: number;
  ano: number;
}

export function criarMesAno(mes: number, ano: number): MesAno {
  if (mes < 1 || mes > 12) throw new Error('Mês inválido');
  return { mes, ano };
}

export function mesAnoAnterior({ mes, ano }: MesAno): MesAno {
  if (mes <= 1) return { mes: 12, ano: ano - 1 };
  return { mes: mes - 1, ano };
}
