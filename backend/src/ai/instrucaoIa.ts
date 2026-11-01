/**
 * Marca de instrução interna para o LLM dentro do texto das tools.
 * Linhas com esta marca vão só para a IA; nunca aparecem para o usuário.
 */
export const MARCA_INSTRUCAO_IA = '⟦IA⟧ ';

export function instrucaoIa(texto: string): string {
  return `${MARCA_INSTRUCAO_IA}${texto}`;
}

/** Texto para o LLM: mantém a instrução, só tira a marca. */
export function textoParaLlm(texto: string): string {
  return texto.split(MARCA_INSTRUCAO_IA).join('');
}

/** Remove tudo da marca até o fim da linha. */
export function removerInstrucoesIa(texto: string): string {
  return texto
    .split('\n')
    .map((l) => {
      const i = l.indexOf(MARCA_INSTRUCAO_IA);
      return i < 0 ? l : l.slice(0, i).trimEnd();
    })
    .filter((l, i, arr) => l.trim() !== '' || (i > 0 && arr[i - 1]!.trim() !== ''))
    .join('\n')
    .trim();
}
