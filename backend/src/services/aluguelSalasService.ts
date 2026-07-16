import { z } from 'zod';
import { getSupabase } from './supabaseClient.js';

export const CLASSIFICACOES_SALA = ['teatro', 'ensaio', 'coworking', 'outro'] as const;
export type ClassificacaoSala = (typeof CLASSIFICACOES_SALA)[number];

export type AluguelSala = {
  id: string;
  nome: string;
  slug: string;
  classificacao: ClassificacaoSala;
  ativa: boolean;
  cor: string | null;
  created_at: string;
};

export type AluguelReserva = {
  id: string;
  sala_id: string;
  titulo: string;
  data: string;
  hora_inicio: string;
  hora_fim: string;
  observacao: string | null;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
  sala?: Pick<AluguelSala, 'id' | 'nome' | 'slug' | 'classificacao' | 'cor'>;
};

export type ResumoWhatsAppPorSala = {
  sala_id: string;
  sala_nome: string;
  total_dias: number;
  total_reservas: number;
  itens: Array<{
    data: string;
    hora_inicio: string;
    hora_fim: string;
    titulo: string;
  }>;
};

export type ResumoWhatsAppAluguel = {
  mes: number;
  ano: number;
  periodo_label: string;
  total_dias: number;
  total_reservas: number;
  por_sala: ResumoWhatsAppPorSala[];
  texto: string;
  gerado_em: string;
};

const MESES = [
  '',
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export const salaCreateSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug: só minúsculas, números e hífens.')
    .optional(),
  classificacao: z.enum(CLASSIFICACOES_SALA).default('outro'),
  ativa: z.boolean().optional().default(true),
  cor: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Cor hex (#RRGGBB).')
    .nullable()
    .optional(),
});

export const salaPatchSchema = z.object({
  nome: z.string().trim().min(2).max(120).optional(),
  classificacao: z.enum(CLASSIFICACOES_SALA).optional(),
  ativa: z.boolean().optional(),
  cor: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Cor hex (#RRGGBB).')
    .nullable()
    .optional(),
});

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

export const reservaCreateSchema = z
  .object({
    sala_id: z.string().uuid(),
    titulo: z.string().trim().min(2).max(200),
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.'),
    hora_inicio: z.string().regex(timeRegex, 'Use HH:MM.'),
    hora_fim: z.string().regex(timeRegex, 'Use HH:MM.'),
    observacao: z.string().trim().max(500).nullable().optional(),
  })
  .refine((r) => normalizeTime(r.hora_fim) > normalizeTime(r.hora_inicio), {
    message: 'hora_fim deve ser depois de hora_inicio.',
    path: ['hora_fim'],
  });

export const reservaPatchSchema = z
  .object({
    sala_id: z.string().uuid().optional(),
    titulo: z.string().trim().min(2).max(200).optional(),
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').optional(),
    hora_inicio: z.string().regex(timeRegex, 'Use HH:MM.').optional(),
    hora_fim: z.string().regex(timeRegex, 'Use HH:MM.').optional(),
    observacao: z.string().trim().max(500).nullable().optional(),
  })
  .refine(
    (r) => {
      if (r.hora_inicio == null || r.hora_fim == null) return true;
      return normalizeTime(r.hora_fim) > normalizeTime(r.hora_inicio);
    },
    { message: 'hora_fim deve ser depois de hora_inicio.', path: ['hora_fim'] },
  );

export function slugifyNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function normalizeTime(t: string): string {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return t;
  const hh = String(Math.min(23, Number(m[1]))).padStart(2, '0');
  const mm = String(Math.min(59, Number(m[2]))).padStart(2, '0');
  const ss = m[3] != null ? String(Math.min(59, Number(m[3]))).padStart(2, '0') : '00';
  return `${hh}:${mm}:${ss}`;
}

export function formatTimeShort(t: string): string {
  const n = normalizeTime(t);
  return n.slice(0, 5);
}

export function formatDateBr(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}`;
}

export function mesAnoBounds(mes: number, ano: number): { inicio: string; fim: string } {
  const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const ultimo = new Date(ano, mes, 0).getDate();
  const fim = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`;
  return { inicio, fim };
}

export function buildTextoResumoWhatsApp(resumo: Omit<ResumoWhatsAppAluguel, 'texto' | 'gerado_em'>): string {
  const lines: string[] = [`*Aluguel de salas – ${resumo.periodo_label}*`];
  lines.push(
    `Total: ${resumo.total_dias} dia(s) | ${resumo.total_reservas} reserva(s)`,
    '',
  );
  if (resumo.por_sala.length === 0) {
    lines.push('_Nenhuma reserva neste período._');
    return lines.join('\n');
  }
  for (const sala of resumo.por_sala) {
    lines.push(`*${sala.sala_nome}:* ${sala.total_dias} dia(s) | ${sala.total_reservas} reserva(s)`);
    for (const item of sala.itens) {
      lines.push(
        `• ${formatDateBr(item.data)} ${formatTimeShort(item.hora_inicio)}–${formatTimeShort(item.hora_fim)} — ${item.titulo}`,
      );
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

function requireDb() {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase não configurado.');
  return supabase;
}

export async function listSalas(opts?: { incluirInativas?: boolean }): Promise<AluguelSala[]> {
  const supabase = requireDb();
  let q = supabase.from('aluguel_salas').select('*').order('nome');
  if (!opts?.incluirInativas) q = q.eq('ativa', true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as AluguelSala[];
}

export async function createSala(
  input: z.infer<typeof salaCreateSchema>,
): Promise<AluguelSala> {
  const supabase = requireDb();
  const slug = input.slug?.trim() || slugifyNome(input.nome);
  const { data, error } = await supabase
    .from('aluguel_salas')
    .insert({
      nome: input.nome.trim(),
      slug,
      classificacao: input.classificacao,
      ativa: input.ativa ?? true,
      cor: input.cor ?? null,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as AluguelSala;
}

export async function patchSala(
  id: string,
  input: z.infer<typeof salaPatchSchema>,
): Promise<AluguelSala> {
  const supabase = requireDb();
  const patch: Record<string, unknown> = {};
  if (input.nome != null) patch.nome = input.nome.trim();
  if (input.classificacao != null) patch.classificacao = input.classificacao;
  if (input.ativa != null) patch.ativa = input.ativa;
  if (input.cor !== undefined) patch.cor = input.cor;
  if (Object.keys(patch).length === 0) throw new Error('Nada para atualizar.');
  const { data, error } = await supabase
    .from('aluguel_salas')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as AluguelSala;
}

export async function listReservas(opts: {
  mes: number;
  ano: number;
  salaId?: string;
}): Promise<AluguelReserva[]> {
  const supabase = requireDb();
  const { inicio, fim } = mesAnoBounds(opts.mes, opts.ano);
  let q = supabase
    .from('aluguel_reservas')
    .select(
      '*, sala:aluguel_salas(id, nome, slug, classificacao, cor)',
    )
    .gte('data', inicio)
    .lte('data', fim)
    .order('data')
    .order('hora_inicio');
  if (opts.salaId) q = q.eq('sala_id', opts.salaId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const r = row as AluguelReserva & { sala?: AluguelReserva['sala'] };
    return {
      ...r,
      hora_inicio: formatTimeShort(String(r.hora_inicio)),
      hora_fim: formatTimeShort(String(r.hora_fim)),
    };
  });
}

async function assertNoOverlap(opts: {
  salaId: string;
  data: string;
  horaInicio: string;
  horaFim: string;
  excludeId?: string;
}): Promise<void> {
  const supabase = requireDb();
  const hi = normalizeTime(opts.horaInicio);
  const hf = normalizeTime(opts.horaFim);
  let q = supabase
    .from('aluguel_reservas')
    .select('id, titulo, hora_inicio, hora_fim')
    .eq('sala_id', opts.salaId)
    .eq('data', opts.data);
  if (opts.excludeId) q = q.neq('id', opts.excludeId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    const a = normalizeTime(String(row.hora_inicio));
    const b = normalizeTime(String(row.hora_fim));
    // overlap: start < otherEnd && end > otherStart
    if (hi < b && hf > a) {
      throw new Error(
        `Conflito de horário com "${row.titulo}" (${formatTimeShort(a)}–${formatTimeShort(b)}).`,
      );
    }
  }
}

export async function createReserva(
  input: z.infer<typeof reservaCreateSchema>,
  criadoPor?: string | null,
): Promise<AluguelReserva> {
  const supabase = requireDb();
  const hora_inicio = normalizeTime(input.hora_inicio);
  const hora_fim = normalizeTime(input.hora_fim);
  await assertNoOverlap({
    salaId: input.sala_id,
    data: input.data,
    horaInicio: hora_inicio,
    horaFim: hora_fim,
  });
  const { data, error } = await supabase
    .from('aluguel_reservas')
    .insert({
      sala_id: input.sala_id,
      titulo: input.titulo.trim(),
      data: input.data,
      hora_inicio,
      hora_fim,
      observacao: input.observacao?.trim() || null,
      criado_por: criadoPor ?? null,
    })
    .select('*, sala:aluguel_salas(id, nome, slug, classificacao, cor)')
    .single();
  if (error) throw new Error(error.message);
  const r = data as AluguelReserva;
  return {
    ...r,
    hora_inicio: formatTimeShort(String(r.hora_inicio)),
    hora_fim: formatTimeShort(String(r.hora_fim)),
  };
}

export async function patchReserva(
  id: string,
  input: z.infer<typeof reservaPatchSchema>,
): Promise<AluguelReserva> {
  const supabase = requireDb();
  const { data: atual, error: errAtual } = await supabase
    .from('aluguel_reservas')
    .select('*')
    .eq('id', id)
    .single();
  if (errAtual || !atual) throw new Error(errAtual?.message ?? 'Reserva não encontrada.');

  const sala_id = input.sala_id ?? (atual.sala_id as string);
  const data = input.data ?? (atual.data as string);
  const hora_inicio = normalizeTime(input.hora_inicio ?? String(atual.hora_inicio));
  const hora_fim = normalizeTime(input.hora_fim ?? String(atual.hora_fim));
  if (hora_fim <= hora_inicio) throw new Error('hora_fim deve ser depois de hora_inicio.');

  await assertNoOverlap({
    salaId: sala_id,
    data,
    horaInicio: hora_inicio,
    horaFim: hora_fim,
    excludeId: id,
  });

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    sala_id,
    data,
    hora_inicio,
    hora_fim,
  };
  if (input.titulo != null) patch.titulo = input.titulo.trim();
  if (input.observacao !== undefined) patch.observacao = input.observacao?.trim() || null;

  const { data: updated, error } = await supabase
    .from('aluguel_reservas')
    .update(patch)
    .eq('id', id)
    .select('*, sala:aluguel_salas(id, nome, slug, classificacao, cor)')
    .single();
  if (error) throw new Error(error.message);
  const r = updated as AluguelReserva;
  return {
    ...r,
    hora_inicio: formatTimeShort(String(r.hora_inicio)),
    hora_fim: formatTimeShort(String(r.hora_fim)),
  };
}

export async function deleteReserva(id: string): Promise<void> {
  const supabase = requireDb();
  const { error } = await supabase.from('aluguel_reservas').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function montarResumoWhatsApp(opts: {
  mes: number;
  ano: number;
  salaId?: string;
}): Promise<ResumoWhatsAppAluguel> {
  const reservas = await listReservas(opts);
  const bySala = new Map<string, ResumoWhatsAppPorSala>();

  for (const r of reservas) {
    const salaId = r.sala_id;
    const salaNome = r.sala?.nome ?? 'Sala';
    let bucket = bySala.get(salaId);
    if (!bucket) {
      bucket = {
        sala_id: salaId,
        sala_nome: salaNome,
        total_dias: 0,
        total_reservas: 0,
        itens: [],
      };
      bySala.set(salaId, bucket);
    }
    bucket.total_reservas += 1;
    bucket.itens.push({
      data: r.data,
      hora_inicio: r.hora_inicio,
      hora_fim: r.hora_fim,
      titulo: r.titulo,
    });
  }

  const por_sala = [...bySala.values()].map((s) => {
    const dias = new Set(s.itens.map((i) => i.data));
    return { ...s, total_dias: dias.size };
  });

  const allDays = new Set(reservas.map((r) => r.data));
  const base = {
    mes: opts.mes,
    ano: opts.ano,
    periodo_label: `${MESES[opts.mes]} de ${opts.ano}`,
    total_dias: allDays.size,
    total_reservas: reservas.length,
    por_sala,
  };

  return {
    ...base,
    texto: buildTextoResumoWhatsApp(base),
    gerado_em: new Date().toISOString(),
  };
}

/** Mês anterior em America/Sao_Paulo (para cron n8n no 1º dia). */
export function mesAnteriorReferenciaSaoPaulo(now = new Date()): { mes: number; ano: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(now);
  const y = Number(parts.find((p) => p.type === 'year')?.value);
  const m = Number(parts.find((p) => p.type === 'month')?.value);
  if (m === 1) return { mes: 12, ano: y - 1 };
  return { mes: m - 1, ano: y };
}
