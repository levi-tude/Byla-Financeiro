import { Router, type Request, type Response } from 'express';
import { carregarProgramaBolsas } from '../services/programaBolsasService.js';

const router = Router();

/** GET /api/programa-bolsas — lista do bloco Programa de Bolsas (BYLA DANÇA). */
router.get('/programa-bolsas', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await carregarProgramaBolsas();
    if (error) return res.status(502).json({ error });
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
