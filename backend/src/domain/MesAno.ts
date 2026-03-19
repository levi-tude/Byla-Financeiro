/**
 * Value object: mês e ano de referência.
 * Domínio puro – sem dependências de framework ou infra.
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

const NOMES_MES_ABA: Record<number, string> = {
  1: 'JANEIRO', 2: 'FEVEREIRO', 3: 'MARÇO', 4: 'ABRIL', 5: 'MAIO', 6: 'JUNHO',
  7: 'JULHO', 8: 'AGOSTO', 9: 'SETEMBRO', 10: 'OUTUBRO', 11: 'NOVEMBRO', 12: 'DEZEMBRO',
};

/** Nome da aba (ex.: "MARÇO 26") para um dado mês/ano. */
export function nomeAbaControleDeCaixa({ mes, ano }: MesAno): string {
  const nomeMes = NOMES_MES_ABA[mes] ?? 'MARÇO';
  const anoCurto = String(ano).slice(-2);
  return `${nomeMes} ${anoCurto}`;
}

/**
 * Na planilha CONTROLE DE CAIXA, a aba do mês M contém os dados do mês M-1 (fechamento do caixa).
 * Ex.: aba "MARÇO 26" = dados de fevereiro/26. Retorna o MesAno da ABA a ler para ver o período (mes, ano).
 */
export function mesAnoParaAbaControleDeCaixa(mes: number, ano: number): MesAno {
  let mesAba = mes + 1;
  let anoAba = ano;
  if (mesAba > 12) {
    mesAba = 1;
    anoAba = ano + 1;
  }
  return { mes: mesAba, ano: anoAba };
}
