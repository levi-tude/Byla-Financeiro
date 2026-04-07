import { Router, Request, Response } from 'express';
import { getSupabase } from '../services/supabaseClient.js';
import { readSheetRange } from '../services/sheetsService.js';
import { mergePriorizarPlanilha } from '../logic/merge.js';
import { config } from '../config.js';
import { GetAlunosCompletoUseCase } from '../useCases/GetAlunosCompletoUseCase.js';
import { GetModalidadesCompletoUseCase } from '../useCases/GetModalidadesCompletoUseCase.js';
import { GetPendenciasCompletoUseCase } from '../useCases/GetPendenciasCompletoUseCase.js';
import { GetFluxoCompletoUseCase } from '../useCases/GetFluxoCompletoUseCase.js';
import { fluxoCompletoQuerySchema, parseQuery } from '../validation/apiQuery.js';

export type CadastroCompletoDeps = {
  alunosUseCase: GetAlunosCompletoUseCase;
  modalidadesUseCase: GetModalidadesCompletoUseCase;
  pendenciasUseCase: GetPendenciasCompletoUseCase;
  fluxoUseCase: GetFluxoCompletoUseCase;
};

/**
 * Rotas: dados-completos, alunos/modalidades/pendencias/fluxo completo.
 */
export function createCadastroCompletoRouter(deps: CadastroCompletoDeps): Router {
  const { alunosUseCase, modalidadesUseCase, pendenciasUseCase, fluxoUseCase } = deps;
  const router = Router();

  /** GET /api/dados-completos – Fase 1: lê Supabase (atividades) + uma planilha e retorna JSON combinado. */
  router.get('/dados-completos', async (_req: Request, res: Response) => {
    try {
      const supabase = getSupabase();
      let supabaseData: unknown[] = [];
      if (supabase) {
        const { data, error } = await supabase.from('atividades').select('id, nome').order('nome');
        if (!error) supabaseData = data ?? [];
      }
      const range = process.env.GOOGLE_SHEETS_RANGE ?? 'Página1!A:Z';
      const { rows: planilhaRows, error: sheetError } = await readSheetRange(range);
      const regra = 'dados-completos: Supabase (atividades) + planilha (complemento). Regras em docs/REGRAS_FONTES_SUPABASE_PLANILHAS.md';
      const merged = mergePriorizarPlanilha(planilhaRows, supabaseData as Record<string, unknown>[], regra);
      res.json({
        supabase: supabaseData,
        planilha: planilhaRows,
        combinado: merged.combinado,
        regra_usada: merged.regra_usada,
        origem: merged.origem,
        sheet_error: sheetError ?? undefined,
      });
    } catch (e) {
      res.status(500).json({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  /** GET /api/alunos-completo – Caso de uso: alunos (planilha prevalece; todas as abas se configurado). */
  router.get('/alunos-completo', async (_req: Request, res: Response) => {
    try {
      const range = process.env.GOOGLE_SHEETS_ALUNOS_RANGE ?? process.env.GOOGLE_SHEETS_RANGE ?? 'ATENDIMENTOS!A:Z';
      const result = await alunosUseCase.execute(range, config.sheets.alunosTodasAbas);
      res.json(result);
    } catch (e) {
      res.status(500).json({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  /** GET /api/modalidades-completo – Caso de uso: modalidades (planilha prevalece). */
  router.get('/modalidades-completo', async (_req: Request, res: Response) => {
    try {
      const range = process.env.GOOGLE_SHEETS_MODALIDADES_RANGE ?? process.env.GOOGLE_SHEETS_RANGE ?? 'Modalidades!A:Z';
      const result = await modalidadesUseCase.execute(range);
      res.json(result);
    } catch (e) {
      res.status(500).json({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  /** GET /api/pendencias-completo – Caso de uso: pendências (planilha prevalece). */
  router.get('/pendencias-completo', async (_req: Request, res: Response) => {
    try {
      const range = process.env.GOOGLE_SHEETS_PENDENCIAS_RANGE ?? process.env.GOOGLE_SHEETS_RANGE ?? 'Pendencias!A:Z';
      const result = await pendenciasUseCase.execute(range);
      res.json(result);
    } catch (e) {
      res.status(500).json({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  /** GET /api/fluxo-completo – Caso de uso: totais planilha CONTROLE DE CAIXA (com cache TTL). ?mes=3&ano=2026 */
  router.get('/fluxo-completo', async (req: Request, res: Response) => {
    try {
      const fq = parseQuery(fluxoCompletoQuerySchema, req.query as Record<string, unknown>);
      if (!fq.ok) {
        return res.status(400).json({ error: fq.message });
      }
      const mes = fq.data.mes;
      const ano = fq.data.ano;
      const result = await fluxoUseCase.execute(mes, ano);
      res.json(result);
    } catch (e) {
      res.status(500).json({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  return router;
}
