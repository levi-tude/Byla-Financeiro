/**
 * Saneamento final de TODA resposta mostrada ao usuário (roteador, IA, fallback):
 * - remove instruções internas para o LLM;
 * - remove CPF/CNPJ (completos, parciais, mascarados, colados ao nome), telefone e e-mail;
 * - remove nome repetido em sequência ("FULANO DE TAL FULANO DE TAL" → "FULANO DE TAL");
 * - troca marcadores em caixa alta por texto humano.
 */
import { removerInstrucoesIa } from './instrucaoIa.js';
import { stripPii } from './consultaGeminiAgent.js';

/** Remove documentos/contatos do texto sem deixar marcadores "[cpf omitido]". */
export function limparPiiUsuario(texto: string): string {
  return stripPii(texto)
    .replace(/\s*\[(?:cpf|cnpj|doc) omitido\]/g, '')
    .replace(/\s*\[(?:email|telefone) omitido\]/g, '')
    .replace(/[ \t]{2,}/g, ' ');
}

/** "Fulano de Tal Fulano de Tal" → "Fulano de Tal" (2 a 6 palavras repetidas logo em seguida). */
export function removerNomeDuplicado(texto: string): string {
  let out = texto;
  for (let i = 0; i < 3; i++) {
    const novo = out.replace(/(?<![\p{L}])(\p{L}[\p{L}']*(?:\s+\p{L}[\p{L}']*){1,5})\s+\1(?![\p{L}])/giu, '$1');
    if (novo === out) break;
    out = novo;
  }
  return out;
}

export function formatarRespostaUsuario(texto: string): string {
  let t = removerInstrucoesIa(texto);
  t = limparPiiUsuario(t);
  t = removerNomeDuplicado(t);
  t = t
    .replace(/NENHUM REGISTRO ENCONTRADO/g, 'Nenhum registro encontrado')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
  return t.trim();
}
