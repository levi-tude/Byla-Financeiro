/**
 * Classifica saída do banco nas categorias da planilha CONTROLE DE CAIXA
 * (regras de negócio + match texto/valor).
 */

import type { EntidadeByla } from '../domain/funcionariosByla.js';
import { normalizeText } from './conciliacaoTexto.js';
import { sugerirCategoriaPlanilhaParaSaida, type SugestaoCategoriaPlanilha } from './saidaBancoCategoriaPlanilha.js';
import {
  matchPagadorABanco,
  encontrarLinhaPilatesMariControle,
  encontrarLinhaTeatroControleUnificada,
  type BlocoPagadorControle,
} from './pagadorControleIndice.js';
import { confiancaParaScore, melhorMatchControle } from './matchSaidaControle.js';

type LinhaPl = { titulo: string; label: string; valor: number };

export type RegraClassificacaoSaida =
  | 'nome_na_planilha'
  | 'funcionario'
  | 'pagador_planilha_controle'
  | 'match_controle'
  | 'texto_planilha'
  | 'valor'
  | 'nenhuma';

export type ClassificacaoSaidaCompleta = SugestaoCategoriaPlanilha & {
  secao_planilha: string | null;
  detalhe: string | null;
  regra: RegraClassificacaoSaida;
};

function haystack(pessoa: string, descricao: string | null): string {
  return normalizeText(`${pessoa} ${descricao ?? ''}`);
}

function encontrarRotuloPlanilha(planilhaLinhas: LinhaPl[], pred: (label: string) => boolean): LinhaPl | null {
  for (const pl of planilhaLinhas) {
    if (pred(pl.label)) return pl;
  }
  return null;
}

/** Linha agregada "Funcionários" / salários — não usar quando existir linha com o nome da pessoa. */
function isLinhaAgregadoFuncionarios(label: string): boolean {
  const u = normalizeText(label);
  return u.includes('FUNCION') || u.includes('FUNCIONARIO');
}

function matchEntidadeEmTexto(ent: EntidadeByla, hay: string): boolean {
  if (ent.subempresa) return false;
  const nomes = [ent.nome, ...ent.aliases].filter(Boolean);
  for (const n of nomes) {
    const nt = normalizeText(n);
    if (nt.length < 2) continue;
    if (hay.includes(nt) || nt.includes(hay.slice(0, Math.min(20, hay.length)))) return true;
  }
  return false;
}

/**
 * Regras fixas antes do match genérico por texto da planilha.
 */
export type OpcoesClassificacaoSaida = {
  /** PILATES + TEATRO (unificado) a partir da planilha de pagamentos; opcional para testes sem Google. */
  indicePagadorControle?: BlocoPagadorControle[];
};

export function classificarSaidaCompleta(
  pessoa: string,
  descricao: string | null,
  valor: number,
  planilhaLinhas: LinhaPl[],
  entidades: EntidadeByla[],
  opcoes?: OpcoesClassificacaoSaida,
): ClassificacaoSaidaCompleta {
  const hay = haystack(pessoa, descricao);
  if (!hay || planilhaLinhas.length === 0) {
    return {
      grupo_planilha: null,
      linha_planilha_ref: null,
      confianca: 'baixa',
      secao_planilha: null,
      detalhe: null,
      regra: 'nenhuma',
    };
  }

  const funcLinha = encontrarRotuloPlanilha(
    planilhaLinhas,
    (lb) => normalizeText(lb).includes('FUNCION') || normalizeText(lb).includes('FUNCIONARIO'),
  );

  for (const ent of entidades) {
    if (!matchEntidadeEmTexto(ent, hay)) continue;
    const linhaComNomeProprio = encontrarRotuloPlanilha(planilhaLinhas, (lb) => {
      if (isLinhaAgregadoFuncionarios(lb)) return false;
      const nl = normalizeText(lb);
      const nn = normalizeText(ent.nome);
      if (nn.length < 2) return false;
      if (nl.includes(nn)) return true;
      const tokens = nn.split(' ').filter((t) => t.length >= 3);
      return tokens.some((t) => nl.includes(t));
    });
    if (linhaComNomeProprio) {
      return {
        grupo_planilha: linhaComNomeProprio.titulo,
        linha_planilha_ref: linhaComNomeProprio.label,
        confianca: 'alta',
        secao_planilha: linhaComNomeProprio.titulo,
        detalhe: `Nome no CONTROLE: ${linhaComNomeProprio.label} · cadastro: ${ent.nome}`,
        regra: 'nome_na_planilha',
      };
    }
  }

  for (const ent of entidades) {
    if (!matchEntidadeEmTexto(ent, hay)) continue;
    if (funcLinha) {
      return {
        grupo_planilha: funcLinha.titulo,
        linha_planilha_ref: funcLinha.label,
        confianca: 'alta',
        secao_planilha: funcLinha.titulo,
        detalhe: ent.nome,
        regra: 'funcionario',
      };
    }
    const fallback = encontrarRotuloPlanilha(planilhaLinhas, (lb) => normalizeText(lb).includes(ent.nome));
    if (fallback) {
      return {
        grupo_planilha: fallback.titulo,
        linha_planilha_ref: fallback.label,
        confianca: 'media',
        secao_planilha: fallback.titulo,
        detalhe: ent.nome,
        regra: 'funcionario',
      };
    }
  }

  const blocosPagador = opcoes?.indicePagadorControle;
  if (blocosPagador?.length) {
    for (const b of blocosPagador) {
      if (!matchPagadorABanco(b.nomes, pessoa, descricao)) continue;
      if (b.kind === 'pilates_mari') {
        const linhaP = encontrarLinhaPilatesMariControle(planilhaLinhas);
        if (linhaP) {
          return {
            grupo_planilha: linhaP.titulo,
            linha_planilha_ref: linhaP.label,
            confianca: 'alta',
            secao_planilha: linhaP.titulo,
            detalhe: `Pilates · ${b.aba}`,
            regra: 'pagador_planilha_controle',
          };
        }
      } else {
        const linhaT = encontrarLinhaTeatroControleUnificada(planilhaLinhas);
        if (linhaT) {
          return {
            grupo_planilha: linhaT.titulo,
            linha_planilha_ref: linhaT.label,
            confianca: 'alta',
            secao_planilha: linhaT.titulo,
            detalhe: `Teatro · ${b.aba}`,
            regra: 'pagador_planilha_controle',
          };
        }
      }
    }
  }

  const matchC = melhorMatchControle(planilhaLinhas, pessoa, descricao, valor, hay);
  if (matchC) {
    const amb = matchC.motivos.includes('ambiguo');
    const conf = confiancaParaScore(matchC.score, amb);
    const detalheParts = [`score ${matchC.score.toFixed(2)}`, ...matchC.motivos.filter((m) => m !== 'ambiguo')];
    return {
      grupo_planilha: matchC.linha.titulo,
      linha_planilha_ref: matchC.linha.label,
      confianca: conf,
      secao_planilha: matchC.linha.titulo,
      detalhe: detalheParts.join(' · '),
      regra: 'match_controle',
    };
  }

  const sug = sugerirCategoriaPlanilhaParaSaida(pessoa, descricao, valor, planilhaLinhas);
  let regraFallback: RegraClassificacaoSaida = 'texto_planilha';
  if (sug.confianca === 'baixa') regraFallback = 'nenhuma';
  else if (sug.confianca === 'media') regraFallback = 'valor';

  return {
    ...sug,
    secao_planilha: sug.grupo_planilha,
    detalhe: null,
    regra: regraFallback,
  };
}
