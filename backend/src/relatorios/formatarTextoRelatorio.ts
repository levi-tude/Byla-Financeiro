/**
 * Normaliza texto gerado por IA para exibição consistente (web/PDF/WhatsApp).
 */

const MAX_BLANK_LINES = 2;

export function formatarTextoRelatorio(texto: string, tipoRelatorio: string): string {
  if (!texto || typeof texto !== 'string') return texto;

  let t = texto.replace(/\r\n/g, '\n').trim();

  // Remove espaços em branco órfãos no fim de cada linha
  t = t
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');

  // Colapsa sequências excessivas de linhas em branco
  t = t.replace(/\n{3,}/g, '\n\n');

  // Se parecer truncado no meio de uma frase longa sem pontuação final
  const last = t.slice(-1);
  if (t.length > 800 && !/[.!?:)\]"']$/.test(last) && !t.endsWith('```')) {
    t += '\n\n_(Obs.: o texto pode ter sido cortado pelo limite de saída do modelo.)_';
  }

  // Limita linhas em branco consecutivas
  const parts = t.split('\n\n');
  const out: string[] = [];
  let blankRun = 0;
  for (const p of parts) {
    if (p.trim() === '') {
      blankRun++;
      if (blankRun <= MAX_BLANK_LINES) out.push('');
    } else {
      blankRun = 0;
      out.push(p);
    }
  }
  return out.filter((x, i) => !(x === '' && i > 0 && out[i - 1] === '')).join('\n\n').trim();
}
