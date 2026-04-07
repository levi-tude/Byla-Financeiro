/**
 * Parser para abas com estrutura em blocos: linha de modalidade → linha de cabeçalhos → linhas de dados.
 * Usado em BYLA DANÇA, PILATES MARINA, TEATRO, YOGA, G.R., TEATRO INFANTIL.
 * Inclui limite de linha para separar ativos (até linha N) de inativos (após linha N).
 */

export interface ConfigAbaBloco {
  /** Nome exato da aba (ou regex). */
  nomeAba: string;
  /** Linha máxima (1-based, Excel/Sheets) até onde são alunos ativos. Acima = inativos. */
  linhaLimiteAtivos: number;
}

/** Configuração por aba: limite de linha para ativos. Ordem pode importar. */
export const CONFIG_ABAS_BLOCOS: ConfigAbaBloco[] = [
  { nomeAba: 'BYLA DANÇA', linhaLimiteAtivos: 81 },
  // Nova aba PILATES (planilha FLUXO DE CAIXA BYLA). Ativos até a linha 33.
  { nomeAba: 'PILATES', linhaLimiteAtivos: 32 },
  // Mantido para compatibilidade com a aba antiga PILATES MARINA, se ainda existir na planilha.
  { nomeAba: 'PILATES MARINA', linhaLimiteAtivos: 32 },
  { nomeAba: 'TEATRO', linhaLimiteAtivos: 14 },
  /** Última linha (1-based) de alunos ativos; abaixo = inativos/histórico. 7 era insuficiente e ocultava alunos (ex.: pagamentos planilha). */
  { nomeAba: 'YOGA', linhaLimiteAtivos: 90 },
  { nomeAba: 'G.R.', linhaLimiteAtivos: 21 },
  { nomeAba: 'TEATRO INFANTIL', linhaLimiteAtivos: 7 },
];

const HEADER_ALUNO = 'ALUNO';
const HEADER_CLIENTE = 'CLIENTE';
const COLS_BLOCO = [
  'ALUNO', 'CLIENTE', 'WPP', 'RESPONSÁVEIS', 'RESPONSAVEIS', 'RESPONS.', 'PLANO', 'MATRICULA', 'MATRÍCULA',
  'FIM', 'VENC', 'VENC.', 'VALOR', 'PRÓ', 'OBS.', 'OBSERVAÇÕES', 'QTD', 'NOME', 'TELEFONE', 'DATA', 'STATUS',
  'DATA VENC', 'DATA VEN', 'DATA VENC.', 'VENCIMENTO', 'VEN',
];

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

export interface LinhaParseada {
  row: Record<string, string | number | boolean>;
  modalidade: string;
  linha1Based: number;
  ativo: boolean;
}

/**
 * Parseia valores brutos de uma aba com estrutura em blocos.
 * Retorna linhas com _aba, _modalidade, _linha, _ativo e colunas do bloco.
 */
export function parsearAbaEmBlocos(
  values: string[][],
  nomeAba: string,
  linhaLimiteAtivos: number
): LinhaParseada[] {
  const resultado: LinhaParseada[] = [];
  let modalidadeAtual = '(modalidade)';
  let headerAtual: string[] = [];
  let linha1Based = 0;

  for (let r = 0; r < values.length; r++) {
    linha1Based = r + 1;
    const row = values[r] ?? [];
    const cells = row.map((c) => (c ?? '').toString().trim());

    if (isHeaderRow(cells)) {
      headerAtual = cells.map(normalizarChave);
      modalidadeAtual = modalidadeAntesDe(values, r);
      continue;
    }

    if (headerAtual.length === 0) continue;

    const aluno = extrairNomeAlunoNaLinha(headerAtual, cells);
    if (!aluno) continue;
    if (COLS_BLOCO.includes(aluno.toUpperCase()) || aluno === 'Sub total' || aluno === 'Subtotal' || aluno === 'TOTAL') continue;

    const obj = rowToObj(headerAtual, cells) as Record<string, string | number | boolean>;
    obj._aba = nomeAba;
    obj._modalidade = modalidadeAtual;
    obj._linha = linha1Based;
    obj._ativo = linha1Based <= linhaLimiteAtivos;
    if (!obj['nome']) {
      const nome = obj['ALUNO'] ?? obj['CLIENTE'] ?? obj['NOME'];
      if (nome) obj['nome'] = nome;
    }

    resultado.push({
      row: obj,
      modalidade: modalidadeAtual,
      linha1Based,
      ativo: linha1Based <= linhaLimiteAtivos,
    });
  }

  return resultado;
}

export function getLimiteAtivosParaAba(nomeAba: string): number | null {
  const norm = nomeAba.trim().toUpperCase();
  const found = CONFIG_ABAS_BLOCOS.find(
    (c) => c.nomeAba.toUpperCase() === norm || norm.includes(c.nomeAba.toUpperCase())
  );
  return found ? found.linhaLimiteAtivos : null;
}
