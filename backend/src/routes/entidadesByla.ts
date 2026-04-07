import { Router, Request, Response } from 'express';
import { getEntidadesByla } from '../domain/funcionariosByla.js';
import { matchEntidadeBylaNaLinha } from '../logic/saidaPlanilhaFuncionarioMatch.js';

const router = Router();

const MAX_LINHAS = 500;

/** GET /api/entidades-byla — cadastro (pessoas + BylaDança) para o painel. */
router.get('/entidades-byla', (_req: Request, res: Response) => {
  res.json({ entidades: getEntidadesByla() });
});

/** POST /api/entidades-byla/match-linhas — body: { linhas: string[] } na mesma ordem das linhas exibidas. */
router.post('/entidades-byla/match-linhas', (req: Request, res: Response) => {
  const linhas = req.body?.linhas;
  if (!Array.isArray(linhas)) {
    return res.status(400).json({ error: 'Envie JSON com "linhas": string[]' });
  }
  if (linhas.length > MAX_LINHAS) {
    return res.status(400).json({ error: `No máximo ${MAX_LINHAS} linhas por requisição.` });
  }
  const resultados = linhas.map((raw) => {
    const texto = String(raw ?? '').slice(0, 4000);
    const m = matchEntidadeBylaNaLinha(texto);
    if (!m) return { texto, match: null as null };
    return {
      texto,
      match: {
        nome: m.entidade.nome,
        funcao: m.entidade.funcao,
        subempresa: Boolean(m.entidade.subempresa),
        via: m.via,
        categoriasSugeridas: m.entidade.categoriasSugeridas ?? null,
      },
    };
  });
  res.json({ resultados });
});

export default router;
