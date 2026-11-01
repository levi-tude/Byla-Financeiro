/** Passa o spec de um cartão do chat para a tela Criações da IA (mesma aba, sessionStorage). */
import type { CriacaoSpec } from './types';

const KEY = 'byla:criacao-do-chat';

export function guardarSpecDoChat(spec: CriacaoSpec): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(spec));
  } catch {
    /* sem storage: abre a tela vazia */
  }
}

/** Lê uma vez e apaga. Só aceita o formato básico do spec (o backend já validou ao gerar). */
export function lerSpecDoChat(): CriacaoSpec | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as CriacaoSpec;
    if (s?.versao !== 1 || !Array.isArray(s.secoes) || !Array.isArray(s.datasets)) return null;
    return s;
  } catch {
    return null;
  }
}
