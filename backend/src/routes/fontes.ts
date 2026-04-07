import { Router, Request, Response } from 'express';
import { getSupabase } from '../services/supabaseClient.js';
import { readSheetRange, readSheetValues } from '../services/sheetsService.js';
import { config } from '../config.js';
import { rangeA1ProbeFromFullRange, rangeA1Quoted } from '../domain/MesAno.js';

const router = Router();

/** GET /api/fontes – Status das fontes de dados (Supabase + duas planilhas). Garante harmonia e visibilidade. */
router.get('/fontes', async (_req: Request, res: Response) => {
  try {
    const idPlanilha1 = config.sheets.spreadsheetId;
    const idPlanilha2 = config.sheets.fluxoSpreadsheetId;
    const rangePlanilha1 = process.env.GOOGLE_SHEETS_ALUNOS_RANGE ?? 'ATENDIMENTOS!A1';
    const rangePlanilha2 = config.sheets.fluxoRange?.trim()
      ? rangeA1ProbeFromFullRange(config.sheets.fluxoRange)
      : rangeA1Quoted('MARÇO 26', 'A1');

    let supabaseOk = false;
    const supabase = getSupabase();
    if (supabase) {
      const { error } = await supabase.from('alunos').select('id').limit(1);
      supabaseOk = !error;
    }

    let planilha1Ok = false;
    let planilha1Error: string | undefined;
    if (idPlanilha1) {
      const r = await readSheetRange(rangePlanilha1, idPlanilha1);
      planilha1Ok = !r.error;
      planilha1Error = r.error;
    }

    let planilha2Ok = false;
    let planilha2Error: string | undefined;
    if (idPlanilha2) {
      const r = await readSheetValues(`${rangePlanilha2}`, idPlanilha2);
      planilha2Ok = !r.error;
      planilha2Error = r.error;
    }

    res.json({
      supabase: {
        configurado: !!supabase,
        ok: supabaseOk,
        papel: 'Financeiro oficial (extrato, saldo) + fallback cadastro',
      },
      planilha1: {
        id: idPlanilha1 || null,
        nome: 'FLUXO DE CAIXA BYLA',
        configurado: !!idPlanilha1,
        ok: planilha1Ok,
        erro: planilha1Error,
        papel: 'Alunos, modalidades, pendências (aba ATENDIMENTOS e outras)',
      },
      planilha2: {
        id: idPlanilha2 || null,
        nome: 'CONTROLE DE CAIXA',
        configurado: !!idPlanilha2,
        ok: planilha2Ok,
        erro: planilha2Error,
        papel: 'Totais do mês (Entrada, Saída, Lucro por aba)',
      },
      harmonia: 'Todas as fontes usadas conforme docs/REGRAS_FONTES_SUPABASE_PLANILHAS.md e docs/BOUNDED_CONTEXTS_BYLA.md',
    });
  } catch (e) {
    res.status(500).json({
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

export default router;
