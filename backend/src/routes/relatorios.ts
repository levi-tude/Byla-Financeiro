import { Router, Request, Response } from 'express';
import { getSupabase } from '../services/supabaseClient.js';
import { config } from '../config.js';
import { filtrarTransacoesOficiais } from '../services/transacoesFiltro.js';
import { GetFluxoCompletoUseCase } from '../useCases/GetFluxoCompletoUseCase.js';
import {
  anoQuerySchema,
  dataIsoQuerySchema,
  gerarTextoIaBodySchema,
  mesAnoQuerySchema,
  parseBody,
  parseQuery,
  trimestreAnoQuerySchema,
} from '../validation/apiQuery.js';
import { buildUserPromptRelatorio, getSystemPromptForTipo } from '../relatorios/relatoriosPrompts.js';
import { montarAlunosPanorama, montarMensalOperacional } from '../services/relatorioMontagem.js';
import {
  getConciliacaoVencimentosMesData,
  ConciliacaoVencimentosMesError,
} from '../services/conciliacaoVencimentosMes.js';
import { formatarTextoRelatorio } from '../relatorios/formatarTextoRelatorio.js';
import {
  flattenEntradasPorFontePlanilha,
  montarControleCaixaLeituraGestao,
  totaisAgregadosPorBlocoSaida,
} from '../relatorios/controleCaixaGestao.js';
import { linhasGastosFixosDeSaidasBlocos } from '../logic/planilhaControleEntradas.js';
import { parseValor } from '../logic/planilhaControleSaidas.js';

const MESES_NOMES: Record<number, string> = {
  1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio', 6: 'Junho',
  7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro',
};

interface ResumoMensalRow {
  ano: number;
  mes: number;
  total_entradas: number;
  total_saidas: number;
  saldo_mes: number;
  qtd_entradas?: number;
  qtd_saidas?: number;
}

/** Busca resumo oficial por mês(s) no Supabase (v_resumo_mensal_oficial). */
async function getResumoMensalSupabase(mesAnos: { mes: number; ano: number }[]): Promise<ResumoMensalRow[]> {
  const supabase = getSupabase();
  if (!supabase || mesAnos.length === 0) return [];
  const orFilters = mesAnos.map(({ mes, ano }) => `and(mes.eq.${mes},ano.eq.${ano})`).join(',');
  const { data, error } = await supabase
    .from('v_resumo_mensal_oficial')
    .select('ano, mes, total_entradas, total_saidas, saldo_mes, qtd_entradas, qtd_saidas')
    .or(orFilters);

  if (error) return [];
  return (data ?? []) as ResumoMensalRow[];
}

/** Retorna (mes, ano) do mês anterior. */
function mesAnterior(mes: number, ano: number): { mes: number; ano: number } {
  if (mes === 1) return { mes: 12, ano: ano - 1 };
  return { mes: mes - 1, ano };
}

/** Limite de tokens de saída da IA conforme o tipo (listas longas da planilha precisam de espaço). */
function maxOutputTokensRelatorio(tipo: string): number {
  switch (tipo) {
    case 'mensal':
    case 'trimestral':
    case 'anual':
    case 'mensal_operacional':
      return 2500;
    case 'alunos_panorama':
      return 2000;
    case 'diario':
    case 'alunos_inadimplencia_mes':
    default:
      return 1200;
  }
}

/** Meses do trimestre: 1=>[1,2,3], 2=>[4,5,6], 3=>[7,8,9], 4=>[10,11,12]. */
function mesesDoTrimestre(trimestre: number): number[] {
  const t = Math.max(1, Math.min(4, trimestre));
  return [(t - 1) * 3 + 1, (t - 1) * 3 + 2, (t - 1) * 3 + 3];
}

const GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-1.5-pro'] as const;

/** Chama a API gratuita do Google Gemini e retorna o texto gerado. Tenta outro modelo se der 429. */
async function gerarTextoComGemini(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  maxOutputTokens: number,
): Promise<string> {
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens },
  };

  let last429 = false;
  for (const model of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const raw = await response.text();

    if (response.ok) {
      let data: { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[] };
      try {
        data = JSON.parse(raw) as typeof data;
      } catch {
        throw new Error('Resposta inválida da API Gemini.');
      }
      const candidate = data.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text?.trim() ?? '';
      if (!text && candidate?.finishReason === 'SAFETY') throw new Error('A IA bloqueou a resposta por política de segurança. Tente um relatório com menos dados ou outro período.');
      return text || '(A IA não retornou texto. Tente gerar novamente.)';
    }

    if (response.status === 429) {
      last429 = true;
      await new Promise((r) => setTimeout(r, 6000));
      continue;
    }
    if (response.status === 404) continue;
    if (response.status === 400 && raw.includes('API_KEY_INVALID')) throw new Error('Chave da API Gemini inválida. Gere uma nova em Google AI Studio e atualize o .env.');
    throw new Error(`Gemini API: ${response.status}. ${raw.slice(0, 300)}`);
  }

  if (last429) {
    throw new Error(
      'Limite gratuito da API Gemini atingido. Aguarde 1–2 minutos e tente de novo. Alternativa: adicione OPENAI_API_KEY no backend/.env (pago) para usar a OpenAI.'
    );
  }
  throw new Error('Nenhum modelo Gemini disponível no momento. Tente mais tarde ou configure OPENAI_API_KEY no .env.');
}

/** Chama a Groq (API OpenAI-compatível, grátis, cota alta). */
async function gerarTextoComGroq(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  max_tokens: number,
): Promise<string> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      temperature: 0.3,
      max_tokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Groq API: ${response.status}. ${errBody.slice(0, 200)}`);
  }
  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

/** Chama a OpenAI e retorna o texto gerado (pago). */
async function gerarTextoComOpenAI(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  max_tokens: number,
): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`OpenAI API: ${response.status}. ${errBody.slice(0, 200)}`);
  }
  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

/** Totais da planilha no payload (mensal / trimestral / anual). */
function totaisPlanilhaDoPayload(
  payload: Record<string, unknown>,
  entradas: Record<string, unknown> | undefined,
  saidas: Record<string, unknown> | undefined,
  lucroObj: Record<string, unknown> | undefined,
  cg: Record<string, unknown> | undefined,
): { ent: number | null; sai: number | null; luc: number | null } {
  const tp = cg?.totais_planilha as
    | { entradas_reais?: number | null; saidas_reais?: number | null; lucro_reais?: number | null }
    | undefined;
  if (tp && (tp.entradas_reais != null || tp.saidas_reais != null || tp.lucro_reais != null)) {
    return {
      ent: tp.entradas_reais ?? null,
      sai: tp.saidas_reais ?? null,
      luc: tp.lucro_reais ?? null,
    };
  }
  const entP = typeof entradas?.total_planilha === 'number' ? (entradas.total_planilha as number) : null;
  const saiP = typeof saidas?.total_planilha === 'number' ? (saidas.total_planilha as number) : null;
  const lucP =
    lucroObj && typeof lucroObj.valor_planilha === 'number'
      ? (lucroObj.valor_planilha as number)
      : lucroObj && typeof lucroObj.total_planilha === 'number'
        ? (lucroObj.total_planilha as number)
        : null;
  return { ent: entP, sai: saiP, luc: lucP };
}

/** Formata seções da planilha CONTROLE para o fallback em linguagem de gestão. */
function textoSecaoControleGestaoFallback(
  cg: Record<string, unknown> | undefined,
  fmt: (n: number) => string,
): string {
  if (!cg || typeof cg !== 'object') return '';
  const ent = cg.entradas_linha_a_linha as
    | { secao?: string; descricao: string; valor_reais: number }[]
    | undefined;
  const sai = cg.saidas_por_categoria as
    | { categoria: string; descricao?: string; valor_reais: number }[]
    | undefined;
  const gf = cg.gastos_fixos_linha_a_linha as { descricao: string; valor_reais: number }[] | undefined;

  const saiSemFixas = (sai ?? []).filter((x) => x.categoria !== 'Saídas Fixas');
  const linhasFixas: { descricao: string; valor_reais: number }[] =
    gf && gf.length > 0
      ? gf.map((x) => ({ descricao: x.descricao, valor_reais: x.valor_reais }))
      : (sai ?? [])
          .filter((x) => x.categoria === 'Saídas Fixas')
          .map((x) => ({
            descricao: (x.descricao ?? '').trim() || 'Item',
            valor_reais: x.valor_reais,
          }));

  let out = '';
  out += '## Entradas na planilha CONTROLE de caixa (linha a linha)\n';
  if (ent?.length) {
    out += `${ent
      .map((x) => `- ${x.secao ? `${x.secao} — ` : ''}${x.descricao}: ${fmt(x.valor_reais)}`)
      .join('\n')}\n\n`;
  } else out += '- Não há linhas de entrada detalhadas na planilha para este período.\n\n';

  out += '## Saídas na planilha CONTROLE — por categoria\n';
  if (saiSemFixas.length > 0) {
    out += `${saiSemFixas
      .map((x) => `- [${x.categoria}] ${x.descricao ?? ''}: ${fmt(x.valor_reais)}`)
      .join('\n')}\n\n`;
  } else if (!linhasFixas.length) {
    out += '- Não há saídas por categoria detalhadas na planilha para este período.\n\n';
  } else {
    out += '- (Somente o bloco de gastos fixos neste período — detalhe abaixo.)\n\n';
  }

  out += '### Gastos fixos (bloco Saídas Fixas — mesma coisa que “gastos fixos”; listado uma vez)\n';
  if (linhasFixas.length > 0) {
    out += `${linhasFixas.map((x) => `- ${x.descricao}: ${fmt(x.valor_reais)}`).join('\n')}\n\n`;
  } else {
    out += '- Não há linhas de gastos fixos (Saídas Fixas) neste período.\n\n';
  }
  return out;
}

/** Gera um relatório em texto a partir do payload (fallback quando nenhuma API de IA está disponível). Mantém o mesmo formato simples dos prompts. */
function gerarTextoFallback(payload: Record<string, unknown>, isDiario: boolean): string {
  const tipo = (payload.tipo as string) ?? 'mensal';
  const periodo = (payload.periodo_label as string) ?? (payload.data as string) ?? '';
  const fmt = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

  if (tipo === 'mensal_operacional') {
    const r = payload.resumo_financeiro_oficial as Record<string, unknown> | undefined;
    const e = typeof r?.entradas === 'number' ? r.entradas : 0;
    const s = typeof r?.saidas === 'number' ? r.saidas : 0;
    const sal = typeof r?.saldo === 'number' ? r.saldo : e - s;
    const cg = payload.controle_caixa_leitura_gestao as Record<string, unknown> | undefined;
    const pc = payload.planilha_controle_caixa as
      | { entrada_total?: number | null; saida_total?: number | null; lucro_total?: number | null }
      | undefined;
    const blocoControle = textoSecaoControleGestaoFallback(cg, fmt);
    const linhaPlanilha =
      pc && (pc.entrada_total != null || pc.saida_total != null || pc.lucro_total != null)
        ? `**Planilha CONTROLE:** entradas ${pc.entrada_total != null ? fmt(pc.entrada_total) : '—'}, saídas ${pc.saida_total != null ? fmt(pc.saida_total) : '—'}, lucro ${pc.lucro_total != null ? fmt(pc.lucro_total) : '—'}.\n\n`
        : `**Planilha CONTROLE:** totais não disponíveis no payload.\n\n`;
    return (
      `Relatório operacional mensal - ${periodo}\n\n` +
      `## Visão geral financeira\n` +
      `**Extrato oficial (banco):** entradas ${fmt(e)}, saídas ${fmt(s)}, saldo ${fmt(sal)}.\n` +
      linhaPlanilha +
      blocoControle +
      `## Receita por modalidade (resumo)\n` +
      `- Confira no painel os valores por modalidade quando precisar do detalhe.\n`
    );
  }
  if (tipo === 'alunos_panorama') {
    const t = payload.totais as Record<string, unknown> | undefined;
    const n =
      typeof t?.total_alunos_ativos === 'number'
        ? t.total_alunos_ativos
        : typeof t?.total_alunos_cadastrados_abas === 'number'
          ? t.total_alunos_cadastrados_abas
          : 0;
    const totalM =
      typeof t?.total_mensalidade_competencia === 'number' ? fmt(t.total_mensalidade_competencia as number) : '—';
    const fd = payload.fonte_dados as { planilha?: string; descricao?: string } | undefined;
    const comp = payload.competencia as { label?: string } | undefined;
    const linhas: string[] = [];
    linhas.push(`# Panorama de alunos ativos — ${comp?.label ?? periodo}`);
    linhas.push('');
    linhas.push(`## Fonte dos dados`);
    linhas.push(
      `- Planilha: **${fd?.planilha ?? 'FLUXO DE CAIXA BYLA'}** (Google Sheets). ${fd?.descricao ?? ''}`.trim(),
    );
    linhas.push(`- Competência do relatório: ${comp?.label ?? periodo}.`);
    linhas.push('');
    linhas.push(`## Resumo`);
    linhas.push(`- Alunos ativos (todas as abas): ${n}.`);
    linhas.push(`- Total de mensalidade na competência (soma por aba/modalidade): ${totalM}.`);
    linhas.push('');
    const porAba = (payload.por_aba as
      | {
          aba: string;
          total_alunos_ativos?: number;
          total_mensalidade_competencia?: number;
          por_modalidade?: {
            modalidade: string;
            alunos_ativos?: number;
            total_mensalidade_competencia?: number;
          }[];
        }[]
      | undefined) ?? [];
    for (const bloco of porAba) {
      linhas.push(`## Aba ${bloco.aba}`);
      const ta = typeof bloco.total_alunos_ativos === 'number' ? bloco.total_alunos_ativos : 0;
      const tm =
        typeof bloco.total_mensalidade_competencia === 'number' ? fmt(bloco.total_mensalidade_competencia) : '—';
      linhas.push(`- Alunos ativos nesta aba: ${ta}. Mensalidade na competência: ${tm}.`);
      for (const pm of bloco.por_modalidade ?? []) {
        const q = typeof pm.alunos_ativos === 'number' ? pm.alunos_ativos : 0;
        const v =
          typeof pm.total_mensalidade_competencia === 'number' ? fmt(pm.total_mensalidade_competencia) : '—';
        linhas.push(`  - **${pm.modalidade}**: ${q} aluno(s); mensalidade na competência: ${v}.`);
      }
      linhas.push('');
    }
    return linhas.join('\n');
  }
  if (tipo === 'alunos_inadimplencia_mes') {
    const kpis = payload.kpis as Record<string, unknown> | undefined;
    const n = typeof kpis?.inadimplencia_lista === 'number' ? kpis.inadimplencia_lista : 0;
    return (
      `Inadimplência / sem pagamento - ${periodo}\n\n` +
      `Itens em aberto ou sem pagamento na competência (lista): ${n}. Ver JSON para nomes e situações.\n`
    );
  }

  const entradas = payload.entradas as Record<string, unknown> | undefined;
  const saidas = payload.saidas as Record<string, unknown> | undefined;
  const entTotal = entradas && typeof entradas.total === 'number' ? entradas.total : (entradas?.total_oficial as number) ?? 0;
  const saiTotal = saidas && typeof saidas.total === 'number' ? saidas.total : (saidas?.total_oficial as number) ?? 0;
  const lucroObj = payload.lucro as Record<string, unknown> | undefined;
  const lucro =
    typeof lucroObj === 'object' && lucroObj
      ? (typeof lucroObj.total_oficial === 'number'
          ? lucroObj.total_oficial
          : typeof lucroObj.valor === 'number'
            ? lucroObj.valor
            : entTotal - saiTotal)
      : entTotal - saiTotal;

  if (isDiario) {
    return (
      `Resumo do dia - ${periodo}\n\n` +
      `## Visão geral financeira\n` +
      `O dia fechou com entradas de ${fmt(entTotal)} e saídas de ${fmt(saiTotal)}, saldo ${fmt(lucro)} (extrato oficial).\n\n` +
      `## Entradas\n` +
      `- Total de entradas do dia: ${fmt(entTotal)}.\n\n` +
      `## Saídas\n` +
      `- Total de saídas do dia: ${fmt(saiTotal)}.\n\n` +
      `## Observação\n` +
      `- O relatório diário usa só o extrato do dia; o detalhamento como na planilha CONTROLE de caixa (visão mensal) não se aplica a um único dia.`
    );
  }
  const cg = payload.controle_caixa_leitura_gestao as Record<string, unknown> | undefined;
  const blocoPlanilha =
    textoSecaoControleGestaoFallback(cg, fmt) ||
    (() => {
      const porFonte = (entradas as { por_fonte_planilha?: { label: string; valor: number }[] } | undefined)
        ?.por_fonte_planilha;
      const porBloco = (saidas as { por_bloco_planilha?: { nome: string; total: number }[] } | undefined)
        ?.por_bloco_planilha;
      const gf = (payload.destaques as { gastos_fixos_itens?: { label: string; valor: number }[] } | undefined)
        ?.gastos_fixos_itens;
      let out = '';
      out += '## Entradas na planilha CONTROLE de caixa (linha a linha)\n';
      if (porFonte?.length) out += `${porFonte.map((x) => `- ${x.label}: ${fmt(x.valor)}`).join('\n')}\n\n`;
      else out += '- Não há linhas de entrada detalhadas na planilha para este período.\n\n';
      const blocosSemFixas = (porBloco ?? []).filter((x) => x.nome !== 'Saídas Fixas');
      const blocoFixas = (porBloco ?? []).find((x) => x.nome === 'Saídas Fixas');
      out += '## Saídas na planilha CONTROLE — por categoria\n';
      if (blocosSemFixas.length) {
        out += `${blocosSemFixas.map((x) => `- ${x.nome}: ${fmt(x.total)}`).join('\n')}\n\n`;
      } else if (!blocoFixas && !gf?.length) {
        out += '- Não há saídas por categoria detalhadas na planilha para este período.\n\n';
      }
      out += '### Gastos fixos (bloco Saídas Fixas — mesma coisa que gastos fixos; listado uma vez)\n';
      if (gf?.length) out += `${gf.map((x) => `- ${x.label}: ${fmt(x.valor)}`).join('\n')}\n\n`;
      else if (blocoFixas) out += `- Total do bloco Saídas Fixas: ${fmt(blocoFixas.total)} (sem detalhe linha a linha neste recorte).\n\n`;
      else out += '- Não há itens de gastos fixos listados para este período.\n\n';
      return out;
    })();

  const tp = totaisPlanilhaDoPayload(
    payload,
    entradas,
    saidas,
    lucroObj as Record<string, unknown> | undefined,
    cg,
  );
  const linhaVisaoPlanilha =
    tp.ent != null || tp.sai != null || tp.luc != null
      ? `**Planilha CONTROLE:** entradas ${tp.ent != null ? fmt(tp.ent) : '—'}, saídas ${tp.sai != null ? fmt(tp.sai) : '—'}, lucro ${tp.luc != null ? fmt(tp.luc) : '—'}.\n\n`
      : `**Planilha CONTROLE:** totais não disponíveis neste recorte.\n\n`;

  return (
    `Relatório ${tipo} - ${periodo}\n\n` +
    `## Visão geral financeira\n` +
    `**Extrato oficial (banco):** entradas ${fmt(entTotal)}, saídas ${fmt(saiTotal)}, saldo ou lucro ${fmt(lucro)}.\n` +
    linhaVisaoPlanilha +
    blocoPlanilha +
    `## Lucro e comparativos\n` +
    `- Extrato oficial: ${fmt(lucro)}.\n` +
    `- Planilha CONTROLE: ${tp.luc != null ? fmt(tp.luc) : '—'}.\n\n`
  );
}

/**
 * Rotas /api/relatorios/* (dados estruturados + geração de texto por IA).
 * Montadas em /api pelo router principal.
 */
export function createRelatoriosRouter(fluxoUseCase: GetFluxoCompletoUseCase): Router {
  const router = Router();

  /** GET /api/relatorios/diario?data=2026-03-10 – Dados estruturados do dia (entradas/saídas) para relatório/IA. */
  router.get('/relatorios/diario', async (req: Request, res: Response) => {
    try {
      const dq = parseQuery(dataIsoQuerySchema, req.query as Record<string, unknown>);
      if (!dq.ok) {
        return res.status(400).json({ error: dq.message });
      }
      const dataStr = dq.data.data.trim();
      const supabase = getSupabase();
      if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });

      const { data: rows, error } = await supabase
        .from('transacoes')
        .select('id, data, pessoa, valor, descricao, tipo')
        .eq('data', dataStr)
        .order('id', { ascending: false });

      if (error) return res.status(502).json({ error: error.message });
      const todas = (rows ?? []) as { id: string; data: string; pessoa: string; valor: number; descricao: string | null; tipo: string }[];
      const { entradas: entradasList, saidas: saidasList } = filtrarTransacoesOficiais(todas);

      const totalEntradas = entradasList.reduce((s, r) => s + Number(r.valor || 0), 0);
      const totalSaidas = saidasList.reduce((s, r) => s + Number(r.valor || 0), 0);
      const LIMITE_ITENS = 15;
      const mapLinha = (r: (typeof entradasList)[0]) => ({
        pessoa: r.pessoa ?? '',
        valor: Number(r.valor || 0),
        descricao: (r.descricao ?? '').slice(0, 80),
      });
      const entradasSort = [...entradasList].sort((a, b) => Number(b.valor || 0) - Number(a.valor || 0));
      const saidasSort = [...saidasList].sort((a, b) => Number(b.valor || 0) - Number(a.valor || 0));
      const itensDestaqueEntradas = entradasSort.slice(0, LIMITE_ITENS).map(mapLinha);
      const itensDestaqueSaidas = saidasSort.slice(0, LIMITE_ITENS).map(mapLinha);
      const itensResumoEntradas = itensDestaqueEntradas;
      const itensResumoSaidas = itensDestaqueSaidas;
      const [d, m, a] = dataStr.split('-');
      const periodoLabel = `${d}/${m}/${a}`;

      res.json({
        tipo: 'diario',
        data: dataStr,
        periodo_label: periodoLabel,
        entradas: {
          total: totalEntradas,
          quantidade: entradasList.length,
          itens_resumo: itensResumoEntradas,
          itens_destaque: itensDestaqueEntradas,
          mais_itens: Math.max(0, entradasList.length - LIMITE_ITENS),
          limite_itens: LIMITE_ITENS,
          truncado: entradasList.length > LIMITE_ITENS,
        },
        saidas: {
          total: totalSaidas,
          quantidade: saidasList.length,
          itens_resumo: itensResumoSaidas,
          itens_destaque: itensDestaqueSaidas,
          mais_itens: Math.max(0, saidasList.length - LIMITE_ITENS),
          limite_itens: LIMITE_ITENS,
          truncado: saidasList.length > LIMITE_ITENS,
        },
        saldo_dia: totalEntradas - totalSaidas,
        origem_dados: { entradas: 'banco', saidas: 'banco' },
        fontes: { origem: 'transacoes (Supabase)', legenda: 'banco = extrato oficial filtrado (transacoes)' },
      });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  /** GET /api/relatorios/mensal?mes=3&ano=2026 – Dados estruturados do mês para relatório/IA. */
  router.get('/relatorios/mensal', async (req: Request, res: Response) => {
    try {
      const mq = parseQuery(mesAnoQuerySchema, req.query as Record<string, unknown>);
      if (!mq.ok) {
        return res.status(400).json({ error: mq.message });
      }
      const { mes, ano } = mq.data;
      const resumos = await getResumoMensalSupabase([{ mes, ano }, mesAnterior(mes, ano)]);
      const resumoAtual = resumos.find((r) => r.mes === mes && r.ano === ano);
      const resumoAnt = resumos.find((r) => r.mes === mesAnterior(mes, ano).mes && r.ano === mesAnterior(mes, ano).ano);

      const fluxo = await fluxoUseCase.execute(mes, ano);
      const comb = fluxo.combinado;
      const porFonteEntradas = flattenEntradasPorFontePlanilha(comb.entradasBlocos);
      const porBlocoSaidas = totaisAgregadosPorBlocoSaida(comb.saidasBlocos);
      const gastosFixosItens = linhasGastosFixosDeSaidasBlocos(comb.saidasBlocos)
        .slice(0, 15)
        .map((l) => ({
          label: l.label,
          valor: Math.abs(l.valorNum ?? parseValor(l.valor) ?? 0),
        }));

      const totalEntradaPlanilha = comb.entradaTotal ?? porFonteEntradas.reduce((s, x) => s + x.valor, 0);
      const totalSaidaPlanilha = comb.saidaTotal ?? porBlocoSaidas.reduce((s, x) => s + x.total, 0);
      const lucroPlanilha = comb.lucroTotal ?? (totalEntradaPlanilha - totalSaidaPlanilha);

      const totalOficialEntradas = resumoAtual?.total_entradas ?? 0;
      const totalOficialSaidas = resumoAtual?.total_saidas ?? 0;
      const saldoOficial = resumoAtual?.saldo_mes ?? totalOficialEntradas - totalOficialSaidas;
      const lucroMesAnterior = resumoAnt?.saldo_mes ?? null;

      const deltaEntrada = lucroMesAnterior !== null && resumoAnt ? totalOficialEntradas - resumoAnt.total_entradas : null;
      const deltaSaida = lucroMesAnterior !== null && resumoAnt ? totalOficialSaidas - resumoAnt.total_saidas : null;
      const deltaLucro = lucroMesAnterior !== null ? saldoOficial - lucroMesAnterior : null;

      const tol = Math.max(1, Math.round((totalOficialEntradas + totalOficialSaidas) * 0.002));
      const divEntrada = totalEntradaPlanilha ? Math.abs(totalOficialEntradas - totalEntradaPlanilha) : 0;
      const divSaida = totalSaidaPlanilha ? Math.abs(totalOficialSaidas - totalSaidaPlanilha) : 0;
      const alertas_divergencia =
        totalEntradaPlanilha && divEntrada > tol
          ? [{ bloco: 'entradas', delta_absoluto: divEntrada, fonte_a: 'banco', fonte_b: 'planilha' }]
          : [];
      if (totalSaidaPlanilha && divSaida > tol) {
        alertas_divergencia.push({ bloco: 'saidas', delta_absoluto: divSaida, fonte_a: 'banco', fonte_b: 'planilha' });
      }

      res.json({
        tipo: 'mensal',
        mes,
        ano,
        periodo_label: `${MESES_NOMES[mes] ?? ''} de ${ano}`,
        entradas: {
          total_oficial: totalOficialEntradas,
          total_planilha: totalEntradaPlanilha || null,
          fonte_total_oficial: 'banco',
          fonte_total_planilha: 'planilha',
          por_fonte_planilha: porFonteEntradas.length ? porFonteEntradas : undefined,
          comparacao_mes_anterior: resumoAnt
            ? {
                total_anterior: resumoAnt.total_entradas,
                delta_absoluto: deltaEntrada ?? 0,
                delta_percentual: resumoAnt.total_entradas ? Math.round(((deltaEntrada ?? 0) / resumoAnt.total_entradas) * 10000) / 100 : 0,
              }
            : null,
        },
        saidas: {
          total_oficial: totalOficialSaidas,
          total_planilha: totalSaidaPlanilha || null,
          fonte_total_oficial: 'banco',
          fonte_total_planilha: 'planilha',
          por_bloco_planilha: porBlocoSaidas.length ? porBlocoSaidas : undefined,
          comparacao_mes_anterior: resumoAnt
            ? {
                total_anterior: resumoAnt.total_saidas,
                delta_absoluto: deltaSaida ?? 0,
                delta_percentual: resumoAnt.total_saidas ? Math.round(((deltaSaida ?? 0) / resumoAnt.total_saidas) * 10000) / 100 : 0,
              }
            : null,
        },
        lucro: {
          valor: saldoOficial,
          valor_planilha: lucroPlanilha ?? null,
          fonte_valor: 'banco',
          fonte_valor_planilha: 'planilha',
          lucro_mes_anterior: lucroMesAnterior,
          delta_absoluto: deltaLucro ?? null,
          delta_percentual:
            lucroMesAnterior != null && lucroMesAnterior !== 0
              ? Math.round(((deltaLucro ?? 0) / lucroMesAnterior) * 10000) / 100
              : null,
        },
        destaques: {
          categorias_maior_despesa: porBlocoSaidas.slice(0, 5),
          gastos_fixos_itens: gastosFixosItens.slice(0, 15),
        },
        controle_caixa_leitura_gestao: montarControleCaixaLeituraGestao(comb.entradasBlocos, comb.saidasBlocos, comb.aba ?? null, {
          entrada: totalEntradaPlanilha || null,
          saida: totalSaidaPlanilha || null,
          lucro: lucroPlanilha ?? null,
        }),
        alertas_divergencia: alertas_divergencia.length ? alertas_divergencia : undefined,
        fontes: {
          resumo_oficial_origem: 'v_resumo_mensal_oficial',
          planilha_origem: 'CONTROLE DE CAIXA',
          aba_planilha: comb.aba ?? null,
          legenda: { banco: 'Supabase (views/transações oficiais)', planilha: 'CONTROLE DE CAIXA', sistema: 'comparativo e divergências' },
          por_secao: {
            entradas_total_oficial: 'banco',
            entradas_detalhe_planilha: 'planilha',
            saidas_total_oficial: 'banco',
            saidas_detalhe_planilha: 'planilha',
            lucro: 'sistema',
            comparativo_mes_anterior: 'sistema',
          },
        },
      });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  /** GET /api/relatorios/trimestral?trimestre=1&ano=2026 */
  router.get('/relatorios/trimestral', async (req: Request, res: Response) => {
    try {
      const tq = parseQuery(trimestreAnoQuerySchema, req.query as Record<string, unknown>);
      if (!tq.ok) {
        return res.status(400).json({ error: tq.message });
      }
      const { trimestre, ano } = tq.data;
      const meses = mesesDoTrimestre(trimestre);
      const mesAnos = meses.map((m) => ({ mes: m, ano }));
      const resumos = await getResumoMensalSupabase(mesAnos);
      const prevAno = trimestre === 1 ? ano - 1 : ano;
      const prevMeses = trimestre === 1 ? [10, 11, 12] : meses.map((m) => m - 3);
      const resumoTrimestreAnterior = await getResumoMensalSupabase(prevMeses.map((m) => ({ mes: m, ano: prevAno })));

      let totalEntradas = 0;
      let totalSaidas = 0;
      const porMes: { mes: number; ano: number; total_entradas: number; total_saidas: number; saldo: number }[] = [];
      for (const r of resumos) {
        totalEntradas += r.total_entradas ?? 0;
        totalSaidas += r.total_saidas ?? 0;
        porMes.push({
          mes: r.mes,
          ano: r.ano,
          total_entradas: r.total_entradas,
          total_saidas: r.total_saidas,
          saldo: r.saldo_mes ?? r.total_entradas - r.total_saidas,
        });
      }
      porMes.sort((a, b) => a.mes - b.mes);

      let totalPlanilhaEntradas = 0;
      let totalPlanilhaSaidas = 0;
      for (const m of meses) {
        const f = await fluxoUseCase.execute(m, ano);
        totalPlanilhaEntradas += f.combinado.entradaTotal ?? 0;
        totalPlanilhaSaidas += f.combinado.saidaTotal ?? 0;
      }

      const totalAntEntradas = resumoTrimestreAnterior.reduce((s, r) => s + (r.total_entradas ?? 0), 0);
      const totalAntSaidas = resumoTrimestreAnterior.reduce((s, r) => s + (r.total_saidas ?? 0), 0);
      const totalAntSaldo = resumoTrimestreAnterior.reduce((s, r) => s + (r.saldo_mes ?? 0), 0);

      res.json({
        tipo: 'trimestral',
        trimestre,
        ano,
        periodo_label: `${trimestre}º trimestre de ${ano} (${MESES_NOMES[meses[0]]}–${MESES_NOMES[meses[2]]})`,
        meses,
        entradas: {
          total_oficial: totalEntradas,
          total_planilha: totalPlanilhaEntradas || null,
          media_mensal_oficial: meses.length ? Math.round((totalEntradas / meses.length) * 100) / 100 : 0,
          comparacao_trimestre_anterior: {
            total_anterior: totalAntEntradas,
            delta_absoluto: totalEntradas - totalAntEntradas,
            delta_percentual: totalAntEntradas ? Math.round(((totalEntradas - totalAntEntradas) / totalAntEntradas) * 10000) / 100 : 0,
          },
        },
        saidas: {
          total_oficial: totalSaidas,
          total_planilha: totalPlanilhaSaidas || null,
          media_mensal_oficial: meses.length ? Math.round((totalSaidas / meses.length) * 100) / 100 : 0,
          comparacao_trimestre_anterior: {
            total_anterior: totalAntSaidas,
            delta_absoluto: totalSaidas - totalAntSaidas,
            delta_percentual: totalAntSaidas ? Math.round(((totalSaidas - totalAntSaidas) / totalAntSaidas) * 10000) / 100 : 0,
          },
        },
        lucro: {
          total_oficial: totalEntradas - totalSaidas,
          total_planilha: totalPlanilhaEntradas && totalPlanilhaSaidas ? totalPlanilhaEntradas - totalPlanilhaSaidas : null,
          media_mensal: meses.length ? Math.round((totalEntradas - totalSaidas) / meses.length * 100) / 100 : 0,
          comparacao_trimestre_anterior: {
            total_anterior: totalAntSaldo,
            delta_absoluto: totalEntradas - totalSaidas - totalAntSaldo,
            delta_percentual: totalAntSaldo ? Math.round(((totalEntradas - totalSaidas - totalAntSaldo) / totalAntSaldo) * 10000) / 100 : 0,
          },
        },
        por_mes: porMes,
        fontes: {
          resumo_oficial_origem: 'v_resumo_mensal_oficial',
          planilha_origem: 'CONTROLE DE CAIXA',
        },
      });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  /** GET /api/relatorios/anual?ano=2026 */
  router.get('/relatorios/anual', async (req: Request, res: Response) => {
    try {
      const aq = parseQuery(anoQuerySchema, req.query as Record<string, unknown>);
      if (!aq.ok) {
        return res.status(400).json({ error: aq.message });
      }
      const { ano } = aq.data;
      const meses = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
      const mesAnos = meses.map((m) => ({ mes: m, ano }));
      const resumos = await getResumoMensalSupabase(mesAnos);
      const resumosAnoAnterior = await getResumoMensalSupabase(meses.map((m) => ({ mes: m, ano: ano - 1 })));

      let totalEntradas = 0;
      let totalSaidas = 0;
      const porMes: { mes: number; ano: number; total_entradas: number; total_saidas: number; saldo: number }[] = [];
      for (const r of resumos) {
        totalEntradas += r.total_entradas ?? 0;
        totalSaidas += r.total_saidas ?? 0;
        porMes.push({
          mes: r.mes,
          ano: r.ano,
          total_entradas: r.total_entradas,
          total_saidas: r.total_saidas,
          saldo: r.saldo_mes ?? r.total_entradas - r.total_saidas,
        });
      }
      porMes.sort((a, b) => a.mes - b.mes);

      let totalPlanilhaEntradas = 0;
      let totalPlanilhaSaidas = 0;
      for (const m of meses) {
        const f = await fluxoUseCase.execute(m, ano);
        totalPlanilhaEntradas += f.combinado.entradaTotal ?? 0;
        totalPlanilhaSaidas += f.combinado.saidaTotal ?? 0;
      }

      const totalAntEntradas = resumosAnoAnterior.reduce((s, r) => s + (r.total_entradas ?? 0), 0);
      const totalAntSaidas = resumosAnoAnterior.reduce((s, r) => s + (r.total_saidas ?? 0), 0);
      const totalAntSaldo = resumosAnoAnterior.reduce((s, r) => s + (r.saldo_mes ?? 0), 0);

      res.json({
        tipo: 'anual',
        ano,
        periodo_label: `Ano ${ano}`,
        entradas: {
          total_oficial: totalEntradas,
          total_planilha: totalPlanilhaEntradas || null,
          media_mensal_oficial: totalEntradas ? Math.round((totalEntradas / 12) * 100) / 100 : 0,
          comparacao_ano_anterior: {
            total_anterior: totalAntEntradas,
            delta_absoluto: totalEntradas - totalAntEntradas,
            delta_percentual: totalAntEntradas ? Math.round(((totalEntradas - totalAntEntradas) / totalAntEntradas) * 10000) / 100 : 0,
          },
        },
        saidas: {
          total_oficial: totalSaidas,
          total_planilha: totalPlanilhaSaidas || null,
          media_mensal_oficial: totalSaidas ? Math.round((totalSaidas / 12) * 100) / 100 : 0,
          comparacao_ano_anterior: {
            total_anterior: totalAntSaidas,
            delta_absoluto: totalSaidas - totalAntSaidas,
            delta_percentual: totalAntSaidas ? Math.round(((totalSaidas - totalAntSaidas) / totalAntSaidas) * 10000) / 100 : 0,
          },
        },
        lucro: {
          total_oficial: totalEntradas - totalSaidas,
          total_planilha: totalPlanilhaEntradas && totalPlanilhaSaidas ? totalPlanilhaEntradas - totalPlanilhaSaidas : null,
          media_mensal: totalEntradas - totalSaidas ? Math.round(((totalEntradas - totalSaidas) / 12) * 100) / 100 : 0,
          comparacao_ano_anterior: {
            total_anterior: totalAntSaldo,
            delta_absoluto: totalEntradas - totalSaidas - totalAntSaldo,
            delta_percentual: totalAntSaldo ? Math.round(((totalEntradas - totalSaidas - totalAntSaldo) / totalAntSaldo) * 10000) / 100 : 0,
          },
        },
        por_mes: porMes,
        fontes: {
          resumo_oficial_origem: 'v_resumo_mensal_oficial',
          planilha_origem: 'CONTROLE DE CAIXA',
        },
      });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  /** GET /api/relatorios/mensal-operacional?mes=&ano= — R2: panorama operacional do mês (planilha + banco). */
  router.get('/relatorios/mensal-operacional', async (req: Request, res: Response) => {
    try {
      const mq = parseQuery(mesAnoQuerySchema, req.query as Record<string, unknown>);
      if (!mq.ok) {
        return res.status(400).json({ error: mq.message });
      }
      const { mes, ano } = mq.data;
      const resumos = await getResumoMensalSupabase([{ mes, ano }]);
      const resumoAtual = resumos.find((r) => r.mes === mes && r.ano === ano);
      const totalOficialEntradas = resumoAtual?.total_entradas ?? 0;
      const totalOficialSaidas = resumoAtual?.total_saidas ?? 0;
      const saldoOficial = resumoAtual?.saldo_mes ?? totalOficialEntradas - totalOficialSaidas;

      const fluxo = await fluxoUseCase.execute(mes, ano);
      const comb = fluxo.combinado;

      const payload = await montarMensalOperacional(mes, ano, fluxo, {
        totalOficialEntradas,
        totalOficialSaidas,
        totalOficialSaldo: saldoOficial,
      });
      res.json(payload);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  /** GET /api/relatorios/alunos-panorama?ano=&mes= — R4: totais por aba/modalidade (planilha). */
  router.get('/relatorios/alunos-panorama', async (req: Request, res: Response) => {
    try {
      const mq = parseQuery(mesAnoQuerySchema, req.query as Record<string, unknown>);
      if (!mq.ok) {
        return res.status(400).json({ error: mq.message });
      }
      const { mes, ano } = mq.data;
      const payload = await montarAlunosPanorama(ano, mes);
      res.json(payload);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  /** GET /api/relatorios/alunos-inadimplencia?mes=&ano= — R5: competência sem pagamento + KPIs (sistema + planilha + banco). */
  router.get('/relatorios/alunos-inadimplencia', async (req: Request, res: Response) => {
    try {
      const mq = parseQuery(mesAnoQuerySchema, req.query as Record<string, unknown>);
      if (!mq.ok) {
        return res.status(400).json({ error: mq.message });
      }
      const { mes, ano } = mq.data;
      let raw;
      try {
        raw = await getConciliacaoVencimentosMesData(mes, ano);
      } catch (err) {
        if (err instanceof ConciliacaoVencimentosMesError) {
          return res.status(err.statusCode).json({ error: err.message, ...(err.body ?? {}) });
        }
        throw err;
      }
      if ('aviso' in raw) {
        return res.json({
          tipo: 'alunos_inadimplencia_mes',
          mes,
          ano,
          aviso: raw.aviso,
          kpis: null,
          itens: [],
          fontes: { principal: 'sistema', legenda: 'banco / planilha / sistema — ver RELATORIOS_IA_ARQUITETURA_EXPANSAO.md' },
        });
      }
      const inad = raw.itens.filter(
        (i) =>
          !i.pago_na_planilha && (i.situacao === 'em_aberto' || i.situacao === 'a_vencer' || i.situacao === 'sem_vencimento'),
      );
      res.json({
        tipo: 'alunos_inadimplencia_mes',
        mes,
        ano,
        periodo_label: `${MESES_NOMES[mes] ?? ''} de ${ano}`,
        tolerancia_dias: raw.tolerancia_dias,
        hoje_referencia: raw.hoje,
        kpis: {
          ...raw.kpis,
          inadimplencia_lista: inad.length,
        },
        itens: inad.slice(0, 120),
        lista_truncada: inad.length > 120,
        total_inad_itens: inad.length,
        fontes: {
          regra: 'Conciliação de vencimentos (planilha) + match banco quando pago na planilha',
          legenda: { banco: 'extrato após match', planilha: 'pagamentos por competência', sistema: 'vencimento e situação' },
        },
      });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  /** GET /api/relatorios/ia-status – Indica se a IA está configurada (para exibir botão/hint no front). */
  router.get('/relatorios/ia-status', (_req: Request, res: Response) => {
    const gemini = !!config.geminiApiKey;
    const groq = !!config.groqApiKey;
    const openai = !!config.openaiApiKey;
    const provider = gemini ? 'gemini' : groq ? 'groq' : openai ? 'openai' : null;
    res.json({ configured: gemini || groq || openai, provider });
  });

  /** POST /api/relatorios/gerar-texto-ia – Gera texto do relatório. Ordem: Gemini → Groq → OpenAI; se todos falharem, usa relatório em texto (fallback). */
  router.post('/relatorios/gerar-texto-ia', async (req: Request, res: Response) => {
    try {
      const body = parseBody(gerarTextoIaBodySchema, req.body);
      if (!body.ok) {
        return res.status(400).json({ error: body.message, texto: null });
      }
      const { payload } = body.data;
      const tipo = (payload.tipo as string) ?? 'mensal';
      const fmt = (raw: string) => formatarTextoRelatorio(raw, tipo);
      const isDiario = tipo === 'diario';
      const systemPrompt = getSystemPromptForTipo(tipo);
      const userPrompt = buildUserPromptRelatorio(tipo, payload as Record<string, unknown>);
      const maxTok = maxOutputTokensRelatorio(tipo);

      let texto = '';
      const geminiKey = config.geminiApiKey;
      const groqKey = config.groqApiKey;
      const openaiKey = config.openaiApiKey;

      if (geminiKey) {
        try {
          texto = await gerarTextoComGemini(systemPrompt, userPrompt, geminiKey, maxTok);
          if (texto) {
            res.json({ texto: fmt(texto) });
            return;
          }
        } catch {
          // segue para Groq ou OpenAI
        }
      }

      if (groqKey) {
        try {
          texto = await gerarTextoComGroq(systemPrompt, userPrompt, groqKey, maxTok);
          if (texto) {
            res.json({ texto: fmt(texto) });
            return;
          }
        } catch {
          // segue para OpenAI ou fallback
        }
      }

      if (openaiKey) {
        try {
          texto = await gerarTextoComOpenAI(systemPrompt, userPrompt, openaiKey, maxTok);
          if (texto) {
            res.json({ texto: fmt(texto) });
            return;
          }
        } catch {
          // segue para fallback
        }
      }

      texto = gerarTextoFallback(payload as Record<string, unknown>, isDiario);
      res.json({ texto: fmt(texto) });
    } catch (e) {
      res.status(500).json({
        error: e instanceof Error ? e.message : String(e),
        texto: null,
      });
    }
  });

  return router;
}
