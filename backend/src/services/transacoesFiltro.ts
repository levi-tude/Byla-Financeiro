import { businessRules } from '../businessRules.js';

export type TransacaoBase = {
  id: string;
  data: string;
  pessoa: string;
  valor: number;
  descricao: string | null;
  tipo: string;
};

/**
 * Filtra transacoes aplicando regras de entradas externas (EA/Blead etc.)
 * e sua correspondente saida de repasse (Samuel) com tolerancia.
 */
export function filtrarTransacoesOficiais(todas: TransacaoBase[]): { entradas: TransacaoBase[]; saidas: TransacaoBase[] } {
  const idsParaIgnorar = new Set<string>();
  const externosPorData = new Map<string, { id: string; valor: number; usado: boolean }[]>();

  for (const r of todas) {
    const pessoa = (r.pessoa ?? '').toLowerCase().trim();
    const descricao = (r.descricao ?? '').toLowerCase().trim();
    const isExternal = businessRules.transacoes.externalEntryNames.some((entry) => {
      const entryLc = entry.toLowerCase();
      return pessoa.startsWith(entryLc) || descricao.includes(entryLc);
    });
    if (r.tipo === 'entrada' && isExternal) {
      const arr = externosPorData.get(r.data) ?? [];
      arr.push({ id: r.id, valor: Number(r.valor || 0), usado: false });
      externosPorData.set(r.data, arr);
      idsParaIgnorar.add(r.id);
    }
  }

  const TOLERANCIA = businessRules.transacoes.externalPairTolerance;
  for (const r of todas) {
    const pessoa = (r.pessoa ?? '').toLowerCase().trim();
    if (r.tipo !== 'saida') continue;
    if (!pessoa.startsWith(businessRules.transacoes.samuelNamePrefix)) continue;
    const arr = externosPorData.get(r.data);
    if (!arr || arr.length === 0) continue;
    const valorSaida = Number(r.valor || 0);
    for (const ext of arr) {
      if (ext.usado) continue;
      if (Math.abs(ext.valor - valorSaida) <= TOLERANCIA) {
        ext.usado = true;
        idsParaIgnorar.add(r.id);
        break;
      }
    }
  }

  /** Repasse Samuel ~5k: exclui saídas com esse nome na faixa, mesmo sem par com EA (fluxo Blead/externo). */
  const sam = businessRules.transacoes.samuelNamePrefix;
  const vmin = businessRules.transacoes.samuelRepasseValorMin;
  const vmax = businessRules.transacoes.samuelRepasseValorMax;
  for (const r of todas) {
    if (r.tipo !== 'saida') continue;
    const pessoa = (r.pessoa ?? '').toLowerCase().trim();
    if (!pessoa.startsWith(sam)) continue;
    const v = Math.abs(Number(r.valor || 0));
    if (v >= vmin && v <= vmax) idsParaIgnorar.add(r.id);
  }

  const entradas = todas.filter((r) => r.tipo === 'entrada' && !idsParaIgnorar.has(r.id));
  const saidas = todas.filter((r) => r.tipo === 'saida' && !idsParaIgnorar.has(r.id));
  return { entradas, saidas };
}

