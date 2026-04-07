import { getEntidadesByla, type EntidadeByla } from '../domain/funcionariosByla.js';
import { normalizeText } from './conciliacaoTexto.js';

/** Linha compatível com public.v_transacoes_export (campos usados na categorização). */
export type CategoriaExportInput = {
  id: string;
  data: string;
  tipo: string;
  pessoa: string;
  valor: number;
  descricao: string | null;
  categoria_sugerida: string | null;
  subcategoria_sugerida: string | null;
  modalidade: string | null;
  nome_aluno: string | null;
  origem_categoria: string | null;
};

/**
 * Classificação em 2 níveis + referência operacional.
 * `tipo_fluxo` (entrada/saída) vem do extrato (`transacoes.tipo`), não deste resultado.
 */
export type CategoriaExportResult = {
  referencia_negocio: string;
  categoria: string;
  subcategoria: string;
  origem_classificacao: string;
};

function haystack(pessoa: string, descricao: string | null): string {
  return normalizeText(`${pessoa} ${descricao ?? ''}`);
}

function safeText(v: string | null | undefined): string {
  return (v ?? '').trim();
}

function looksLikeMatricula(descricao: string | null): boolean {
  const d = (descricao ?? '').toLowerCase();
  return /\bmatr[ií]cula\b/.test(d) || /\bmatricul/.test(d);
}

function matchFuncionario(pessoa: string, descricao: string | null): EntidadeByla | null {
  const hay = haystack(pessoa, descricao);
  if (!hay) return null;
  for (const ent of getEntidadesByla()) {
    if (ent.subempresa) continue;
    const nomes = [ent.nome, ...ent.aliases].filter(Boolean);
    for (const n of nomes) {
      const nt = normalizeText(n);
      if (nt.length < 2) continue;
      if (hay.includes(nt)) return ent;
    }
  }
  return null;
}

type UtilMatch = { sub: string } | null;

/** Palavras-chave em texto normalizado (sem acentos, maiúsculas). */
function matchUtilidade(hay: string): UtilMatch {
  if (!hay) return null;
  if (hay.includes('SABESP') || hay.includes('CAGECE') || /\bAGUA\b/.test(hay) || hay.includes('FORNECIMENTO AGUA')) {
    return { sub: 'Água' };
  }
  if (hay.includes('CELPE') || hay.includes('CPFL') || hay.includes('ENEL') || /\bENERGIA\b/.test(hay) || hay.includes('COPEL')) {
    return { sub: 'Energia' };
  }
  if (hay.includes('OI ') || hay.includes('VIVO') || hay.includes('TIM ') || hay.includes('CLARO') || hay.includes('INTERNET')) {
    return { sub: 'Telecom / internet' };
  }
  if (hay.includes('CONDOMINIO') || hay.includes('CONDOM')) {
    return { sub: 'Condomínio' };
  }
  return null;
}

function matchDespesaAluguelInterno(hay: string): boolean {
  if (!hay) return false;
  if (hay.includes('ALUGUEL') && !hay.includes('BLEAD')) return true;
  return false;
}

/**
 * Precedência:
 * 1) mapeamento_manual
 * 2) match mensalidade/cadastro
 * 3) regras financeiras existentes (funcionário, utilidade, aluguel, coworking)
 * 4) fallback A classificar
 */
export function classificarTransacaoParaPlanilha(row: CategoriaExportInput): CategoriaExportResult {
  const origem = safeText(row.origem_categoria);
  const tipo = safeText(row.tipo).toLowerCase() === 'saida' ? 'saida' : 'entrada';
  const pessoa = safeText(row.pessoa);
  const modalidade = safeText(row.modalidade);
  const nomeAluno = safeText(row.nome_aluno);
  const catIn = safeText(row.categoria_sugerida);
  const subIn = safeText(row.subcategoria_sugerida);

  if (origem === 'mapeamento_manual') {
    return {
      referencia_negocio: nomeAluno || subIn || pessoa,
      categoria: catIn || 'A classificar',
      subcategoria: subIn,
      origem_classificacao: 'mapeamento_manual',
    };
  }

  if (origem === 'cadastro_mensalidade' && modalidade) {
    const matricula = looksLikeMatricula(row.descricao);
    return {
      referencia_negocio: nomeAluno || pessoa,
      categoria: 'Receita',
      subcategoria: matricula ? `Matrícula - ${modalidade}` : `Mensalidade - ${modalidade}`,
      origem_classificacao: matricula ? 'cadastro_mensalidade_matricula' : 'cadastro_mensalidade',
    };
  }

  const hay = haystack(row.pessoa, row.descricao);

  if (tipo === 'saida') {
    const func = matchFuncionario(row.pessoa, row.descricao);
    if (func) {
      return {
        referencia_negocio: func.nome,
        categoria: 'Despesa',
        subcategoria: 'Pagamento de professor/funcionário',
        origem_classificacao: 'match_funcionario_byla',
      };
    }

    const util = matchUtilidade(hay);
    if (util) {
      return {
        referencia_negocio: pessoa,
        categoria: 'Despesa',
        subcategoria: util.sub,
        origem_classificacao: 'keyword_utilidade',
      };
    }

    if (matchDespesaAluguelInterno(hay)) {
      return {
        referencia_negocio: pessoa,
        categoria: 'Despesa',
        subcategoria: 'Aluguel / estrutura',
        origem_classificacao: 'keyword_aluguel',
      };
    }

    if (catIn && catIn !== 'A classificar') {
      return {
        referencia_negocio: nomeAluno || pessoa,
        categoria: catIn,
        subcategoria: subIn,
        origem_classificacao: origem || 'view_export',
      };
    }

    return {
      referencia_negocio: nomeAluno || pessoa,
      categoria: 'A classificar',
      subcategoria: subIn || pessoa,
      origem_classificacao: 'fallback',
    };
  }

  if (hay.includes('COWORKING')) {
    return {
      referencia_negocio: nomeAluno || pessoa,
      categoria: 'Receita',
      subcategoria: subIn || 'Coworking',
      origem_classificacao: 'keyword_coworking',
    };
  }

  if (catIn && catIn !== 'A classificar') {
    return {
      referencia_negocio: nomeAluno || pessoa,
      categoria: catIn,
      subcategoria: subIn,
      origem_classificacao: origem || 'view_export',
    };
  }

  return {
    referencia_negocio: nomeAluno || pessoa,
    categoria: 'A classificar',
    subcategoria: subIn || pessoa,
    origem_classificacao: 'fallback',
  };
}
