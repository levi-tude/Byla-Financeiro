import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getSupabase } from '../services/supabaseClient.js';
import { parseBody, parseQuery } from '../validation/apiQuery.js';

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

const fluxoPagamentosListQuerySchema = z.object({
  ano: z.coerce.number().int().min(2000).max(2100).optional(),
  mes: z.coerce.number().int().min(1).max(12).optional(),
  aba: z.string().trim().optional(),
  modalidade: z.string().trim().optional(),
  aluno: z.string().trim().optional(),
  q: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional().default(300),
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
        'id, aba, modalidade, linha_planilha, aluno_nome, wpp, responsaveis, plano, matricula, fim, venc, valor_referencia, pagador_pix, observacoes, ativo, created_at, updated_at, raw_row'
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

      const { raw_row: _omitRaw, ...rest } = row as {
        raw_row?: unknown;
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
      void _omitRaw;
      return {
        ...rest,
        venc_exibicao: vencExibe,
        responsaveis_exibicao: respExibe,
        pagador_pix_exibicao: pixExibe,
        valor_mensal_exibicao,
        valor_mensal_origem,
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

    return res.json({ itens, filtros: { abas, modalidades } });
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
