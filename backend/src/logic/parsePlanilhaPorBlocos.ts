/**
 * Parser para abas com estrutura em blocos: linha de modalidade → linha de cabeçalhos → linhas de dados.
 * Usado em BYLA DANÇA, PILATES, TEATRO, YOGA, G.R., TEATRO INFANTIL.
 *
 * ## Detecção de ativo/inativo (sem limite fixo de linha)
 *
 * O parser detecta seções pelo **nome do bloco** (linha colorida de modalidade):
 *
 * - Seção `normal`      → aluno ativo, pagamentos sincronizados normalmente
 * - Seção `bolsas`      → bloco "PROGRAMA DE BOLSAS" — aluno marcado _secao='bolsas';
 *                         pagamentos são lidos mas descartados no sync (a aluna já aparece
 *                         nas modalidades normais). Serve para registrar metadata de desconto.
 * - Seção `capacitacao` → bloco "CURSO DE CAPACITAÇÃO" — tratado como modalidade normal,
 *                         mas com _secao='capacitacao' para a UI diferenciar visualmente.
 * - Seção `inativo`     → bloco explicitamente marcado "INATIVO", "INATIVOS", "HISTÓRICO",
 *                         "HISTORICO", "CANCELADO" etc. — aluno inativo.
 *
 * Dessa forma o parser se adapta automaticamente quando você adiciona linhas ou blocos
 * na planilha — sem precisar ajustar nenhum número.
 *
 * ## Fallback por número de linha (abas simples)
 *
 * Abas que ainda usam limite fixo (PILATES, TEATRO, etc.) mantêm compatibilidade via
 * `CONFIG_ABAS_BLOCOS`. O limite fixo só é usado quando nenhuma seção especial é detectada.
 */

export type SecaoBloco = 'normal' | 'bolsas' | 'capacitacao' | 'inativo';

export interface ConfigAbaBloco {
  /** Nome exato da aba. */
  nomeAba: string;
  /**
   * Linha máxima (1-based) até onde são alunos ativos — fallback para abas que não têm
   * blocos explícitos de "INATIVOS". Ignorado para abas que detectam seções automaticamente.
   * Use Number.MAX_SAFE_INTEGER para desabilitar.
   */
  linhaLimiteAtivos: number;
  /**
   * Se true, o parser usa detecção de seção automática pelo nome do bloco
   * e ignora linhaLimiteAtivos. Default: false.
   */
  deteccaoAutomatica?: boolean;
}

/** Configuração por aba. */
export const CONFIG_ABAS_BLOCOS: ConfigAbaBloco[] = [
  // Detecção automática: o parser lê os blocos "PROGRAMA DE BOLSAS", "CURSO DE CAPACITAÇÃO"
  // e "INATIVOS" diretamente do nome da seção — sem número de linha fixo.
  { nomeAba: 'BYLA DANÇA', linhaLimiteAtivos: Number.MAX_SAFE_INTEGER, deteccaoAutomatica: true },
  { nomeAba: 'PILATES', linhaLimiteAtivos: Number.MAX_SAFE_INTEGER, deteccaoAutomatica: true },
  { nomeAba: 'PILATES MARINA', linhaLimiteAtivos: Number.MAX_SAFE_INTEGER, deteccaoAutomatica: true },
  { nomeAba: 'TEATRO', linhaLimiteAtivos: Number.MAX_SAFE_INTEGER, deteccaoAutomatica: true },
  { nomeAba: 'YOGA', linhaLimiteAtivos: Number.MAX_SAFE_INTEGER, deteccaoAutomatica: true },
  { nomeAba: 'G.R.', linhaLimiteAtivos: Number.MAX_SAFE_INTEGER, deteccaoAutomatica: true },
  { nomeAba: 'TEATRO INFANTIL', linhaLimiteAtivos: Number.MAX_SAFE_INTEGER, deteccaoAutomatica: true },
];

// ---------------------------------------------------------------------------
// Helpers de detecção
// ---------------------------------------------------------------------------

const HEADER_ALUNO = 'ALUNO';
const HEADER_CLIENTE = 'CLIENTE';
const COLS_BLOCO = [
  'ALUNO', 'CLIENTE', 'WPP', 'RESPONSÁVEIS', 'RESPONSAVEIS', 'RESPONS.', 'PLANO', 'MATRICULA', 'MATRÍCULA',
  'FIM', 'VENC', 'VENC.', 'VALOR', 'PRÓ', 'OBS.', 'OBSERVAÇÕES', 'QTD', 'NOME', 'TELEFONE', 'DATA', 'STATUS',
  'DATA VENC', 'DATA VEN', 'DATA VENC.', 'VENCIMENTO', 'VEN',
];

const MODALIDADE_MARKERS = [
  'TURMA',
  'DANCA',
  'DANÇA',
  'BALLET',
  'HIP HOP',
  'JAZZ',
  'KPOP',
  'PROGRAMA DE BOLSAS',
  'PROGRAMA',
  'BOLSA',
  'CURSO DE CAPACITACAO',
  'CURSO DE CAPACITAÇÃO',
  'CAPACITACAO',
  'CAPACITAÇÃO',
  'INATIVOS',
  'INATIVO',
  'EX ALUNOS',
  'EX-ALUNOS',
  'HISTORICO',
  'HISTÓRICO',
];

/** Rótulos de seção que nunca são nome de aluno (ex.: linha "INATIVOS" sozinha). */
function isRotuloSecaoNaoAluno(nome: string): boolean {
  const n = norm(nome);
  return (
    n === 'INATIVOS' ||
    n === 'INATIVO' ||
    n === 'EX ALUNOS' ||
    n === 'EX-ALUNOS' ||
    n === 'EXALUNOS' ||
    n === 'HISTORICO' ||
    n === 'HISTÓRICO' ||
    n === 'CANCELADOS' ||
    n === 'DESLIGADOS'
  );
}

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .trim();
}

/**
 * Detecta a "seção" de um bloco a partir do nome da modalidade.
 * Retorna null para blocos normais (sem classificação especial).
 */
function detectarSecao(nomeBloco: string): SecaoBloco | null {
  const n = norm(nomeBloco);
  // Inativo / histórico — vem antes das outras para não confundir "HISTORICO JAZZ" com jazz normal
  if (
    n === 'INATIVOS' ||
    n === 'INATIVO' ||
    n.includes('HISTORICO') ||
    n.includes('CANCELADO') ||
    n.includes('DESLIGADO') ||
    n === 'EX-ALUNOS' ||
    n.includes('EX ALUNO')
  ) return 'inativo';

  // Programa de bolsas — só o bloco organizacional (não "Carolina Bolsa Provisória" etc.)
  if (
    n.includes('PROGRAMA DE BOLSAS') ||
    n.includes('PROGRAMA BOLSA') ||
    n === 'BOLSAS' ||
    n.startsWith('BOLSAS ')
  ) {
    return 'bolsas';
  }

  // Curso de capacitação / formação
  if (n.includes('CAPACITAC') || n.includes('CAPACITAÇ') || n.includes('FORMACAO') || n.includes('FORMAÇÃO') || n.includes('CURSO DE'))
    return 'capacitacao';

  return null;
}

/** Verifica se a linha parece ser a linha de cabeçalhos do bloco (contém ALUNO/CLIENTE e/ou WPP). */
function isHeaderRow(cells: string[]): boolean {
  const up = cells.slice(0, 12).map((c) => (c ?? '').toUpperCase().trim());
  const temAluno = up.some((c) => c === 'ALUNO' || c === 'ALUNO ' || c === 'CLIENTE' || c === 'NOME');
  const temWpp = up.some((c) => c === 'WPP' || c === 'TELEFONE' || c === 'WHATSAPP');
  if (temAluno && temWpp) return true;
  if (temAluno) return true;
  if (up[0] === HEADER_ALUNO || up[1] === HEADER_ALUNO || up[0] === HEADER_CLIENTE || up[1] === HEADER_CLIENTE) return true;
  return false;
}

/** Extrai nome da modalidade de uma linha (cabeçalho colorido do bloco). */
function extrairModalidade(linha: string[]): string {
  for (let i = 0; i < Math.min(linha.length, 4); i++) {
    const v = (linha[i] ?? '').trim();
    if (v && v.length > 2 && !COLS_BLOCO.includes(v.toUpperCase())) return v;
  }
  return '(modalidade)';
}

function pareceLinhaModalidade(cells: string[]): boolean {
  const first = (cells[0] ?? '').trim();
  if (!first || first.length < 4) return false;
  const normalized = norm(first);
  if (!MODALIDADE_MARKERS.some((m) => normalized.includes(m))) return false;

  // Linha de modalidade costuma ter só a primeira célula preenchida.
  const filled = cells.filter((c) => String(c ?? '').trim().length > 0).length;
  return filled <= 2;
}

/** Encontra a linha de modalidade: última linha não vazia antes do índice headerIdx. */
function modalidadeAntesDe(values: string[][], headerIdx: number): string {
  for (let r = headerIdx - 1; r >= 0; r--) {
    const row = values[r] ?? [];
    const first = (row[0] ?? row[2] ?? '').trim();
    if (first && first.length > 2 && !COLS_BLOCO.includes(first.toUpperCase())) {
      return extrairModalidade(row);
    }
  }
  return '(modalidade)';
}

/** Monta objeto da linha de dados usando os nomes do cabeçalho. */
function rowToObj(header: string[], cells: string[]): Record<string, string | number | boolean> {
  const obj: Record<string, string | number | boolean> = {};
  header.forEach((h, i) => {
    const v = cells[i] ?? '';
    obj[h.trim() || `col_${i}`] = v;
  });
  // Cabeçalho do bloco pode ser mais curto que a linha real (ex.: YOGA com vários blocos).
  // O extrator de pagamentos usa `col_${índice}` alinhado ao cabeçalho global DATA/FORMA/VALOR.
  for (let i = 0; i < cells.length; i++) {
    obj[`col_${i}`] = cells[i] ?? '';
  }
  return obj;
}

/**
 * Nome na coluna A ou na coluna do cabeçalho ALUNO/CLIENTE/NOME (API do Sheets pode devolver A vazio com merge).
 */
function extrairNomeAlunoNaLinha(headerAtual: string[], cells: string[]): string {
  const first = (cells[0] ?? '').trim();
  if (first) return first;

  for (let i = 0; i < Math.min(headerAtual.length, cells.length); i++) {
    const h = (headerAtual[i] ?? '').toUpperCase().trim();
    if (h === 'ALUNO' || h === 'NOME') {
      const v = (cells[i] ?? '').trim();
      if (v) return v;
    }
  }

  for (let i = 1; i < Math.min(cells.length, 12); i++) {
    const v = (cells[i] ?? '').trim();
    if (!v) continue;
    const u = v.toUpperCase();
    if (COLS_BLOCO.includes(u)) continue;
    if (v.length > 1 && !/^\d+$/.test(v)) return v;
  }
  return '';
}

/** Normaliza nome da coluna (RESPONS. → RESPONSÁVEIS, CLIENTE → ALUNO, etc.). */
function normalizarChave(k: string): string {
  const u = k.toUpperCase().trim();
  if (u === 'RESPONSAVEIS' || u === 'RESPONS.') return 'RESPONSÁVEIS';
  if (u === 'OBS.') return 'OBSERVAÇÕES';
  if (u === 'VENC.') return 'VENC';
  if (u.includes('DATA') && (u.includes('VENC') || u.includes('VEN'))) return 'DATA VENC';
  if (u === 'CLIENTE' || u === 'NOME') return 'ALUNO';
  if (u === 'MATRÍCULA') return 'MATRICULA';
  return k;
}

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface LinhaParseada {
  row: Record<string, string | number | boolean>;
  modalidade: string;
  linha1Based: number;
  ativo: boolean;
  /** Seção detectada automaticamente. Presente apenas quando deteccaoAutomatica=true. */
  secao?: SecaoBloco;
}

// ---------------------------------------------------------------------------
// Parser principal
// ---------------------------------------------------------------------------

/**
 * Parseia valores brutos de uma aba com estrutura em blocos.
 * Retorna linhas com _aba, _modalidade, _linha, _ativo, _secao e colunas do bloco.
 *
 * Quando deteccaoAutomatica=true (ex.: BYLA DANÇA), o campo _ativo é derivado da seção
 * detectada pelo nome do bloco — não pelo número de linha.
 */
export function parsearAbaEmBlocos(
  values: string[][],
  nomeAba: string,
  linhaLimiteAtivos: number,
  deteccaoAutomatica = false,
): LinhaParseada[] {
  const resultado: LinhaParseada[] = [];
  let modalidadeAtual = '(modalidade)';
  let secaoAtual: SecaoBloco = 'normal';
  let headerAtual: string[] = [];
  let linha1Based = 0;

  for (let r = 0; r < values.length; r++) {
    linha1Based = r + 1;
    const row = values[r] ?? [];
    const cells = row.map((c) => (c ?? '').toString().trim());

    if (isHeaderRow(cells)) {
      headerAtual = cells.map(normalizarChave);
      modalidadeAtual = modalidadeAntesDe(values, r);
      if (deteccaoAutomatica) {
        // Header sozinho não mantém seção anterior: se o bloco não for especial, volta a normal.
        secaoAtual = detectarSecao(modalidadeAtual) ?? 'normal';
      }
      continue;
    }

    if (pareceLinhaModalidade(cells)) {
      modalidadeAtual = extrairModalidade(cells);
      if (deteccaoAutomatica) {
        secaoAtual = detectarSecao(modalidadeAtual) ?? 'normal';
      }
      continue;
    }

    // Linha "INATIVOS" / "EX ALUNOS" etc. — muda seção e NÃO vira aluno.
    if (deteccaoAutomatica) {
      const firstCell = (cells[0] ?? '').trim();
      if (firstCell && isRotuloSecaoNaoAluno(firstCell)) {
        const filled = cells.filter((c) => String(c ?? '').trim().length > 0).length;
        if (filled <= 2) {
          secaoAtual = detectarSecao(firstCell) ?? 'inativo';
          continue;
        }
      }
    }

    if (headerAtual.length === 0) continue;

    const aluno = extrairNomeAlunoNaLinha(headerAtual, cells);
    if (!aluno) continue;
    if (isRotuloSecaoNaoAluno(aluno)) {
      if (deteccaoAutomatica) {
        secaoAtual = detectarSecao(aluno) ?? 'inativo';
      }
      continue;
    }
    if (aluno.trim().toUpperCase() === modalidadeAtual.trim().toUpperCase()) continue;
    if (COLS_BLOCO.includes(aluno.toUpperCase()) || aluno === 'Sub total' || aluno === 'Subtotal' || aluno === 'TOTAL') continue;

    const alunoUpper = norm(aluno);
    const linhaPareceModalidade =
      MODALIDADE_MARKERS.some((m) => alunoUpper.includes(m)) &&
      cells.filter((c) => String(c ?? '').trim().length > 0).length <= 2;
    if (linhaPareceModalidade) continue;

    // Determina ativo
    let ativo: boolean;
    if (deteccaoAutomatica) {
      ativo = secaoAtual !== 'inativo';
    } else {
      ativo = linha1Based <= linhaLimiteAtivos;
    }

    const obj = rowToObj(headerAtual, cells) as Record<string, string | number | boolean>;
    obj._aba = nomeAba;
    obj._modalidade = modalidadeAtual;
    obj._linha = linha1Based;
    obj._ativo = ativo;
    obj._secao = secaoAtual;
    if (!obj['nome']) {
      const nome = obj['ALUNO'] ?? obj['CLIENTE'] ?? obj['NOME'];
      if (nome) obj['nome'] = nome;
    }

    resultado.push({
      row: obj,
      modalidade: modalidadeAtual,
      linha1Based,
      ativo,
      secao: secaoAtual,
    });
  }

  return resultado;
}

export function getLimiteAtivosParaAba(nomeAba: string): number | null {
  const n = nomeAba.trim().toUpperCase();
  const found = CONFIG_ABAS_BLOCOS.find(
    (c) => c.nomeAba.toUpperCase() === n || n.includes(c.nomeAba.toUpperCase()),
  );
  return found ? found.linhaLimiteAtivos : null;
}

export function getDeteccaoAutomaticaParaAba(nomeAba: string): boolean {
  const n = nomeAba.trim().toUpperCase();
  const found = CONFIG_ABAS_BLOCOS.find(
    (c) => c.nomeAba.toUpperCase() === n || n.includes(c.nomeAba.toUpperCase()),
  );
  return found?.deteccaoAutomatica ?? false;
}
