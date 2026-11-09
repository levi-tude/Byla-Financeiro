/**
 * Criações da IA — visões salvas (tabela public.criacoes_ia_salvas).
 * O backend usa a service role (ignora RLS), então as regras da RLS são repetidas aqui:
 * lista = minhas + compartilhadas; só o dono apaga; owner_id vem sempre do token.
 */
import { z } from 'zod';
import { getSupabase } from './supabaseClient.js';

export const SPEC_MAX_BYTES = 65536;
export const VISIBILIDADES = ['privada', 'compartilhada'] as const;
export type Visibilidade = (typeof VISIBILIDADES)[number];

/** Só o spec JSON declarativo (objeto) — nunca código. */
const specSalvoSchema = z
  .object({
    versao: z.literal(1),
    titulo: z.string().min(1).max(160),
    secoes: z.array(z.record(z.string(), z.unknown())).min(1).max(10),
    datasets: z.array(z.record(z.string(), z.unknown())).max(10),
    avisos: z.array(z.string().max(500)).max(20).optional(),
  })
  .passthrough();

export const salvarCriacaoSchema = z.strictObject({
  titulo: z.string().trim().min(3).max(120),
  prompt: z.string().max(500).optional(),
  visibilidade: z.enum(VISIBILIDADES),
  spec: specSalvoSchema,
});
export type SalvarCriacaoInput = z.infer<typeof salvarCriacaoSchema>;

export function specTamanhoOk(spec: unknown): boolean {
  return Buffer.byteLength(JSON.stringify(spec), 'utf8') <= SPEC_MAX_BYTES;
}

export type CriacaoSalvaResumo = {
  id: string;
  titulo: string;
  prompt: string | null;
  visibilidade: Visibilidade;
  minha: boolean;
  created_at: string;
  updated_at: string;
};

function db() {
  const s = getSupabase();
  if (!s) throw new Error('Supabase não configurado.');
  return s;
}

const TABELA = 'criacoes_ia_salvas';

export async function listarSalvas(userId: string): Promise<CriacaoSalvaResumo[]> {
  const { data, error } = await db()
    .from(TABELA)
    .select('id, owner_id, titulo, prompt, visibilidade, created_at, updated_at')
    .or(`owner_id.eq.${userId},visibilidade.eq.compartilhada`)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error('Falha ao listar as visões salvas.');
  return (data ?? []).map((r) => ({
    id: r.id,
    titulo: r.titulo,
    prompt: r.prompt,
    visibilidade: r.visibilidade,
    minha: r.owner_id === userId,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

export async function abrirSalva(userId: string, id: string): Promise<(CriacaoSalvaResumo & { spec: unknown }) | null> {
  const { data, error } = await db()
    .from(TABELA)
    .select('id, owner_id, titulo, prompt, visibilidade, spec, created_at, updated_at')
    .eq('id', id)
    .or(`owner_id.eq.${userId},visibilidade.eq.compartilhada`)
    .maybeSingle();
  if (error) throw new Error('Falha ao abrir a visão salva.');
  if (!data) return null;
  return { ...data, minha: data.owner_id === userId, owner_id: undefined } as CriacaoSalvaResumo & { spec: unknown };
}

export async function salvarCriacao(userId: string, input: SalvarCriacaoInput): Promise<CriacaoSalvaResumo> {
  const { data, error } = await db()
    .from(TABELA)
    .insert({ owner_id: userId, titulo: input.titulo, prompt: input.prompt ?? null, visibilidade: input.visibilidade, spec: input.spec })
    .select('id, titulo, prompt, visibilidade, created_at, updated_at')
    .single();
  if (error || !data) throw new Error('Falha ao salvar a visão.');
  return { ...data, minha: true } as CriacaoSalvaResumo;
}

/** Só o dono apaga. Retorna false se não existe ou não é do usuário. */
export async function apagarSalva(userId: string, id: string): Promise<boolean> {
  const { data, error } = await db().from(TABELA).delete().eq('id', id).eq('owner_id', userId).select('id');
  if (error) throw new Error('Falha ao apagar a visão.');
  return (data ?? []).length > 0;
}
