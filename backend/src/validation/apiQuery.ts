import { z } from 'zod';

/** mes 1–12 e ano >= 2000 (query string coerced). */
export const mesAnoQuerySchema = z.object({
  mes: z.coerce.number().int().min(1).max(12),
  ano: z.coerce.number().int().min(2000).max(2100),
});

export const dataIsoQuerySchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.'),
});

export const tipoTransacaoQuerySchema = z.enum(['entrada', 'saida']);

export const transacoesQuerySchema = mesAnoQuerySchema.extend({
  tipo: z.preprocess(
    (v) => (typeof v === 'string' ? v.toLowerCase() : v),
    tipoTransacaoQuerySchema,
  ),
});

export const trimestreAnoQuerySchema = z.object({
  trimestre: z.coerce.number().int().min(1).max(4),
  ano: z.coerce.number().int().min(2000).max(2100),
});

export const anoQuerySchema = z.object({
  ano: z.coerce.number().int().min(2000).max(2100),
});

/** Fluxo: mes e ano opcionais, mas se um vier o outro deve vir (evita estado inconsistente). */
export const fluxoCompletoQuerySchema = z
  .object({
    mes: z.coerce.number().int().min(1).max(12).optional(),
    ano: z.coerce.number().int().min(2000).max(2100).optional(),
  })
  .refine(
    (q) =>
      (q.mes == null && q.ano == null) ||
      (q.mes != null && q.ano != null),
    { message: 'Informe mes e ano juntos, ou omita ambos.' },
  );

export function zodErrorMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.') || 'query'}: ${i.message}`).join('; ');
}

export function parseQuery<T extends z.ZodTypeAny>(
  schema: T,
  query: Record<string, unknown>,
): { ok: true; data: z.infer<T> } | { ok: false; message: string } {
  const r = schema.safeParse(query);
  if (r.success) return { ok: true, data: r.data };
  return { ok: false, message: zodErrorMessage(r.error) };
}

/** Validação diária: data obrigatória; aba e modalidade opcionais. */
export const validacaoPagamentosDiariaQuerySchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.'),
  aba: z.string().optional(),
  modalidade: z.string().optional(),
});

/** POST relatórios IA: body com payload objeto (não array). */
export const gerarTextoIaBodySchema = z.object({
  payload: z.record(z.string(), z.unknown()),
});

export const validacaoVinculoUpsertBodySchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.'),
  mes: z.coerce.number().int().min(1).max(12),
  ano: z.coerce.number().int().min(2000).max(2100),
  banco_id: z.string().min(1),
  planilha_ids: z.array(z.string().min(1)).min(1),
  observacao: z.string().max(400).optional(),
});

export const validacaoVinculoDeleteBodySchema = z.object({
  planilha_id: z.string().min(1),
});

/** Categorização banco (v_transacoes_export + despesas). */
export const categoriasResumoQuerySchema = mesAnoQuerySchema.extend({
  tipo: z.preprocess((v) => (typeof v === 'string' ? v.toLowerCase() : v), tipoTransacaoQuerySchema),
});

export const categoriasDetalheQuerySchema = categoriasResumoQuerySchema.extend({
  grupo: z.enum(['modalidade', 'categoria', 'funcionario']),
  chave: z.string().min(1).max(400),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export function parseBody<T extends z.ZodTypeAny>(
  schema: T,
  body: unknown,
): { ok: true; data: z.infer<T> } | { ok: false; message: string } {
  const r = schema.safeParse(body);
  if (r.success) return { ok: true, data: r.data };
  return { ok: false, message: zodErrorMessage(r.error) };
}
