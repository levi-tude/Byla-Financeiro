import { Router } from 'express';
import { PlanilhaRangeAdapter } from '../adapters/PlanilhaRangeAdapter.js';
import { SupabaseAlunosAdapter } from '../adapters/SupabaseAlunosAdapter.js';
import { PlanilhaAlunosAdapter } from '../adapters/PlanilhaAlunosAdapter.js';
import { SupabaseAtividadesAdapter } from '../adapters/SupabaseAtividadesAdapter.js';
import { SupabasePendenciasAdapter } from '../adapters/SupabasePendenciasAdapter.js';
import { PlanilhaFluxoAdapter } from '../adapters/PlanilhaFluxoAdapter.js';
import { CacheFluxoPlanilhaAdapter } from '../adapters/CacheFluxoPlanilhaAdapter.js';
import { SupabaseFluxoAdapter } from '../adapters/SupabaseFluxoAdapter.js';
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
import { attachAuthUser, requireRoles } from '../middleware/auth.js';
import { getSupabase } from '../services/supabaseClient.js';
import { isEligibleSheet } from '../businessRules.js';
import { lerPagamentosPorAbaEAno } from '../services/planilhaPagamentos.js';
import createControleCaixaRouter from './controleCaixa.js';
import createFluxoOperacionalRouter from './fluxoOperacional.js';

const router = Router();

router.use(attachAuthUser);

// Rotas operacionais (secretária e admin)
router.use(
  ['/alunos-completo', '/modalidades-completo', '/pendencias-completo', '/fluxo-completo', '/fluxo-operacional', '/planilha-fluxo-byla/pagamentos', '/planilha-fluxo-byla/pagamentos-todas', '/validacao-pagamentos-diaria'],
  requireRoles(['secretaria', 'admin'])
);

// Rotas financeiras e administrativas (apenas admin)
router.use(
  [
    '/calendario-financeiro',
    '/validacao-vinculos',
    '/conciliacao-vencimentos',
    '/fontes',
    '/transacoes',
    '/planilha-entrada-saida',
    '/despesas',
    '/saidas',
    '/categorias-banco',
    '/entidades-byla',
    '/relatorios',
    '/saidas/painel',
    '/dados-completos',
    '/planilha-fluxo-byla/abas',
    '/planilha-fluxo-byla/verificar-aba',
    '/planilha-fluxo-byla/debug-cabecalho',
    '/planilha-fluxo-byla/debug-linha-bruta',
    '/planilha-fluxo-byla/debug-range-completo',
    '/controle-caixa',
    '/migracao/fluxo/conferencia',
  ],
  requireRoles(['admin'])
);

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
  new SupabaseFluxoAdapter(new CacheFluxoPlanilhaAdapter(new PlanilhaFluxoAdapter()))
);

function norm(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
}

function pick(row: Record<string, unknown>, keys: string[]): string {
  const wanted = new Set(keys.map(norm));
  for (const [k, v] of Object.entries(row)) {
    if (wanted.has(norm(k))) return String(v ?? '').trim();
  }
  return '';
}

function resolveAlunoNome(row: Record<string, unknown>): string {
  const principal = String(row.nome ?? '').trim();
  if (principal) return principal;
  const alt = pick(row, ['ALUNO', 'CLIENTE', 'NOME']);
  if (alt) return alt;
  return String(row.col_0 ?? '').trim();
}

function normalizeIsoDate(iso: string): { date: string | null; corrected: boolean } {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return { date: null, corrected: false };
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return { date: null, corrected: false };
  if (month < 1 || month > 12) return { date: null, corrected: false };
  const lastDay = new Date(year, month, 0).getDate();
  if (day >= 1 && day <= lastDay) return { date: `${m[1]}-${m[2]}-${m[3]}`, corrected: false };
  const clamped = Math.min(Math.max(day, 1), lastDay);
  return { date: `${m[1]}-${m[2]}-${String(clamped).padStart(2, '0')}`, corrected: true };
}

function canonicalSheetName(name: string): string {
  const normalized = norm(name).replace(/\s+/g, ' ');
  if (normalized === 'pilates marina') return 'PILATES';
  return String(name ?? '').trim();
}

router.use(createRelatoriosRouter(fluxoUseCase));
router.use(planilhaFluxoBylaRoutes);
router.use(fontesRoutes);
router.use(transacoesRoutes);
router.use(planilhaEntradaSaidaRoutes);
router.use(createControleCaixaRouter());
router.use(createFluxoOperacionalRouter());
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

router.get('/migracao/fluxo/conferencia', async (req, res) => {
  const ano = Number(req.query.ano ?? new Date().getFullYear());
  if (!Number.isFinite(ano) || ano < 2000) {
    res.status(400).json({ error: 'Parâmetro ano inválido.' });
    return;
  }

  const planilhaAdapter = new PlanilhaAlunosAdapter();
  const all = await planilhaAdapter.listarTodasAbas();
  if (all.error) {
    res.status(502).json({ error: all.error });
    return;
  }

  const rows = (all.rows as Array<Record<string, unknown>>).filter((r) => {
    const aba = String(r._aba ?? '').trim();
    const aluno = resolveAlunoNome(r);
    return Boolean(aba && aluno);
  });

  const supabase = getSupabase();
  if (!supabase) {
    res.status(500).json({ error: 'Supabase não configurado no backend.' });
    return;
  }

  const { data: alunosDb, error: alunosErr } = await supabase.from('fluxo_alunos_operacionais').select('aba, modalidade');
  if (alunosErr) {
    res.status(500).json({ error: alunosErr.message });
    return;
  }

  let pagamentosPlanilha = 0;
  const errosPagamentos: string[] = [];
  const abasElegiveis = Array.from(
    new Set((all.abas ?? []).map((a) => canonicalSheetName(a)).filter((a) => isEligibleSheet(a)))
  );
  for (const aba of abasElegiveis) {
    const p = await lerPagamentosPorAbaEAno(aba, ano);
    if (p.error) {
      errosPagamentos.push(`${aba}: ${p.error}`);
      continue;
    }
    for (const al of p.alunos) {
      for (const pg of al.pagamentos) {
        const nd = normalizeIsoDate(pg.data);
        if (!nd.date) continue;
        pagamentosPlanilha += 1;
      }
    }
  }

  const { count: pagamentosBanco, error: pagErr } = await supabase
    .from('fluxo_pagamentos_operacionais')
    .select('*', { count: 'exact', head: true })
    .gte('data_pagamento', `${ano}-01-01`)
    .lte('data_pagamento', `${ano}-12-31`);
  if (pagErr) {
    res.status(500).json({ error: pagErr.message });
    return;
  }

  res.json({
    ok: rows.length === (alunosDb?.length ?? 0) && pagamentosPlanilha === (pagamentosBanco ?? 0) && errosPagamentos.length === 0,
    ano,
    alunos: {
      totalPlanilha: rows.length,
      totalBanco: alunosDb?.length ?? 0,
      delta: (alunosDb?.length ?? 0) - rows.length,
    },
    pagamentos: {
      totalPlanilha: pagamentosPlanilha,
      totalBanco: pagamentosBanco ?? 0,
      delta: (pagamentosBanco ?? 0) - pagamentosPlanilha,
      errosLeituraPlanilha: errosPagamentos,
    },
  });
});

export default router;
