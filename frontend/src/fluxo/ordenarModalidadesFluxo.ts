/**
 * Ordenação de modalidades no Fluxo: capacitação no final; programa de bolsas fora da lista.
 */

function norm(s: string): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase();
}

export function isModalidadeCapacitacao(nome: string): boolean {
  const n = norm(nome);
  return n.includes('CAPACITAC') || n.includes('CURSO DE CAPACIT');
}

export function isModalidadeProgramaBolsas(nome: string): boolean {
  const n = norm(nome);
  if (n.includes('PROGRAMA DE BOLSAS') || n.includes('PROGRAMA BOLSA')) return true;
  return n === 'BOLSAS' || n.startsWith('BOLSAS ') || (n.includes('PROGRAMA') && n.includes('BOLSA'));
}

/** Remove o bloco Programa de Bolsas da lista de modalidades do Fluxo. */
export function filtrarModalidadesFluxo(modalidades: string[]): string[] {
  return modalidades.filter((m) => !isModalidadeProgramaBolsas(m));
}

/**
 * Ordena modalidades: alfabética, com capacitação(ões) sempre no final.
 * Entre capacitação: alfabética.
 */
export function ordenarModalidadesFluxo(modalidades: string[]): string[] {
  const unicas = [...new Set(modalidades)];
  const semBolsas = filtrarModalidadesFluxo(unicas);
  const normais = semBolsas.filter((m) => !isModalidadeCapacitacao(m));
  const caps = semBolsas.filter((m) => isModalidadeCapacitacao(m));
  const cmp = (a: string, b: string) => a.localeCompare(b, 'pt-BR');
  return [...normais.sort(cmp), ...caps.sort(cmp)];
}
