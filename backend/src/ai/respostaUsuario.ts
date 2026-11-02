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

/** "R$ 5 360,00" → "R$ 5.360,00"; "20 pagamento(s)"/"20 pagamento s" → "20 pagamentos". */
export function normalizarNumerosPlural(texto: string): string {
  return texto
    .replace(/R\$[\s\u00a0]?\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:,\d{2})?/g, (m) => {
      const [, num] = m.match(/^R\$[\s\u00a0]?(.*)$/)!;
      return `R$ ${num!.replace(/[ \u00a0\u202f](?=\d{3})/g, '.')}`;
    })
    .replace(/\b(\d+)\s+([a-zà-ú]+?)\s?\(s\)/gi, (_m, q: string, w: string) => `${q} ${Number(q) === 1 ? w : `${w}s`}`)
    .replace(/\b(\d+)\s+([a-zà-ú]+[aeo])\s(s)\b(?=[)\s.,;]|$)/gi, (_m, q: string, w: string) => `${q} ${Number(q) === 1 ? w : `${w}s`}`);
}

export function formatarRespostaUsuario(texto: string): string {
  let t = removerInstrucoesIa(texto);
  t = limparPiiUsuario(t);
  t = removerNomeDuplicado(t);
  t = normalizarNumerosPlural(t);
  t = t
    .replace(/NENHUM REGISTRO ENCONTRADO/g, 'Nenhum registro encontrado')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
  return t.trim();
}
