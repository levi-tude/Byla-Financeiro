import { Router } from 'express';
import { PlanilhaRangeAdapter } from '../adapters/PlanilhaRangeAdapter.js';
import { SupabaseAlunosAdapter } from '../adapters/SupabaseAlunosAdapter.js';
import { PlanilhaAlunosAdapter } from '../adapters/PlanilhaAlunosAdapter.js';
import { SupabaseAtividadesAdapter } from '../adapters/SupabaseAtividadesAdapter.js';
import { SupabasePendenciasAdapter } from '../adapters/SupabasePendenciasAdapter.js';
import { PlanilhaFluxoAdapter } from '../adapters/PlanilhaFluxoAdapter.js';
import { CacheFluxoPlanilhaAdapter } from '../adapters/CacheFluxoPlanilhaAdapter.js';
import { GetAlunosCompletoUseCase } from '../useCases/GetAlunosCompletoUseCase.js';
import { GetModalidadesCompletoUseCase } from '../useCases/GetModalidadesCompletoUseCase.js';
import { GetPendenciasCompletoUseCase } from '../useCases/GetPendenciasCompletoUseCase.js';
import { GetFluxoCompletoUseCase } from '../useCases/GetFluxoCompletoUseCase.js';
import calendarioRoutes from './calendario.js';
import conciliacaoRoutes from './conciliacao.js';
import { createRelatoriosRouter } from './relatorios.js';
import planilhaFluxoBylaRoutes from './planilhaFluxoByla.js';
import fontesRoutes from './fontes.js';
import transacoesRoutes from './transacoes.js';
import despesasRoutes from './despesas.js';
import categoriasBancoRoutes from './categoriasBanco.js';
import entidadesBylaRoutes from './entidadesByla.js';
import { createSaidasPainelRouter } from './saidasPainel.js';
import { createCadastroCompletoRouter } from './cadastroCompleto.js';
import planilhaEntradaSaidaRoutes from './planilhaEntradaSaida.js';

const router = Router();

router.use(calendarioRoutes);
router.use(conciliacaoRoutes);

const planilhaRange = new PlanilhaRangeAdapter();
const alunosUseCase = new GetAlunosCompletoUseCase(
  new SupabaseAlunosAdapter(),
  new PlanilhaAlunosAdapter()
);
const modalidadesUseCase = new GetModalidadesCompletoUseCase(
  new SupabaseAtividadesAdapter(),
  planilhaRange
);
const pendenciasUseCase = new GetPendenciasCompletoUseCase(
  new SupabasePendenciasAdapter(),
  planilhaRange
);
const fluxoUseCase = new GetFluxoCompletoUseCase(
  new CacheFluxoPlanilhaAdapter(new PlanilhaFluxoAdapter())
);

router.use(createRelatoriosRouter(fluxoUseCase));
router.use(planilhaFluxoBylaRoutes);
router.use(fontesRoutes);
router.use(transacoesRoutes);
router.use(planilhaEntradaSaidaRoutes);
router.use(despesasRoutes);
router.use(categoriasBancoRoutes);
router.use(entidadesBylaRoutes);
router.use(createSaidasPainelRouter(fluxoUseCase));
router.use(
  createCadastroCompletoRouter({
    alunosUseCase,
    modalidadesUseCase,
    pendenciasUseCase,
    fluxoUseCase,
  })
);

export default router;
