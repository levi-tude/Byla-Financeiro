import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getSupabase } from '../services/supabaseClient.js';
import { parseBody, parseQuery } from '../validation/apiQuery.js';
import { computeFluxoDivergencias } from '../services/fluxoOperacionalDivergencias.js';
import { isFluxoPrimaryForValidacao } from '../services/fluxoPrimarySource.js';
import { carregarIndiceValidacaoFluxoAno } from '../services/fluxoValidacaoPlanilhaItens.js';
import {
  agregarTotaisFluxoCompetencia,
  comparativoFluxoExtrato,
  enrichFluxoPagamentosComStatusExtrato,
  indexVinculosPorPlanilha,
  loadFluxoPagamentosCompetenciaMes,
  statusExtratoForFluxoPagamento,
} from '../services/fluxoExtratoValidacaoService.js';

const fluxoAlunosListQuerySchema = z.object({
  aba: z.string().trim().optional(),
  modalidade: z.string().trim().optional(),
  ativo: z
    .preprocess(
      (v) => (typeof v === 'string' ? v.toLowerCase() : v),
      z.enum(['true', 'false']).optional()
    )
    .optional(),
  q: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(5000).optional().default(2500),
});

const fluxoAlunoUpsertBodySchema = z.object({
  aba: z.string().trim().min(1).max(120),
  modalidade: z.string().trim().min(1).max(220),
  linhaPlanilha: z.number().int().min(1).optional(),
  alunoNome: z.string().trim().min(1).max(220),
  wpp: z.string().trim().max(120).nullable().optional(),
  responsaveis: z.string().trim().max(260).nullable().optional(),
  plano: z.string().trim().max(120).nullable().optional(),
  matricula: z.string().trim().max(120).nullable().optional(),
  fim: z.string().trim().max(120).nullable().optional(),
  venc: z.string().trim().max(120).nullable().optional(),
  valorReferencia: z.number().finite().nullable().optional(),
  pagadorPix: z.string().trim().max(220).nullable().optional(),
  observacoes: z.string().trim().max(500).nullable().optional(),
  ativo: z.boolean().optional().default(true),
});

const fluxoAlunoDeleteBodySchema = z.object({
  id: z.string().uuid(),
  force: z.boolean().optional().default(false),
});

/** Chaves alinhadas ao cálculo de pendências no frontend (`camposCadastroFaltantes`). */
const PENDENCIA_CAMPOS_IGNORAVEIS = [
  'wpp',
  'responsaveis',
  'venc',
  'valor_ref',
  'pagador_pix',
  'plano',
] as const;

type PendenciaCampoIgnoravel = (typeof PENDENCIA_CAMPOS_IGNORAVEIS)[number];

const pendenciaCampoIgnoravelZod = z.enum(PENDENCIA_CAMPOS_IGNORAVEIS);

const pendenciasIgnoradasPatchSchema = z.object({
  pendenciaCamposIgnorados: z.array(pendenciaCampoIgnoravelZod).max(12),
});

const alunoAtivoPatchSchema = z.object({
  ativo: z.boolean(),
});

const cobrancaTentativaBodySchema = z.object({
  nota: z.string().trim().min(1).max(500),
});

function parsePendenciaCamposIgnorados(v: unknown): PendenciaCampoIgnoravel[] {
  if (!Array.isArray(v)) return [];
  const allowed = new Set<string>(PENDENCIA_CAMPOS_IGNORAVEIS);
  const out: PendenciaCampoIgnoravel[] = [];
  for (const x of v) {
    const s = String(x).trim();
    if (allowed.has(s) && !(out as string[]).includes(s)) out.push(s as PendenciaCampoIgnoravel);
  }
  return out;
}

function parseCobrancaTentativasIn(v: unknown): { nota: string; registrado_em: string }[] {
  if (!Array.isArray(v)) return [];
  const out: { nota: string; registrado_em: string }[] = [];
  for (const x of v) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const nota = String(o.nota ?? '').trim();
    const registrado_em = String(o.registrado_em ?? o.em ?? '').trim();
    if (!nota || !registrado_em) continue;
    out.push({ nota, registrado_em });
  }
  return out.slice(-40);
}

const fluxoPagamentosListQuerySchema = z.object({
  ano: z.coerce.number().int().min(2000).max(2100).optional(),
  mes: z.coerce.number().int().min(1).max(12).optional(),
  aba: z.string().trim().optional(),
  modalidade: z.string().trim().optional(),
  aluno: z.string().trim().optional(),
  q: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional().default(300),
});

const fluxoResumoMultiMesQuerySchema = z.object({
  ano: z.coerce.number().int().min(2000).max(2100),
  mes: z.coerce.number().int().min(1).max(12),
  janela: z.coerce.number().int().min(2).max(12).optional().default(3),
  aba: z.string().trim().optional(),
  modalidade: z.string().trim().optional(),
  q: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(5000).optional().default(2500),
});

const fluxoPagamentoUpsertBodySchema = z.object({
  aba: z.string().trim().min(1).max(120),
  modalidade: z.string().trim().min(1).max(220),
  linhaPlanilha: z.number().int().min(1).optional(),
  ordemLancamento: z.number().int().min(1).optional().default(1),
  alunoNome: z.string().trim().min(1).max(220),
  dataPagamento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.'),
  forma: z.string().trim().max(120).nullable().optional(),
  valor: z.number().finite(),
  mesCompetencia: z.number().int().min(1).max(12),
  anoCompetencia: z.number().int().min(2000).max(2100),
  responsaveis: z.string().trim().max(260).nullable().optional(),
  pagadorPix: z.string().trim().max(220).nullable().optional(),
});

function toNullable(v?: string | null): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t ? t : null;
}

async function getNextLinhaPlanilha(supabase: NonNullable<ReturnType<typeof getSupabase>>, aba: string): Promise<number> {
  const { data, error } = await supabase
    .from('fluxo_alunos_operacionais')
    .select('linha_planilha')
    .eq('aba', aba)
    .order('linha_planilha', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const last = data?.linha_planilha != null ? Number(data.linha_planilha) : 0;
  return (Number.isFinite(last) ? last : 0) + 1;
}

async function resolveLinhaAlunoUpsert(params: {
  supabase: NonNullable<ReturnType<typeof getSupabase>>;
  payload: z.infer<typeof fluxoAlunoUpsertBodySchema>;
  existingId?: string | null;
}): Promise<number> {
  const { supabase, payload, existingId } = params;
  if (payload.linhaPlanilha != null) return payload.linhaPlanilha;
  if (existingId) {
    const { data, error } = await supabase
      .from('fluxo_alunos_operacionais')
      .select('linha_planilha')
      .eq('id', existingId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data?.linha_planilha != null) return Number(data.linha_planilha);
  }
  return getNextLinhaPlanilha(supabase, payload.aba);
}

async function resolveLinhaPagamentoUpsert(params: {
  supabase: NonNullable<ReturnType<typeof getSupabase>>;
  payload: z.infer<typeof fluxoPagamentoUpsertBodySchema>;
  existingId?: string | null;
}): Promise<number> {
  const { supabase, payload, existingId } = params;
  if (payload.linhaPlanilha != null) return payload.linhaPlanilha;
  if (existingId) {
    const { data, error } = await supabase
      .from('fluxo_pagamentos_operacionais')
      .select('linha_planilha')
      .eq('id', existingId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data?.linha_planilha != null) return Number(data.linha_planilha);
  }
  const { data: alunoMatch, error: alunoErr } = await supabase
    .from('fluxo_alunos_operacionais')
    .select('linha_planilha')
    .eq('aba', payload.aba)
    .eq('modalidade', payload.modalidade)
    .ilike('aluno_nome', payload.alunoNome)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (alunoErr) throw new Error(alunoErr.message);
  if (alunoMatch?.linha_planilha != null) return Number(alunoMatch.linha_planilha);
  return getNextLinhaPlanilha(supabase, payload.aba);
}

/** Chave estável para casar pagamento com linha do cadastro de aluno (aba + linha + nome). */
function alunoMatchKey(aba: string, linha: number, alunoNome: string): string {
  return `${String(aba).trim().toLowerCase()}|${Number(linha)}|${String(alunoNome).trim().toLowerCase()}`;
}

function normKey(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
}

function pickFromObject(row: Record<string, unknown>, wantedKeys: string[]): string {
  const wanted = new Set(wantedKeys.map((k) => normKey(k)));
  for (const [k, v] of Object.entries(row)) {
    if (wanted.has(normKey(k))) return String(v ?? '').trim();
  }
  return '';
}

function parseMoneyBr(v: string): number | null {
  const raw = (v ?? '').trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d,.\-]/g, '');
  if (!cleaned) return null;
  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  let normalized = cleaned;
  if (hasComma && hasDot) normalized = cleaned.replace(/\./g, '').replace(',', '.');
  else if (hasComma) normalized = cleaned.replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function competenciaKey(ano: number, mes: number): string {
  return `${ano}-${pad2(mes)}`;
}

function addMonths(baseAno: number, baseMes: number, delta: number): { ano: number; mes: number } {
  const dt = new Date(baseAno, baseMes - 1 + delta, 1);
  return { ano: dt.getFullYear(), mes: dt.getMonth() + 1 };
}

function normalizarAbaFluxo(aba: string): string {
  const raw = String(aba ?? '').trim();
  const upper = raw
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase();
  if (upper === 'PILATES MARINA') return 'PILATES';
  return raw;
}

/** Lê colunas comuns da planilha salvas em raw_row (quando a migração não preencheu o campo tipado). */
function extrairCamposPlanilhaDeRaw(raw: unknown): {
  valor: number | null;
  venc: string | null;
  responsaveis: string | null;
  pagador_pix: string | null;
} {
  if (!raw || typeof raw !== 'object') {
    return { valor: null, venc: null, responsaveis: null, pagador_pix: null };
  }
  const row = raw as Record<string, unknown>;
  const valorStr = pickFromObject(row, [
    'VALOR',
    'VALOR MENSAL',
    'MENSALIDADE',
    'MENSAL',
    'VLR',
    'VALOR R$',
    'VALORES',
    'VALOR MENSALIDADE',
  ]);
  const vencStr = pickFromObject(row, ['VENC', 'VENC.', 'DATA VENC', 'VENCIMENTO', 'DIA VENC']);
  const respStr = pickFromObject(row, ['RESPONSÁVEIS', 'RESPONSAVEIS', 'RESPONS.', 'RESP.']);
  const pixStr = pickFromObject(row, ['PRÓ', 'PRO', 'PAGADOR', 'PIX', 'PAGADOR PIX']);
  return {
    valor: parseMoneyBr(valorStr),
    venc: vencStr || null,
    responsaveis: respStr || null,
    pagador_pix: pixStr || null,
  };
}

async function logAuditoria(
  req: Request,
  params: {
    entidade: 'aluno' | 'pagamento';
    acao: 'create' | 'update' | 'delete';
    registroId?: string | null;
    aba?: string | null;
    modalidade?: string | null;
    alunoNome?: string | null;
    beforeData?: unknown;
    afterData?: unknown;
  }
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const auth = req.authUser;
  await supabase.from('fluxo_operacional_auditoria').insert({
    entidade: params.entidade,
    acao: params.acao,
    registro_id: params.registroId ?? null,
    aba: params.aba ?? null,
    modalidade: params.modalidade ?? null,
    aluno_nome: params.alunoNome ?? null,
    user_id: auth?.userId ?? null,
    user_email: auth?.email ?? null,
    user_role: auth?.role ?? null,
    before_data: params.beforeData ?? null,
    after_data: params.afterData ?? null,
  });
}

export default function createFluxoOperacionalRouter(): Router {
  const router = Router();

  router.get('/fluxo-operacional/alunos', async (req: Request, res: Response) => {
    const q = parseQuery(fluxoAlunosListQuerySchema, req.query as Record<string, unknown>);
    if (!q.ok) return res.status(400).json({ error: q.message });

    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Supabase não configurado no backend.' });

    let query = supabase
      .from('fluxo_alunos_operacionais')
      .select(
        'id, aba, modalidade, linha_planilha, aluno_nome, wpp, responsaveis, plano, matricula, fim, venc, valor_referencia, pagador_pix, observacoes, ativo, created_at, updated_at, raw_row, pendencia_campos_ignorados, cobranca_tentativas'
      )
      .order('aba', { ascending: true })
      .order('linha_planilha', { ascending: true })
      .limit(q.data.limit);

    if (q.data.aba) query = query.eq('aba', q.data.aba);
    if (q.data.modalidade) query = query.eq('modalidade', q.data.modalidade);
    if (q.data.ativo != null) query = query.eq('ativo', q.data.ativo === 'true');
    if (q.data.q) {
      const safe = q.data.q.replace(/[,%]/g, ' ');
      query = query.or(`aluno_nome.ilike.%${safe}%,responsaveis.ilike.%${safe}%,modalidade.ilike.%${safe}%`);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    const { data: pagRows, error: pagErr } = await supabase
      .from('fluxo_pagamentos_operacionais')
      .select('aba, linha_planilha, aluno_nome, valor, data_pagamento')
      .order('data_pagamento', { ascending: false })
      .limit(12000);
    if (pagErr) return res.status(500).json({ error: pagErr.message });

    const ultimoValorPorAluno = new Map<string, number>();
    for (const pr of pagRows ?? []) {
      const k = alunoMatchKey(String(pr.aba), Number(pr.linha_planilha), String(pr.aluno_nome));
      if (!ultimoValorPorAluno.has(k) && pr.valor != null) {
        ultimoValorPorAluno.set(k, Number(pr.valor));
      }
    }

    const { data: metaAlunosFiltros, error: metaErr } = await supabase
      .from('fluxo_alunos_operacionais')
      .select('aba, modalidade')
      .limit(8000);
    if (metaErr) return res.status(500).json({ error: metaErr.message });

    const itens = (data ?? []).map((row) => {
      const raw = extrairCamposPlanilhaDeRaw(row.raw_row);
      const k = alunoMatchKey(String(row.aba), Number(row.linha_planilha), String(row.aluno_nome));
      const valorCadastro = row.valor_referencia != null ? Number(row.valor_referencia) : null;
      const valorRaw = raw.valor;
      const valorUltimoPag = ultimoValorPorAluno.get(k) ?? null;
      const valor_mensal_exibicao: number | null = valorCadastro ?? valorRaw ?? valorUltimoPag ?? null;
      let valor_mensal_origem: 'cadastro' | 'planilha_bruta' | 'ultimo_pagamento' | null = null;
      if (valorCadastro != null) valor_mensal_origem = 'cadastro';
      else if (valorRaw != null) valor_mensal_origem = 'planilha_bruta';
      else if (valorUltimoPag != null) valor_mensal_origem = 'ultimo_pagamento';

      const vencExibe = (row.venc && String(row.venc).trim()) || raw.venc || null;
      const respExibe = (row.responsaveis && String(row.responsaveis).trim()) || raw.responsaveis || null;
      const pixExibe = (row.pagador_pix && String(row.pagador_pix).trim()) || raw.pagador_pix || null;

      const rowEx = row as {
        raw_row?: unknown;
        pendencia_campos_ignorados?: unknown;
        cobranca_tentativas?: unknown;
        id: string;
        aba: string;
        modalidade: string;
        linha_planilha: number;
        aluno_nome: string;
        wpp: string | null;
        responsaveis: string | null;
        plano: string | null;
        matricula: string | null;
        fim: string | null;
        venc: string | null;
        valor_referencia: number | null;
        pagador_pix: string | null;
        observacoes: string | null;
        ativo: boolean;
        created_at: string;
        updated_at: string;
      };
      const { raw_row: _omitRaw, pendencia_campos_ignorados: _p, cobranca_tentativas: _c, ...rest } = rowEx;
      void _omitRaw;
      void _p;
      void _c;
      return {
        ...rest,
        venc_exibicao: vencExibe,
        responsaveis_exibicao: respExibe,
        pagador_pix_exibicao: pixExibe,
        valor_mensal_exibicao,
        valor_mensal_origem,
        pendencia_campos_ignorados: parsePendenciaCamposIgnorados(rowEx.pendencia_campos_ignorados),
        cobranca_tentativas: parseCobrancaTentativasIn(rowEx.cobranca_tentativas),
      };
    });

    const abas = Array.from(
      new Set((metaAlunosFiltros ?? []).map((r) => String(r.aba ?? '').trim()).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const modalidades = Array.from(
      new Set((metaAlunosFiltros ?? []).map((r) => String(r.modalidade ?? '').trim()).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    return res.json({
      itens,
      filtros: {
        abas,
        modalidades,
      },
    });
  });

  router.post('/fluxo-operacional/alunos', async (req: Request, res: Response) => {
    const b = parseBody(fluxoAlunoUpsertBodySchema, req.body);
    if (!b.ok) return res.status(400).json({ error: b.message });
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Supabase não configurado no backend.' });

    const payload = b.data;
    const linhaPlanilha = await resolveLinhaAlunoUpsert({ supabase, payload });

    const { data, error } = await supabase
      .from('fluxo_alunos_operacionais')
      .upsert(
        {
          aba: payload.aba,
          modalidade: payload.modalidade,
          linha_planilha: linhaPlanilha,
          aluno_nome: payload.alunoNome,
          wpp: toNullable(payload.wpp),
          responsaveis: toNullable(payload.responsaveis),
          plano: toNullable(payload.plano),
          matricula: toNullable(payload.matricula),
          fim: toNullable(payload.fim),
          venc: toNullable(payload.venc),
          valor_referencia: payload.valorReferencia ?? null,
          pagador_pix: toNullable(payload.pagadorPix),
          observacoes: toNullable(payload.observacoes),
          ativo: payload.ativo,
          origem: 'sistema_editor',
        },
        { onConflict: 'aba,linha_planilha' }
      )
      .select(
        'id, aba, modalidade, linha_planilha, aluno_nome, wpp, responsaveis, plano, matricula, fim, venc, valor_referencia, pagador_pix, observacoes, ativo'
      )
      .single();
    if (error) return res.status(500).json({ error: error.message });
    await logAuditoria(req, {
      entidade: 'aluno',
      acao: 'create',
      registroId: String(data.id ?? ''),
      aba: String(data.aba ?? ''),
      modalidade: String(data.modalidade ?? ''),
      alunoNome: String(data.aluno_nome ?? ''),
      beforeData: null,
      afterData: data,
    });
    return res.json({ item: data });
  });

  router.put('/fluxo-operacional/alunos/:id', async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '').trim();
    if (!id) return res.status(400).json({ error: 'ID inválido.' });
    const b = parseBody(fluxoAlunoUpsertBodySchema, req.body);
    if (!b.ok) return res.status(400).json({ error: b.message });
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Supabase não configurado no backend.' });

    const payload = b.data;
    const linhaPlanilha = await resolveLinhaAlunoUpsert({ supabase, payload, existingId: id });
    const { data: beforeData } = await supabase
      .from('fluxo_alunos_operacionais')
      .select(
        'id, aba, modalidade, linha_planilha, aluno_nome, wpp, responsaveis, plano, matricula, fim, venc, valor_referencia, pagador_pix, observacoes, ativo'
      )
      .eq('id', id)
      .maybeSingle();
    const { data, error } = await supabase
      .from('fluxo_alunos_operacionais')
      .update({
        aba: payload.aba,
        modalidade: payload.modalidade,
        linha_planilha: linhaPlanilha,
        aluno_nome: payload.alunoNome,
        wpp: toNullable(payload.wpp),
        responsaveis: toNullable(payload.responsaveis),
        plano: toNullable(payload.plano),
        matricula: toNullable(payload.matricula),
        fim: toNullable(payload.fim),
        venc: toNullable(payload.venc),
        valor_referencia: payload.valorReferencia ?? null,
        pagador_pix: toNullable(payload.pagadorPix),
        observacoes: toNullable(payload.observacoes),
        ativo: payload.ativo,
      })
      .eq('id', id)
      .select(
        'id, aba, modalidade, linha_planilha, aluno_nome, wpp, responsaveis, plano, matricula, fim, venc, valor_referencia, pagador_pix, observacoes, ativo'
      )
      .single();
    if (error) return res.status(500).json({ error: error.message });
    await logAuditoria(req, {
      entidade: 'aluno',
      acao: 'update',
      registroId: String(data.id ?? id),
      aba: String(data.aba ?? ''),
      modalidade: String(data.modalidade ?? ''),
      alunoNome: String(data.aluno_nome ?? ''),
      beforeData: beforeData ?? null,
      afterData: data,
    });
    return res.json({ item: data });
  });

  router.patch('/fluxo-operacional/alunos/:id/ativo', async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '').trim();
    if (!id) return res.status(400).json({ error: 'ID inválido.' });
    const b = parseBody(alunoAtivoPatchSchema, req.body);
    if (!b.ok) return res.status(400).json({ error: b.message });
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Supabase não configurado no backend.' });

    const { data: beforeRow, error: beforeErr } = await supabase
      .from('fluxo_alunos_operacionais')
      .select('id, aba, modalidade, aluno_nome, ativo')
      .eq('id', id)
      .maybeSingle();
    if (beforeErr) return res.status(500).json({ error: beforeErr.message });
    if (!beforeRow) return res.status(404).json({ error: 'Registro de aluno não encontrado.' });

    const { data, error } = await supabase
      .from('fluxo_alunos_operacionais')
      .update({ ativo: b.data.ativo })
      .eq('id', id)
      .select(
        'id, aba, modalidade, linha_planilha, aluno_nome, wpp, responsaveis, plano, matricula, fim, venc, valor_referencia, pagador_pix, observacoes, ativo'
      )
      .single();
    if (error) return res.status(500).json({ error: error.message });

    await logAuditoria(req, {
      entidade: 'aluno',
      acao: 'update',
      registroId: id,
      aba: String(beforeRow.aba ?? ''),
      modalidade: String(beforeRow.modalidade ?? ''),
      alunoNome: String(beforeRow.aluno_nome ?? ''),
      beforeData: { ativo: beforeRow.ativo },
      afterData: { ativo: data.ativo },
    });
    return res.json({ item: data });
  });

  router.patch('/fluxo-operacional/alunos/:id/pendencias-ignoradas', async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '').trim();
    if (!id) return res.status(400).json({ error: 'ID inválido.' });
    const b = parseBody(pendenciasIgnoradasPatchSchema, req.body);
    if (!b.ok) return res.status(400).json({ error: b.message });
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Supabase não configurado no backend.' });

    const normalized = parsePendenciaCamposIgnorados(b.data.pendenciaCamposIgnorados);
    const { data: beforeRow, error: beforeErr } = await supabase
      .from('fluxo_alunos_operacionais')
      .select('id, pendencia_campos_ignorados, aba, modalidade, aluno_nome')
      .eq('id', id)
      .maybeSingle();
    if (beforeErr) return res.status(500).json({ error: beforeErr.message });
    if (!beforeRow) return res.status(404).json({ error: 'Registro de aluno não encontrado.' });

    const { data, error } = await supabase
      .from('fluxo_alunos_operacionais')
      .update({ pendencia_campos_ignorados: normalized })
      .eq('id', id)
      .select('id, pendencia_campos_ignorados')
      .single();
    if (error) return res.status(500).json({ error: error.message });
    await logAuditoria(req, {
      entidade: 'aluno',
      acao: 'update',
      registroId: id,
      aba: String(beforeRow.aba ?? ''),
      modalidade: String(beforeRow.modalidade ?? ''),
      alunoNome: String(beforeRow.aluno_nome ?? ''),
      beforeData: { pendencia_campos_ignorados: beforeRow.pendencia_campos_ignorados },
      afterData: data,
    });
    return res.json({
      pendenciaCamposIgnorados: parsePendenciaCamposIgnorados(data?.pendencia_campos_ignorados),
    });
  });

  router.post('/fluxo-operacional/alunos/:id/cobranca-tentativa', async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '').trim();
    if (!id) return res.status(400).json({ error: 'ID inválido.' });
    const b = parseBody(cobrancaTentativaBodySchema, req.body);
    if (!b.ok) return res.status(400).json({ error: b.message });
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Supabase não configurado no backend.' });

    const { data: beforeRow, error: beforeErr } = await supabase
      .from('fluxo_alunos_operacionais')
      .select('id, cobranca_tentativas, aba, modalidade, aluno_nome')
      .eq('id', id)
      .maybeSingle();
    if (beforeErr) return res.status(500).json({ error: beforeErr.message });
    if (!beforeRow) return res.status(404).json({ error: 'Registro de aluno não encontrado.' });

    const prev = parseCobrancaTentativasIn(beforeRow.cobranca_tentativas);
    const entry = { nota: b.data.nota, registrado_em: new Date().toISOString() };
    const next = [...prev, entry].slice(-40);

    const { data, error } = await supabase
      .from('fluxo_alunos_operacionais')
      .update({ cobranca_tentativas: next })
      .eq('id', id)
      .select('id, cobranca_tentativas')
      .single();
    if (error) return res.status(500).json({ error: error.message });
    await logAuditoria(req, {
      entidade: 'aluno',
      acao: 'update',
      registroId: id,
      aba: String(beforeRow.aba ?? ''),
      modalidade: String(beforeRow.modalidade ?? ''),
      alunoNome: String(beforeRow.aluno_nome ?? ''),
      beforeData: { cobranca_tentativas: prev },
      afterData: { cobranca_tentativas: next },
    });
    return res.json({ cobrancaTentativas: parseCobrancaTentativasIn(data?.cobranca_tentativas) });
  });

  router.delete('/fluxo-operacional/alunos', async (req: Request, res: Response) => {
    const b = parseBody(fluxoAlunoDeleteBodySchema, req.body);
    if (!b.ok) return res.status(400).json({ error: b.message });
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Supabase não configurado no backend.' });

    const { data: beforeData, error: beforeErr } = await supabase
      .from('fluxo_alunos_operacionais')
      .select(
        'id, aba, modalidade, linha_planilha, aluno_nome, wpp, responsaveis, plano, matricula, fim, venc, valor_referencia, pagador_pix, observacoes, ativo'
      )
      .eq('id', b.data.id)
      .maybeSingle();
    if (beforeErr) return res.status(500).json({ error: beforeErr.message });
    if (!beforeData) return res.status(404).json({ error: 'Registro de aluno não encontrado.' });

    const { count: pagamentosVinculados, error: countErr } = await supabase
      .from('fluxo_pagamentos_operacionais')
      .select('*', { count: 'exact', head: true })
      .eq('aba', beforeData.aba)
      .eq('linha_planilha', beforeData.linha_planilha)
      .eq('aluno_nome', beforeData.aluno_nome);
    if (countErr) return res.status(500).json({ error: countErr.message });
    if ((pagamentosVinculados ?? 0) > 0 && !b.data.force) {
      return res.status(409).json({
        error: `Este aluno possui ${(pagamentosVinculados ?? 0)} pagamento(s) vinculado(s). Confirme exclusão forçada para remover aluno e pagamentos.`,
        code: 'HAS_PAYMENTS',
        pagamentosVinculados: pagamentosVinculados ?? 0,
      });
    }

    if ((pagamentosVinculados ?? 0) > 0 && b.data.force) {
      const delPag = await supabase
        .from('fluxo_pagamentos_operacionais')
        .delete()
        .eq('aba', beforeData.aba)
        .eq('linha_planilha', beforeData.linha_planilha)
        .eq('aluno_nome', beforeData.aluno_nome);
      if (delPag.error) return res.status(500).json({ error: delPag.error.message });
    }

    const { error } = await supabase.from('fluxo_alunos_operacionais').delete().eq('id', b.data.id);
    if (error) return res.status(500).json({ error: error.message });
    await logAuditoria(req, {
      entidade: 'aluno',
      acao: 'delete',
      registroId: String(beforeData.id ?? b.data.id),
      aba: String(beforeData.aba ?? ''),
      modalidade: String(beforeData.modalidade ?? ''),
      alunoNome: String(beforeData.aluno_nome ?? ''),
      beforeData,
      afterData: null,
    });
    return res.json({ ok: true });
  });

  router.get('/fluxo-operacional/pagamentos', async (req: Request, res: Response) => {
    const q = parseQuery(fluxoPagamentosListQuerySchema, req.query as Record<string, unknown>);
    if (!q.ok) return res.status(400).json({ error: q.message });

    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Supabase não configurado no backend.' });

    let query = supabase
      .from('fluxo_pagamentos_operacionais')
      .select(
        'id, aba, modalidade, linha_planilha, ordem_lancamento, aluno_nome, data_pagamento, forma, valor, mes_competencia, ano_competencia, responsaveis, pagador_pix, created_at'
      )
      .order('data_pagamento', { ascending: false })
      .order('ordem_lancamento', { ascending: true })
      .limit(q.data.limit);

    if (q.data.ano != null) {
      query = query
        .gte('data_pagamento', `${q.data.ano}-01-01`)
        .lte('data_pagamento', `${q.data.ano}-12-31`);
    }
    if (q.data.mes != null && q.data.ano != null) {
      const inicio = `${q.data.ano}-${String(q.data.mes).padStart(2, '0')}-01`;
      const fimDate = new Date(q.data.ano, q.data.mes, 0);
      const fim = `${q.data.ano}-${String(q.data.mes).padStart(2, '0')}-${String(fimDate.getDate()).padStart(2, '0')}`;
      query = query.gte('data_pagamento', inicio).lte('data_pagamento', fim);
    }
    if (q.data.aba) query = query.eq('aba', q.data.aba);
    if (q.data.modalidade) query = query.eq('modalidade', q.data.modalidade);
    if (q.data.aluno) query = query.ilike('aluno_nome', `%${q.data.aluno}%`);
    if (q.data.q) {
      const safe = q.data.q.replace(/[,%]/g, ' ');
      query = query.or(
        `aluno_nome.ilike.%${safe}%,modalidade.ilike.%${safe}%,responsaveis.ilike.%${safe}%,pagador_pix.ilike.%${safe}%`
      );
    }

    const { data: pags, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    const { data: alunosRows, error: alunosErr } = await supabase
      .from('fluxo_alunos_operacionais')
      .select('aba, linha_planilha, aluno_nome, venc, valor_referencia, responsaveis, pagador_pix, raw_row')
      .limit(5000);
    if (alunosErr) return res.status(500).json({ error: alunosErr.message });

    const alunoPorChave = new Map<
      string,
      { venc: string | null; valor_referencia: number | null; responsaveis: string | null; pagador_pix: string | null }
    >();
    for (const a of alunosRows ?? []) {
      const k = alunoMatchKey(String(a.aba), Number(a.linha_planilha), String(a.aluno_nome));
      const raw = extrairCamposPlanilhaDeRaw(a.raw_row);
      const vencCad = a.venc != null ? String(a.venc).trim() : '';
      const respCad = a.responsaveis != null ? String(a.responsaveis).trim() : '';
      const pixCad = a.pagador_pix != null ? String(a.pagador_pix).trim() : '';
      const valorCad = a.valor_referencia != null ? Number(a.valor_referencia) : null;
      alunoPorChave.set(k, {
        venc: vencCad || raw.venc || null,
        valor_referencia: valorCad ?? raw.valor ?? null,
        responsaveis: respCad || raw.responsaveis || null,
        pagador_pix: pixCad || raw.pagador_pix || null,
      });
    }

    const itens = (pags ?? []).map((p) => {
      const k = alunoMatchKey(String(p.aba), Number(p.linha_planilha), String(p.aluno_nome));
      const cad = alunoPorChave.get(k);
      return {
        ...p,
        aluno_venc: cad?.venc ?? null,
        aluno_valor_referencia: cad?.valor_referencia ?? null,
        aluno_responsaveis: cad?.responsaveis ?? null,
        aluno_pagador_pix: cad?.pagador_pix ?? null,
      };
    });

    let metaPagFiltros = supabase.from('fluxo_pagamentos_operacionais').select('aba, modalidade').limit(8000);
    if (q.data.ano != null) {
      metaPagFiltros = metaPagFiltros
        .gte('data_pagamento', `${q.data.ano}-01-01`)
        .lte('data_pagamento', `${q.data.ano}-12-31`);
    }
    if (q.data.mes != null && q.data.ano != null) {
      const inicio = `${q.data.ano}-${String(q.data.mes).padStart(2, '0')}-01`;
      const fimDate = new Date(q.data.ano, q.data.mes, 0);
      const fim = `${q.data.ano}-${String(q.data.mes).padStart(2, '0')}-${String(fimDate.getDate()).padStart(2, '0')}`;
      metaPagFiltros = metaPagFiltros.gte('data_pagamento', inicio).lte('data_pagamento', fim);
    }
    const { data: metaPagRows, error: metaPagErr } = await metaPagFiltros;
    if (metaPagErr) return res.status(500).json({ error: metaPagErr.message });

    const abas = Array.from(
      new Set((metaPagRows ?? []).map((r) => String(r.aba ?? '').trim()).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const modalidades = Array.from(
      new Set((metaPagRows ?? []).map((r) => String(r.modalidade ?? '').trim()).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    const itensOut =
      q.data.mes != null && q.data.ano != null
        ? await enrichFluxoPagamentosComStatusExtrato(itens, q.data.mes, q.data.ano)
        : itens;
    return res.json({ itens: itensOut, filtros: { abas, modalidades } });
  });

  router.post('/fluxo-operacional/pagamentos', async (req: Request, res: Response) => {
    const b = parseBody(fluxoPagamentoUpsertBodySchema, req.body);
    if (!b.ok) return res.status(400).json({ error: b.message });
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Supabase não configurado no backend.' });

    const p = b.data;
    const linhaPlanilha = await resolveLinhaPagamentoUpsert({ supabase, payload: p });

    const { data, error } = await supabase
      .from('fluxo_pagamentos_operacionais')
      .insert({
        aba: p.aba,
        modalidade: p.modalidade,
        linha_planilha: linhaPlanilha,
        ordem_lancamento: p.ordemLancamento,
        aluno_nome: p.alunoNome,
        data_pagamento: p.dataPagamento,
        forma: toNullable(p.forma),
        valor: p.valor,
        mes_competencia: p.mesCompetencia,
        ano_competencia: p.anoCompetencia,
        responsaveis: toNullable(p.responsaveis),
        pagador_pix: toNullable(p.pagadorPix),
        origem: 'sistema_editor',
      })
      .select(
        'id, aba, modalidade, linha_planilha, ordem_lancamento, aluno_nome, data_pagamento, forma, valor, mes_competencia, ano_competencia, responsaveis, pagador_pix'
      )
      .single();
    if (error) return res.status(500).json({ error: error.message });
    await logAuditoria(req, {
      entidade: 'pagamento',
      acao: 'create',
      registroId: String(data.id ?? ''),
      aba: String(data.aba ?? ''),
      modalidade: String(data.modalidade ?? ''),
      alunoNome: String(data.aluno_nome ?? ''),
      beforeData: null,
      afterData: data,
    });
    return res.json({ item: data });
  });

  router.put('/fluxo-operacional/pagamentos/:id', async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '').trim();
    if (!id) return res.status(400).json({ error: 'ID inválido.' });
    const b = parseBody(fluxoPagamentoUpsertBodySchema, req.body);
    if (!b.ok) return res.status(400).json({ error: b.message });
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Supabase não configurado no backend.' });

    const p = b.data;
    const linhaPlanilha = await resolveLinhaPagamentoUpsert({ supabase, payload: p, existingId: id });
    const { data: beforeData } = await supabase
      .from('fluxo_pagamentos_operacionais')
      .select(
        'id, aba, modalidade, linha_planilha, ordem_lancamento, aluno_nome, data_pagamento, forma, valor, mes_competencia, ano_competencia, responsaveis, pagador_pix'
      )
      .eq('id', id)
      .maybeSingle();
    const { data, error } = await supabase
      .from('fluxo_pagamentos_operacionais')
      .update({
        aba: p.aba,
        modalidade: p.modalidade,
        linha_planilha: linhaPlanilha,
        ordem_lancamento: p.ordemLancamento,
        aluno_nome: p.alunoNome,
        data_pagamento: p.dataPagamento,
        forma: toNullable(p.forma),
        valor: p.valor,
        mes_competencia: p.mesCompetencia,
        ano_competencia: p.anoCompetencia,
        responsaveis: toNullable(p.responsaveis),
        pagador_pix: toNullable(p.pagadorPix),
      })
      .eq('id', id)
      .select(
        'id, aba, modalidade, linha_planilha, ordem_lancamento, aluno_nome, data_pagamento, forma, valor, mes_competencia, ano_competencia, responsaveis, pagador_pix'
      )
      .single();
    if (error) return res.status(500).json({ error: error.message });
    await logAuditoria(req, {
      entidade: 'pagamento',
      acao: 'update',
      registroId: String(data.id ?? id),
      aba: String(data.aba ?? ''),
      modalidade: String(data.modalidade ?? ''),
      alunoNome: String(data.aluno_nome ?? ''),
      beforeData: beforeData ?? null,
      afterData: data,
    });
    return res.json({ item: data });
  });

  router.delete('/fluxo-operacional/pagamentos', async (req: Request, res: Response) => {
    const b = parseBody(fluxoAlunoDeleteBodySchema, req.body);
    if (!b.ok) return res.status(400).json({ error: b.message });
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Supabase não configurado no backend.' });

    const { data: beforeData, error: beforeErr } = await supabase
      .from('fluxo_pagamentos_operacionais')
      .select(
        'id, aba, modalidade, linha_planilha, ordem_lancamento, aluno_nome, data_pagamento, forma, valor, mes_competencia, ano_competencia, responsaveis, pagador_pix'
      )
      .eq('id', b.data.id)
      .maybeSingle();
    if (beforeErr) return res.status(500).json({ error: beforeErr.message });
    if (!beforeData) return res.status(404).json({ error: 'Registro de pagamento não encontrado.' });

    const { error } = await supabase.from('fluxo_pagamentos_operacionais').delete().eq('id', b.data.id);
    if (error) return res.status(500).json({ error: error.message });
    await logAuditoria(req, {
      entidade: 'pagamento',
      acao: 'delete',
      registroId: String(beforeData.id ?? b.data.id),
      aba: String(beforeData.aba ?? ''),
      modalidade: String(beforeData.modalidade ?? ''),
      alunoNome: String(beforeData.aluno_nome ?? ''),
      beforeData,
      afterData: null,
    });
    return res.json({ ok: true });
  });

  router.get('/fluxo-operacional/totais-competencia', async (req: Request, res: Response) => {
    const q = parseQuery(
      z.object({
        mes: z.coerce.number().int().min(1).max(12),
        ano: z.coerce.number().int().min(2000).max(2100),
        aba: z.string().trim().optional(),
        modalidade: z.string().trim().optional(),
      }),
      req.query as Record<string, unknown>,
    );
    if (!q.ok) return res.status(400).json({ error: q.message });
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Supabase não configurado no backend.' });

    try {
      const pagamentos = await loadFluxoPagamentosCompetenciaMes(
        supabase,
        q.data.mes,
        q.data.ano,
        q.data.aba,
        q.data.modalidade,
      );
      const totais = agregarTotaisFluxoCompetencia(pagamentos, q.data.mes, q.data.ano);
      const comparativo = comparativoFluxoExtrato(totais);
      return res.json({ mes: q.data.mes, ano: q.data.ano, totais, comparativo });
    } catch (e) {
      return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  router.get('/fluxo-operacional/resumo-multi-mes', async (req: Request, res: Response) => {
    const q = parseQuery(fluxoResumoMultiMesQuerySchema, req.query as Record<string, unknown>);
    if (!q.ok) return res.status(400).json({ error: q.message });
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Supabase não configurado no backend.' });

    const anoRef = 2026;
    const mesRef = 12;
    const janelaRef = 12;

    const mesesDesc = Array.from({ length: janelaRef }, (_, idx) => addMonths(anoRef, mesRef, -idx));
    const mesesJanela = [...mesesDesc].reverse();
    const janelaKeys = new Set(mesesJanela.map((x) => competenciaKey(x.ano, x.mes)));
    const inicio = competenciaKey(mesesJanela[0].ano, mesesJanela[0].mes) + '-01';
    const fimDate = new Date(anoRef, mesRef, 0);
    const fim = `${anoRef}-${pad2(mesRef)}-${pad2(fimDate.getDate())}`;

    let alunosQuery = supabase
      .from('fluxo_alunos_operacionais')
      .select('id, aba, modalidade, linha_planilha, aluno_nome, wpp, responsaveis, plano, venc, valor_referencia, pagador_pix, ativo')
      .eq('ativo', true)
      .order('aba', { ascending: true })
      .order('modalidade', { ascending: true })
      .order('aluno_nome', { ascending: true })
      .limit(q.data.limit);

    if (q.data.aba) alunosQuery = alunosQuery.eq('aba', q.data.aba);
    if (q.data.modalidade) alunosQuery = alunosQuery.eq('modalidade', q.data.modalidade);
    if (q.data.q) {
      const safe = q.data.q.replace(/[,%]/g, ' ');
      alunosQuery = alunosQuery.ilike('aluno_nome', `%${safe}%`);
    }

    const { data: alunosRows, error: alunosErr } = await alunosQuery;
    if (alunosErr) return res.status(500).json({ error: alunosErr.message });

    const { data: pagamentosRows, error: pagErr } = await supabase
      .from('fluxo_pagamentos_operacionais')
      .select('id, aba, modalidade, linha_planilha, aluno_nome, data_pagamento, forma, valor, mes_competencia, ano_competencia')
      .gte('data_pagamento', inicio)
      .lte('data_pagamento', fim)
      .limit(25000);
    if (pagErr) return res.status(500).json({ error: pagErr.message });

    const vinculosByPlanilha = new Map<string, { banco_id: string; id: string }>();
    for (const m of mesesJanela) {
      const vm = await indexVinculosPorPlanilha(m.mes, m.ano);
      for (const [k, v] of vm) vinculosByPlanilha.set(k, v);
    }

    const keyAluno = (aba: string, modalidade: string, linha: number, nome: string) =>
      `${normalizarAbaFluxo(aba).trim().toLowerCase()}|${modalidade.trim().toLowerCase()}|${linha}|${nome.trim().toLowerCase()}`;

    const pagoPorAlunoMes = new Map<string, number>();
    const detalhePorAlunoMes = new Map<string, { dataPagamento: string | null; formaPagamento: string | null; valorPago: number }>();
    const statusPorAlunoMes = new Map<string, Set<string>>();
    for (const p of pagamentosRows ?? []) {
      const keyMes = competenciaKey(Number(p.ano_competencia), Number(p.mes_competencia));
      if (!janelaKeys.has(keyMes)) continue;
      const k = `${keyAluno(String(p.aba), String(p.modalidade), Number(p.linha_planilha), String(p.aluno_nome))}|${keyMes}`;
      const prev = pagoPorAlunoMes.get(k) ?? 0;
      const valorAtual = Number(p.valor ?? 0);
      pagoPorAlunoMes.set(k, prev + valorAtual);
      const det = detalhePorAlunoMes.get(k);
      const dataPagamento = String(p.data_pagamento ?? '') || null;
      if (!det || (dataPagamento != null && (det.dataPagamento ?? '') < dataPagamento)) {
        detalhePorAlunoMes.set(k, {
          dataPagamento,
          formaPagamento: String(p.forma ?? '').trim() || null,
          valorPago: valorAtual,
        });
      }
      const st = statusExtratoForFluxoPagamento(String(p.id), vinculosByPlanilha).status_extrato;
      const set = statusPorAlunoMes.get(k) ?? new Set<string>();
      set.add(st);
      statusPorAlunoMes.set(k, set);
    }

    const mesAtualKey = competenciaKey(anoRef, mesRef);
    const mesAnterior = addMonths(anoRef, mesRef, -1);
    const mesAnteriorKey = competenciaKey(mesAnterior.ano, mesAnterior.mes);

    const itens = (alunosRows ?? []).map((a) => {
      const alunoKey = keyAluno(String(a.aba), String(a.modalidade), Number(a.linha_planilha), String(a.aluno_nome));
      const esperado = a.valor_referencia != null ? Number(a.valor_referencia) : null;

      const historico = mesesJanela.map((m) => {
        const keyMes = competenciaKey(m.ano, m.mes);
        const pago = pagoPorAlunoMes.get(`${alunoKey}|${keyMes}`) ?? 0;
        const detalhe = detalhePorAlunoMes.get(`${alunoKey}|${keyMes}`);
        const statusSet = statusPorAlunoMes.get(`${alunoKey}|${keyMes}`);
        let status_extrato: 'validado' | 'pendente' | 'sem_lancamento' = 'sem_lancamento';
        if (pago > 0 && statusSet) {
          status_extrato = statusSet.has('pendente') ? 'pendente' : 'validado';
        }
        const agora = new Date();
        const mesAtualRealKey = competenciaKey(agora.getFullYear(), agora.getMonth() + 1);
        let status: 'pago' | 'parcial' | 'pendente' | 'sem_dado' | 'futuro' = 'sem_dado';
        if (keyMes > mesAtualRealKey) {
          status = 'futuro';
        } else if (esperado == null) {
          status = pago > 0 ? 'pago' : 'sem_dado';
        } else if (pago <= 0) {
          status = 'pendente';
        } else if (pago < esperado) {
          status = 'parcial';
        } else {
          status = 'pago';
        }
        return {
          ano: m.ano,
          mes: m.mes,
          key: keyMes,
          valorEsperado: esperado,
          valorPago: pago,
          dataPagamento: detalhe?.dataPagamento ?? null,
          formaPagamento: detalhe?.formaPagamento ?? null,
          status,
          status_extrato,
        };
      });

      const atual = historico.find((h) => h.key === mesAtualKey);
      const anterior = historico.find((h) => h.key === mesAnteriorKey);
      const mesesEmAberto = historico.filter((h) => h.status === 'pendente' || h.status === 'parcial').length;
      const voltouAPagar = !!anterior && anterior.status !== 'pago' && atual?.status === 'pago';

      return {
        id: String(a.id),
        aba: normalizarAbaFluxo(String(a.aba)),
        modalidade: String(a.modalidade),
        linhaPlanilha: Number(a.linha_planilha),
        alunoNome: String(a.aluno_nome),
        whatsapp: a.wpp != null ? String(a.wpp) : null,
        responsaveis: a.responsaveis != null ? String(a.responsaveis) : null,
        plano: a.plano != null ? String(a.plano) : null,
        vencimento: a.venc != null ? String(a.venc) : null,
        pagadorPix: a.pagador_pix != null ? String(a.pagador_pix) : null,
        valorReferencia: esperado,
        historico,
        mesesEmAberto,
        voltouAPagar,
      };
    });

    const pendentesMesAtual = itens.filter((i) => {
      const m = i.historico.find((h) => h.key === mesAtualKey);
      return m?.status === 'pendente' || m?.status === 'parcial';
    }).length;
    const atrasados2Mais = itens.filter((i) => i.mesesEmAberto >= 2).length;
    const voltaramAPagar = itens.filter((i) => i.voltouAPagar).length;

    const prioridade = itens
      .filter((i) => i.mesesEmAberto > 0)
      .sort((a, b) => b.mesesEmAberto - a.mesesEmAberto || a.alunoNome.localeCompare(b.alunoNome, 'pt-BR'))
      .slice(0, 30)
      .map((i) => ({
        id: i.id,
        alunoNome: i.alunoNome,
        aba: i.aba,
        modalidade: i.modalidade,
        mesesEmAberto: i.mesesEmAberto,
      }));

    return res.json({
      referencia: { ano: anoRef, mes: mesRef, janela: janelaRef },
      kpis: { pendentesMesAtual, atrasados2Mais, voltaramAPagar },
      meses: mesesJanela,
      itens,
      prioridade,
    });
  });

  router.get('/fluxo-operacional/divergencias', async (req: Request, res: Response) => {
    if (req.authUser?.role !== 'admin') {
      return res.status(403).json({ error: 'Somente administradores podem consultar divergências.' });
    }
    const q = parseQuery(
      z.object({
        mes: z.coerce.number().int().min(1).max(12),
        ano: z.coerce.number().int().min(2000).max(2100),
      }),
      req.query as Record<string, unknown>
    );
    if (!q.ok) return res.status(400).json({ error: q.message });
    try {
      const payload = await computeFluxoDivergencias(q.data.mes, q.data.ano);
      return res.json(payload);
    } catch (e) {
      return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  /**
   * Índice do ano para validação diária: datas com totais + abas/modalidades.
   * Mesma fonte (fluxo_pagamentos_operacionais) que GET /validacao-pagamentos-diaria.
   */
  router.get('/fluxo-operacional/validacao-indice-ano', async (req: Request, res: Response) => {
    const q = parseQuery(
      z.object({
        ano: z.coerce.number().int().min(2000).max(2100),
        aba: z.string().optional().default('TODAS'),
        modalidade: z.string().optional(),
      }),
      req.query as Record<string, unknown>
    );
    if (!q.ok) return res.status(400).json({ error: q.message });

    const abaReq = (q.data.aba ?? 'TODAS').trim() || 'TODAS';
    const modalidadeReq = (q.data.modalidade ?? '').trim();
    const indice = await carregarIndiceValidacaoFluxoAno(q.data.ano, abaReq, modalidadeReq);
    return res.json(indice);
  });

  /** Legado: preferir validacao-indice-ano. Mantido para compatibilidade. */
  router.get('/fluxo-operacional/pagamentos-meta-ano', async (req: Request, res: Response) => {
    const q = parseQuery(
      z.object({ ano: z.coerce.number().int().min(2000).max(2100) }),
      req.query as Record<string, unknown>
    );
    if (!q.ok) return res.status(400).json({ error: q.message });

    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Supabase não configurado no backend.' });

    const { data, error } = await supabase
      .from('fluxo_pagamentos_operacionais')
      .select(
        'aba, modalidade, aluno_nome, linha_planilha, data_pagamento, forma, valor, mes_competencia, ano_competencia, responsaveis, pagador_pix'
      )
      .gte('data_pagamento', `${q.data.ano}-01-01`)
      .lte('data_pagamento', `${q.data.ano}-12-31`)
      .order('data_pagamento', { ascending: false })
      .limit(12000);
    if (error) return res.status(500).json({ error: error.message });

    type PagRow = {
      data: string;
      forma: string;
      valor: number;
      mes: number;
      ano: number;
      mesCompetencia: number;
      anoCompetencia: number;
      responsaveis: string[];
      pagadorPix?: string;
    };
    type AlunoAgg = { aluno: string; modalidade: string; linha: number; pagamentos: PagRow[] };
    const porAba = new Map<string, Map<string, AlunoAgg>>();

    for (const row of data ?? []) {
      const aba = String(row.aba ?? '').trim();
      const mod = String(row.modalidade ?? aba).trim();
      const aluno = String(row.aluno_nome ?? '').trim();
      const linha = Number(row.linha_planilha ?? 0);
      const dataPg = String(row.data_pagamento ?? '').slice(0, 10);
      if (!aba || !aluno || !dataPg) continue;

      const chaveAluno = `${linha}::${mod}::${aluno}`;
      if (!porAba.has(aba)) porAba.set(aba, new Map());
      const alunosMap = porAba.get(aba)!;
      if (!alunosMap.has(chaveAluno)) {
        alunosMap.set(chaveAluno, { aluno, modalidade: mod, linha, pagamentos: [] });
      }
      const mesComp = Number(row.mes_competencia ?? 0) || Number(dataPg.slice(5, 7));
      const anoComp = Number(row.ano_competencia ?? 0) || Number(dataPg.slice(0, 4));
      alunosMap.get(chaveAluno)!.pagamentos.push({
        data: dataPg,
        forma: row.forma != null ? String(row.forma) : '',
        valor: Number(row.valor || 0),
        mes: mesComp,
        ano: anoComp,
        mesCompetencia: mesComp,
        anoCompetencia: anoComp,
        responsaveis: row.responsaveis ? [String(row.responsaveis)] : [],
        pagadorPix: row.pagador_pix ? String(row.pagador_pix) : undefined,
      });
    }

    const abas = Array.from(porAba.entries())
      .map(([aba, alunosMap]) => ({
        aba,
        ano: q.data.ano,
        alunos: Array.from(alunosMap.values()).sort((a, b) =>
          a.aluno.localeCompare(b.aluno, 'pt-BR', { sensitivity: 'base' })
        ),
      }))
      .sort((a, b) => a.aba.localeCompare(b.aba, 'pt-BR'));

    return res.json({
      ano: q.data.ano,
      fonte: 'fluxo_operacional',
      abas,
    });
  });

  router.get('/fluxo-operacional/auditoria', async (req: Request, res: Response) => {
    const q = parseQuery(
      z.object({
        entidade: z.enum(['aluno', 'pagamento']).optional(),
        limit: z.coerce.number().int().min(1).max(200).optional().default(40),
      }),
      req.query as Record<string, unknown>
    );
    if (!q.ok) return res.status(400).json({ error: q.message });

    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Supabase não configurado no backend.' });

    let query = supabase
      .from('fluxo_operacional_auditoria')
      .select(
        'id, entidade, acao, registro_id, aba, modalidade, aluno_nome, user_email, user_role, created_at'
      )
      .order('created_at', { ascending: false })
      .limit(q.data.limit);
    if (q.data.entidade) query = query.eq('entidade', q.data.entidade);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ itens: data ?? [] });
  });

  return router;
}
