import { Router, Request, Response } from 'express';
import { readSheetValues, readSheetValuesBySheetName, listSheetNames } from '../services/sheetsService.js';
import { parsearAbaEmBlocos, getLimiteAtivosParaAba } from '../logic/parsePlanilhaPorBlocos.js';
import { config } from '../config.js';
import { lerPagamentosPorAbaEAno } from '../services/planilhaPagamentos.js';
import { isEligibleSheet } from '../businessRules.js';

const router = Router();

/** Range A1: nome da aba com aspas se tiver espaço (ex.: 'PILATES MARINA'!A:Z). */
function rangeAba(nomeAba: string, cols: string): string {
  const precisaAspas = /[\s']/.test(nomeAba);
  const aba = precisaAspas ? `'${String(nomeAba).replace(/'/g, "''")}'` : nomeAba;
  return `${aba}!${cols}`;
}

/** GET /api/planilha-fluxo-byla/abas – Lista nomes das abas da planilha FLUXO DE CAIXA BYLA (para análise/config). */
router.get('/planilha-fluxo-byla/abas', async (_req: Request, res: Response) => {
  try {
    const id = config.sheets.spreadsheetId;
    if (!id) return res.status(400).json({ error: 'Planilha FLUXO BYLA não configurada' });
    const { names, error } = await listSheetNames(id);
    if (error) return res.status(502).json({ error, abas: [] });
    res.json({ abas: names });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/** GET /api/planilha-fluxo-byla/verificar-aba?aba=PILATES%20MARINA – Verifica leitura de uma aba (contagem, colunas, amostra). */
router.get('/planilha-fluxo-byla/verificar-aba', async (req: Request, res: Response) => {
  try {
    const id = config.sheets.spreadsheetId;
    const nomeAba = (req.query.aba as string)?.trim();
    if (!id) return res.status(400).json({ error: 'Planilha FLUXO BYLA não configurada' });
    if (!nomeAba) return res.status(400).json({ error: 'Query ?aba= obrigatória (ex.: aba=PILATES%20MARINA)' });

    let range = rangeAba(nomeAba, 'A:Z');
    let result = await readSheetValues(range, id);
    if (result.error) {
      result = await readSheetValuesBySheetName(nomeAba, id);
    }
    const { values, error } = result;
    if (error) return res.status(502).json({ aba: nomeAba, error, rowCount: 0, ativos: 0, inativos: 0, colunas: [], amostra: [] });

    const limite = getLimiteAtivosParaAba(nomeAba);
    if (limite != null) {
      const parseadas = parsearAbaEmBlocos(values, nomeAba, limite);
      const rows = parseadas.map((p) => p.row);
      const ativos = parseadas.filter((p) => p.ativo).length;
      const inativos = parseadas.filter((p) => !p.ativo).length;
      const colunas = rows.length > 0 ? Object.keys(rows[0]).filter((k) => !k.startsWith('_')) : [];
      const amostra = rows.slice(0, 10);
      return res.json({
        aba: nomeAba,
        rowCount: rows.length,
        ativos,
        inativos,
        linhaLimiteAtivos: limite,
        colunas,
        amostra,
      });
    }

    if (values.length < 2) return res.json({ aba: nomeAba, rowCount: 0, colunas: [], amostra: [] });
    const headers = (values[0] ?? []).map((h) => (h ?? '').trim() || 'col');
    const rowCount = values.length - 1;
    const amostra = values.slice(1, 6).map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = (row[i] ?? '').toString(); });
      return obj;
    });
    res.json({ aba: nomeAba, rowCount, colunas: headers, amostra });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/** GET /api/planilha-fluxo-byla/debug-cabecalho?aba=BYLA%20DANÇA – Preview do cabeçalho (primeiras linhas/colunas). */
router.get('/planilha-fluxo-byla/debug-cabecalho', async (req: Request, res: Response) => {
  try {
    const id = config.sheets.spreadsheetId;
    const nomeAba = (req.query.aba as string)?.trim();
    if (!id) return res.status(400).json({ error: 'Planilha FLUXO BYLA não configurada' });
    if (!nomeAba) return res.status(400).json({ error: 'Query ?aba= obrigatória (ex.: aba=BYLA%20DANÇA)' });

    const { values, error } = await readSheetValuesBySheetName(nomeAba, id);
    if (error) return res.status(502).json({ error });

    const headerPreview = (values ?? []).slice(0, 6).map((row, idx) => ({
      rowIndex: idx,
      cols: row.slice(0, 80),
    }));

    res.json({ aba: nomeAba, headerPreview });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/** GET /api/planilha-fluxo-byla/debug-linha-bruta?aba=BYLA%20DAN%C3%87A&linha=18&cols=A:ZZ */
router.get('/planilha-fluxo-byla/debug-linha-bruta', async (req: Request, res: Response) => {
  try {
    const id = config.sheets.spreadsheetId;
    const nomeAba = (req.query.aba as string)?.trim();
    const linha = Number(req.query.linha ?? 0);
    const cols = (req.query.cols as string)?.trim() || 'A:ZZ';
    if (!id) return res.status(400).json({ error: 'Planilha FLUXO BYLA não configurada' });
    if (!nomeAba) return res.status(400).json({ error: 'Query ?aba= obrigatória' });
    if (!Number.isFinite(linha) || linha < 1) return res.status(400).json({ error: 'Query ?linha= inválida' });

    const range = rangeAba(nomeAba, cols);
    const { values, error } = await readSheetValues(range, id);
    if (error) return res.status(502).json({ error });

    const idx = linha - 1;
    const row = values[idx] ?? [];
    const nonEmpty = row
      .map((v, i) => ({ i, v: (v ?? '').toString() }))
      .filter((x) => x.v.trim().length > 0);

    res.json({
      aba: nomeAba,
      linha,
      len: row.length,
      row,
      nonEmpty,
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/** GET /api/planilha-fluxo-byla/debug-range-completo?aba=BYLA%20DAN%C3%87A&cols=A:ZZ */
router.get('/planilha-fluxo-byla/debug-range-completo', async (req: Request, res: Response) => {
  try {
    const id = config.sheets.spreadsheetId;
    const nomeAba = (req.query.aba as string)?.trim();
    const cols = (req.query.cols as string)?.trim() || 'A:ZZ';
    if (!id) return res.status(400).json({ error: 'Planilha FLUXO BYLA não configurada' });
    if (!nomeAba) return res.status(400).json({ error: 'Query ?aba= obrigatória' });

    const range = rangeAba(nomeAba, cols);
    const { values, error } = await readSheetValues(range, id);
    if (error) return res.status(502).json({ error });

    res.json({
      aba: nomeAba,
      cols,
      rows: values.length,
      maxLen: values.reduce((m, r) => Math.max(m, r.length), 0),
      values,
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/** GET /api/planilha-fluxo-byla/pagamentos?aba=BYLA%20DANÇA&ano=2026 – Pagamentos (data/forma/valor) por aluno (parte direita da aba). */
router.get('/planilha-fluxo-byla/pagamentos', async (req: Request, res: Response) => {
  try {
    const aba = (req.query.aba as string)?.trim();
    const ano = parseInt(String(req.query.ano ?? ''), 10);
    if (!aba) return res.status(400).json({ error: 'Parâmetro ?aba= obrigatório.' });
    if (!ano || ano < 2000) return res.status(400).json({ error: 'Parâmetro ?ano= obrigatório (ex.: 2026).' });

    const { alunos, error } = await lerPagamentosPorAbaEAno(aba, ano);
    if (error) return res.json({ aba, ano, error, alunos: [] });
    res.json({ aba, ano, alunos });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/** GET /api/planilha-fluxo-byla/pagamentos-todas?ano=2026 – Pagamentos por todas as abas relevantes. */
router.get('/planilha-fluxo-byla/pagamentos-todas', async (req: Request, res: Response) => {
  try {
    const ano = parseInt(String(req.query.ano ?? ''), 10);
    if (!ano || ano < 2000) return res.status(400).json({ error: 'Parâmetro ?ano= obrigatório (ex.: 2026).' });

    const id = config.sheets.spreadsheetId;
    if (!id) return res.status(400).json({ error: 'Planilha FLUXO BYLA não configurada' });

    const { names, error } = await listSheetNames(id);
    if (error) return res.json({ ano, error, abas: [] });

    const resultados: { aba: string; ano: number; alunos: unknown[] }[] = [];
    for (const n of names) {
      if (!isEligibleSheet(n)) continue;

      const { alunos, error: errAba } = await lerPagamentosPorAbaEAno(n, ano);
      if (errAba) continue;
      resultados.push({ aba: n, ano, alunos });
    }

    res.json({ ano, abas: resultados });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
