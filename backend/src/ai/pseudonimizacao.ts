/**
 * Pseudonimização nome → código estável por requisição ("Aluno 1", "Pessoa 3").
 * Tudo que vai ao LLM passa por `ocultar`; argumentos de tools voltam por `revelarArgs`;
 * a resposta final volta por `revelar`. Nomes conhecidos vêm do banco (alunos do Fluxo,
 * mapeamento_pessoa_categoria, pessoas do extrato) — só leitura.
 */
import { getSupabase } from '../services/supabaseClient.js';

/**
 * Remove dígitos de documento (CPF/CNPJ completos, parciais ou mascarados com *) colados
 * ao nome no campo `pessoa` do extrato. Ex.: "FULANO DE TAL 123.456.789-00" → "FULANO DE TAL";
 * "***.456.789-** FULANA" → "FULANA"; "BELTRANO12345678" → "BELTRANO".
 * Só deve ser aplicado a nomes (não a textos com valores/datas).
 */
export function limparDocumentoPessoa(pessoa: string | null | undefined): string {
  if (!pessoa) return '';
  return pessoa
    .replace(/[*\d][\d.*\/\-]*\d[\d.*\/\-]*|\*{2,}[\d.*\/\-]*/g, ' ')
    .replace(/\s+[-–/.]+(?=\s|$)/g, ' ')
    .replace(/^[\s\-–/.]+|[\s\-–/.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export type NomeConhecido = { nome: string; tipo: 'aluno' | 'pessoa' };

/** Normaliza 1 char → 1 char (minúsculo, sem acento), mantendo posições. */
function normChar(c: string): string {
  const n = c.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return n.length === 1 ? n : c.toLowerCase();
}
function normStr(s: string): string {
  return Array.from(s, normChar).join('');
}
const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);
/** Códigos como o LLM às vezes os reescreve: "Pessoa 2", "pessoa 2", "PESSOA 2", "Pessoa2", "Pessoa nº 2", "Pessoa #2". */
const CODIGO_RE = /(?<![\p{L}\p{N}])(aluno|pessoa)\s*(?:n\s*[º°o.]\s*|#\s*)?(\d{1,4})(?![\p{N}])/giu;

export class Pseudonimizador {
  private nomes: { norm: string; tipo: NomeConhecido['tipo'] }[];
  private codigoPorNome = new Map<string, string>();
  private nomePorCodigo = new Map<string, string>();
  private cont = { aluno: 0, pessoa: 0 };

  constructor(conhecidos: NomeConhecido[]) {
    const vistos = new Map<string, NomeConhecido['tipo']>();
    for (const k of conhecidos) {
      const norm = normStr(k.nome.trim().replace(/\s+/g, ' '));
      // Ignora nomes curtos/genéricos (menos de 4 letras) para não mascarar palavras comuns.
      if (norm.replace(/[^\p{L}]/gu, '').length < 4) continue;
      if (!vistos.has(norm) || k.tipo === 'aluno') vistos.set(norm, k.tipo);
    }
    // Mais longos primeiro: "Aluno Demo Um" antes de "Demo".
    this.nomes = [...vistos].map(([norm, tipo]) => ({ norm, tipo })).sort((a, b) => b.norm.length - a.norm.length);
  }

  private codigo(norm: string, tipo: NomeConhecido['tipo'], original: string): string {
    let c = this.codigoPorNome.get(norm);
    if (!c) {
      this.cont[tipo]++;
      c = `${tipo === 'aluno' ? 'Aluno' : 'Pessoa'} ${this.cont[tipo]}`;
      this.codigoPorNome.set(norm, c);
      this.nomePorCodigo.set(c, original);
    }
    return c;
  }

  ocultar(texto: string): string {
    if (!texto || !this.nomes.length) return texto;
    let src = texto;
    const norm = normStr(src);
    const ranges: { ini: number; fim: number; norm: string; tipo: NomeConhecido['tipo']; code?: string }[] = [];
    const ocupado = new Uint8Array(src.length);
    for (const n of this.nomes) {
      let from = 0;
      for (;;) {
        const i = norm.indexOf(n.norm, from);
        if (i < 0) break;
        const fim = i + n.norm.length;
        from = i + 1;
        if (isWordChar(src[i - 1]) || isWordChar(src[fim])) continue;
        if (ocupado.subarray(i, fim).some((x) => x)) continue;
        ocupado.fill(1, i, fim);
        ranges.push({ ini: i, fim, norm: n.norm, tipo: n.tipo });
      }
    }
    // Códigos na ordem de aparição.
    ranges.sort((a, b) => a.ini - b.ini);
    for (const r of ranges) r.code = this.codigo(r.norm, r.tipo, src.slice(r.ini, r.fim));
    for (const r of ranges.reverse()) src = src.slice(0, r.ini) + r.code + src.slice(r.fim);
    return src;
  }

  /** Códigos que apareceram em `revelar` sem nome correspondente (diagnóstico). */
  naoResolvidos = new Set<string>();

  revelar(texto: string): string {
    return texto.replace(CODIGO_RE, (m, tipo: string, num: string) => {
      const chave = `${tipo.toLowerCase() === 'aluno' ? 'Aluno' : 'Pessoa'} ${Number(num)}`;
      const nome = this.nomePorCodigo.get(chave);
      if (nome) return nome;
      if (this.nomePorCodigo.size) this.naoResolvidos.add(chave);
      return m;
    });
  }

  revelarArgs(args: Record<string, unknown>): Record<string, unknown> {
    const go = (v: unknown): unknown =>
      typeof v === 'string' ? this.revelar(v) : Array.isArray(v) ? v.map(go) : v && typeof v === 'object' ? this.revelarArgs(v as Record<string, unknown>) : v;
    return Object.fromEntries(Object.entries(args).map(([k, v]) => [k, go(v)]));
  }
}

let cache: { at: number; nomes: NomeConhecido[] } | null = null;

/** Carrega nomes conhecidos (somente leitura, cache 10 min). Falha → lista vazia + stripPii continua. */
export async function carregarNomesConhecidos(): Promise<NomeConhecido[]> {
  if (cache && Date.now() - cache.at < 10 * 60 * 1000) return cache.nomes;
  const supabase = getSupabase();
  if (!supabase) return [];
  const nomes: NomeConhecido[] = [];
  // O PostgREST corta em 1000 linhas por resposta: pagina com .range() para não perder nomes
  // (nome fora da lista não é pseudonimizado → o LLM inventa "Pessoa N" sem correspondência).
  const [alunos, cadastro, maps, trans] = await Promise.all([
    carregarPaginado<{ aluno_nome: string | null }>((a, b) => supabase.from('fluxo_pagamentos_operacionais').select('aluno_nome').range(a, b)),
    // Cadastro do Fluxo: inclui quem nunca pagou (aparece em quem_nao_pagou / saldo_aluno).
    carregarPaginado<{ aluno_nome: string | null }>((a, b) => supabase.from('fluxo_alunos_operacionais').select('aluno_nome').range(a, b)),
    carregarPaginado<{ pessoa_normalizada: string | null }>((a, b) => supabase.from('mapeamento_pessoa_categoria').select('pessoa_normalizada').range(a, b)),
    carregarPaginado<{ pessoa: string | null }>((a, b) => supabase.from('transacoes').select('pessoa').not('pessoa', 'is', null).range(a, b)),
  ]);
  for (const r of [...alunos, ...cadastro]) if (r.aluno_nome) nomes.push({ nome: limparDocumentoPessoa(r.aluno_nome), tipo: 'aluno' });
  for (const r of maps) if (r.pessoa_normalizada) nomes.push({ nome: limparDocumentoPessoa(r.pessoa_normalizada), tipo: 'pessoa' });
  for (const r of trans) if (r.pessoa) nomes.push({ nome: limparDocumentoPessoa(r.pessoa), tipo: 'pessoa' });
  cache = { at: Date.now(), nomes };
  return nomes;
}

type Pagina<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

/** Lê todas as páginas (até `maxLinhas`) de uma consulta Supabase. Erro → o que já leu. */
export async function carregarPaginado<T>(
  pagina: (de: number, ate: number) => Pagina<T>,
  tamanho = 1000,
  maxLinhas = 30000,
): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; de < maxLinhas; de += tamanho) {
    const { data, error } = await pagina(de, de + tamanho - 1);
    if (error || !data) break;
    out.push(...data);
    if (data.length < tamanho) break;
  }
  return out;
}
