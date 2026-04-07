import { useState, useEffect, type ReactNode } from 'react';
import { Topbar } from '../app/Topbar';
import {
  getRelatorioDiario,
  getRelatorioMensal,
  getRelatorioTrimestral,
  getRelatorioAnual,
  getRelatorioMensalOperacional,
  getRelatorioAlunosPanorama,
  getRelatorioAlunosInadimplencia,
  gerarTextoRelatorioIA,
  getRelatoriosIAStatus,
  type RelatorioPayload,
  type RelatorioDiarioPayload,
  type RelatorioMensalPayload,
  type RelatorioTrimestralPayload,
  type RelatorioAnualPayload,
  type RelatorioMensalOperacionalPayload,
  type RelatorioAlunosPanoramaPayload,
  type RelatorioAlunosInadimplenciaPayload,
  type ControleCaixaLeituraGestao,
} from '../services/backendApi';

/** Renderiza texto de relatório com headings e listas simples (## / -), sem depender de markdown completo. */
function RelatorioTextoIaView({ text }: { text: string }) {
  const lines = text.split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  const listBuf: string[] = [];
  const flushList = (key: string) => {
    if (listBuf.length === 0) return;
    const items = listBuf.splice(0, listBuf.length);
    out.push(
      <ul key={`ul-${key}`} className="list-disc pl-5 space-y-1 my-2 text-gray-800">
        {items.map((line, j) => (
          <li key={j}>{line.replace(/^[-*]\s+/, '').trim()}</li>
        ))}
      </ul>,
    );
  };
  for (const line of lines) {
    const raw = line;
    const trimmed = raw.trim();
    if (trimmed === '') {
      flushList(`e${i}`);
      out.push(<div key={`sp-${i++}`} className="h-2" aria-hidden />);
      continue;
    }
    if (/^###\s/.test(trimmed)) {
      flushList(`h${i}`);
      out.push(
        <h4 key={`hx-${i++}`} className="text-sm font-semibold text-gray-900 mt-3 mb-1.5 first:mt-0">
          {trimmed.replace(/^###\s+/, '')}
        </h4>,
      );
      continue;
    }
    if (/^##\s/.test(trimmed)) {
      flushList(`h${i}`);
      out.push(
        <h3 key={`hx-${i++}`} className="text-base font-semibold text-gray-900 mt-3 mb-2 first:mt-0">
          {trimmed.replace(/^##\s+/, '')}
        </h3>,
      );
      continue;
    }
    if (/^#\s/.test(trimmed)) {
      flushList(`h${i}`);
      out.push(
        <h2 key={`hx-${i++}`} className="text-lg font-semibold text-gray-900 mt-4 mb-2 first:mt-0">
          {trimmed.replace(/^#\s+/, '')}
        </h2>,
      );
      continue;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      listBuf.push(trimmed);
      continue;
    }
    flushList(`p${i}`);
    out.push(
      <p key={`p-${i++}`} className="my-1.5 leading-relaxed text-gray-800">
        {raw.trimEnd()}
      </p>,
    );
  }
  flushList('end');
  return <div className="space-y-0">{out}</div>;
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const WHATSAPP_STORAGE_KEY = 'byla-whatsapp-numeros';
const NUMERO_PADRAO = '5571992750807'; // 71 99275-0807

function hojeYYYYMMDD(): string {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/** Normaliza para formato wa.me: só dígitos, Brasil 55 + DDD + número (ex.: 71992750807 → 5571992750807). */
function normalizarNumeroWhatsApp(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('55')) return digits;
  if (digits.length === 11) return '55' + digits; // 71992750807
  if (digits.length === 10) return '55' + digits; // DDD + 9 dígitos
  return digits;
}

/** Exibe número para o usuário: 5571992750807 → 71 99275-0807 */
function formatarNumeroExibicao(numero: string): string {
  const d = numero.replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) {
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    return rest.length === 9 ? `${ddd} ${rest.slice(0, 5)}-${rest.slice(5)}` : `${ddd} ${rest}`;
  }
  return numero;
}

function carregarNumerosWhatsApp(): string[] {
  try {
    const raw = localStorage.getItem(WHATSAPP_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as string[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore
  }
  return [NUMERO_PADRAO];
}

function salvarNumerosWhatsApp(numeros: string[]): void {
  localStorage.setItem(WHATSAPP_STORAGE_KEY, JSON.stringify(numeros));
}

function periodoRelatorioLabel(dados: RelatorioPayload): string {
  if ('periodo_label' in dados && typeof dados.periodo_label === 'string') return dados.periodo_label;
  if (dados.tipo === 'diario' && 'data' in dados) return (dados as RelatorioDiarioPayload).data;
  return '';
}

function ControleCaixaGestaoPreview({ data }: { data: ControleCaixaLeituraGestao }) {
  const fmt = (n: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
  const temAlgumaLinha =
    data.entradas_linha_a_linha.length > 0 ||
    data.saidas_por_categoria.length > 0 ||
    data.gastos_fixos_linha_a_linha.length > 0;
  return (
    <div className="border border-indigo-200 rounded-lg p-4 bg-indigo-50/40 space-y-4 text-sm text-gray-800">
      <div>
        <h3 className="text-sm font-semibold text-indigo-950">{data.titulo}</h3>
        <p className="text-xs text-indigo-800/90 mt-1">
          Leitura para gestão — mesmos valores que o texto gerado pela IA deve listar.
        </p>
        {data.origem_detalhe_listas?.entradas_e_saidas && (
          <p className="text-xs text-gray-500 mt-1 leading-snug">{data.origem_detalhe_listas.entradas_e_saidas}</p>
        )}
        {data.aba_planilha && (
          <p className="text-xs text-gray-600 mt-1">
            Aba do controle: <span className="font-mono">{data.aba_planilha}</span>
          </p>
        )}
        {data.totais_planilha &&
          (data.totais_planilha.entradas_reais != null ||
            data.totais_planilha.saidas_reais != null ||
            data.totais_planilha.lucro_reais != null) && (
            <div className="mt-3 p-3 rounded-lg bg-white/80 border border-indigo-200/80">
              <p className="text-xs font-semibold text-indigo-900 uppercase tracking-wide mb-2">Totais no CONTROLE (planilha)</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-gray-600">Entradas</span>
                  <span className="font-medium tabular-nums text-green-800">
                    {data.totais_planilha.entradas_reais != null ? fmt(data.totais_planilha.entradas_reais) : '–'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-600">Saídas</span>
                  <span className="font-medium tabular-nums text-red-800">
                    {data.totais_planilha.saidas_reais != null ? fmt(data.totais_planilha.saidas_reais) : '–'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-600">Lucro</span>
                  <span className="font-medium tabular-nums text-slate-800">
                    {data.totais_planilha.lucro_reais != null ? fmt(data.totais_planilha.lucro_reais) : '–'}
                  </span>
                </div>
              </div>
            </div>
          )}
      </div>
      {!temAlgumaLinha && (
        <p className="text-amber-800 text-xs bg-amber-50 border border-amber-200 rounded p-2">
          Nenhuma linha detalhada veio da planilha neste período (conferir configuração ou mês sem lançamentos no CONTROLE).
        </p>
      )}
      {data.entradas_linha_a_linha.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Entradas (linha a linha)</h4>
          <ul className="space-y-1 text-sm">
            {data.entradas_linha_a_linha.map((row, i) => (
              <li key={`e-${i}`} className="flex justify-between gap-2 border-b border-indigo-100/80 pb-1">
                <span className="text-gray-800">
                  {row.secao ? <span className="text-indigo-900/80">{row.secao} — </span> : null}
                  {row.descricao}
                </span>
                <span className="font-medium tabular-nums shrink-0">{fmt(row.valor_reais)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.saidas_por_categoria.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Saídas por categoria</h4>
          <ul className="space-y-1 text-sm">
            {data.saidas_por_categoria.map((row, i) => (
              <li key={`s-${i}`} className="flex justify-between gap-2 border-b border-indigo-100/80 pb-1">
                <span className="text-gray-800">
                  <span className="text-indigo-900/90 font-medium">{row.categoria}</span>
                  {row.descricao ? ` — ${row.descricao}` : null}
                </span>
                <span className="font-medium tabular-nums shrink-0">{fmt(row.valor_reais)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.gastos_fixos_linha_a_linha.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Gastos fixos (detalhe)</h4>
          <ul className="space-y-1 text-sm">
            {data.gastos_fixos_linha_a_linha.map((row, i) => (
              <li key={`g-${i}`} className="flex justify-between gap-2 border-b border-indigo-100/80 pb-1">
                <span className="text-gray-800">{row.descricao}</span>
                <span className="font-medium tabular-nums shrink-0">{fmt(row.valor_reais)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function fmtBRLPanorama(n: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/** Preview R4: alunos ativos e mensalidade por competência, planilha FLUXO — blocos por aba/modalidade. */
function AlunosPanoramaPreview({ data }: { data: RelatorioAlunosPanoramaPayload }) {
  const bordas = [
    'border-l-teal-500',
    'border-l-indigo-500',
    'border-l-amber-500',
    'border-l-rose-500',
    'border-l-violet-500',
    'border-l-cyan-500',
  ];

  if (!data.por_aba?.length) {
    return <p className="text-sm text-gray-500">Nenhuma aba elegível retornou dados.</p>;
  }

  return (
    <div className="space-y-4 print:break-inside-avoid">
      <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50/90 to-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Fonte dos dados</p>
        <p className="mt-1 text-base font-semibold text-gray-900">{data.fonte_dados?.planilha ?? 'FLUXO DE CAIXA BYLA'}</p>
        <p className="mt-2 text-xs text-gray-600 leading-relaxed">{data.fonte_dados?.descricao}</p>
        {data.competencia?.label && (
          <p className="mt-3 text-sm text-gray-800">
            <span className="font-medium text-emerald-900">Competência do relatório:</span> {data.competencia.label}{' '}
            <span className="text-gray-500">(mensalidade = soma dos pagamentos nessa competência na planilha)</span>
          </p>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Por aba e modalidade</h3>
        <div className="space-y-4">
          {data.por_aba.map((aba, idx) => (
            <div
              key={aba.aba}
              className={`rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden border-l-4 ${bordas[idx % bordas.length]}`}
            >
              <div className="px-4 py-3 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100 flex flex-wrap justify-between gap-2 items-center">
                <span className="text-base font-semibold text-gray-900">{aba.aba}</span>
                <span className="text-xs text-gray-600">
                  <span className="font-medium text-gray-800">{aba.total_alunos_ativos}</span> aluno(s) ativos ·{' '}
                  <span className="font-semibold text-emerald-800">{fmtBRLPanorama(aba.total_mensalidade_competencia)}</span>
                  <span className="text-gray-500"> na competência</span>
                </span>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {aba.por_modalidade.map((m) => (
                  <div
                    key={`${aba.aba}-${m.modalidade}`}
                    className="rounded-lg border border-stone-200/90 bg-stone-50/90 p-3 flex flex-col gap-1 min-h-[5.5rem]"
                  >
                    <div className="text-[11px] font-medium uppercase tracking-wide text-stone-500">Modalidade</div>
                    <div className="text-sm font-semibold text-gray-900 leading-snug">{m.modalidade}</div>
                    <div className="mt-auto pt-2 flex justify-between items-baseline gap-2 text-xs border-t border-stone-200/80">
                      <span className="text-gray-600">Alunos ativos</span>
                      <span className="font-semibold text-gray-900 tabular-nums">{m.alunos_ativos}</span>
                    </div>
                    <div className="flex justify-between items-baseline gap-2 text-xs">
                      <span className="text-gray-600">Mensalidade (competência)</span>
                      <span className="font-semibold text-emerald-800 tabular-nums">{fmtBRLPanorama(m.total_mensalidade_competencia)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {data.regra_ativos ? (
        <p className="text-xs text-gray-500 leading-relaxed border-t border-gray-200 pt-3">{data.regra_ativos}</p>
      ) : null}
    </div>
  );
}

function tituloRelatorioCurto(tipo: TipoRelatorio): string {
  const map: Record<TipoRelatorio, string> = {
    diario: 'R3 — Diário (fluxo)',
    mensal: 'R1 — Mensal executivo',
    mensal_operacional: 'R2 — Mensal operacional',
    trimestral: 'Trimestral (variante R1)',
    anual: 'Anual (variante R1)',
    alunos_panorama: 'R4 — Alunos (FLUXO / panorama)',
    alunos_inadimplencia: 'R5 — Alunos (inadimplência)',
  };
  return map[tipo];
}

type TipoRelatorio =
  | 'diario'
  | 'mensal'
  | 'mensal_operacional'
  | 'trimestral'
  | 'anual'
  | 'alunos_panorama'
  | 'alunos_inadimplencia';

export function RelatoriosPage() {
  const [tipo, setTipo] = useState<TipoRelatorio>('mensal');
  const [dataDiario, setDataDiario] = useState(hojeYYYYMMDD);
  const [mes, setMes] = useState(3);
  const [ano, setAno] = useState(2026);
  const [trimestre, setTrimestre] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dados, setDados] = useState<RelatorioPayload | null>(null);
  const [textoIA, setTextoIA] = useState<string | null>(null);
  const [loadingIA, setLoadingIA] = useState(false);
  const [errorIA, setErrorIA] = useState<string | null>(null);
  const [aprovado, setAprovado] = useState(false);
  const [numerosWhatsApp, setNumerosWhatsApp] = useState<string[]>(() => carregarNumerosWhatsApp());
  const [numeroWhatsAppSelecionado, setNumeroWhatsAppSelecionado] = useState<string>(() => carregarNumerosWhatsApp()[0]);
  const [novoNumeroWhatsApp, setNovoNumeroWhatsApp] = useState('');
  const [mostrarAddNumero, setMostrarAddNumero] = useState(false);
  const [iaConfigured, setIaConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    getRelatoriosIAStatus().then((r) => setIaConfigured(r.configured)).catch(() => setIaConfigured(false));
  }, []);

  const handleGerar = async () => {
    setLoading(true);
    setError(null);
    setDados(null);
    setTextoIA(null);
    setAprovado(false);
    try {
      if (tipo === 'diario') {
        const r = await getRelatorioDiario(dataDiario);
        setDados(r);
      } else if (tipo === 'mensal') {
        const r = await getRelatorioMensal(mes, ano);
        setDados(r);
      } else if (tipo === 'mensal_operacional') {
        const r = await getRelatorioMensalOperacional(mes, ano);
        setDados(r);
      } else if (tipo === 'trimestral') {
        const r = await getRelatorioTrimestral(trimestre, ano);
        setDados(r);
      } else if (tipo === 'anual') {
        const r = await getRelatorioAnual(ano);
        setDados(r);
      } else if (tipo === 'alunos_panorama') {
        const r = await getRelatorioAlunosPanorama(mes, ano);
        setDados(r);
      } else {
        const r = await getRelatorioAlunosInadimplencia(mes, ano);
        setDados(r);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleGerarTextoIA = async () => {
    if (!dados) return;
    setLoadingIA(true);
    setErrorIA(null);
    setTextoIA(null);
    try {
      const { texto } = await gerarTextoRelatorioIA(dados);
      setTextoIA(texto);
    } catch (e) {
      setErrorIA(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingIA(false);
    }
  };

  const formatBRL = (n: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

  const adicionarNumeroWhatsApp = () => {
    const norm = normalizarNumeroWhatsApp(novoNumeroWhatsApp);
    if (norm.length < 12) return;
    if (numerosWhatsApp.includes(norm)) {
      setNovoNumeroWhatsApp('');
      setMostrarAddNumero(false);
      return;
    }
    const novaLista = [...numerosWhatsApp, norm];
    setNumerosWhatsApp(novaLista);
    salvarNumerosWhatsApp(novaLista);
    setNumeroWhatsAppSelecionado(norm);
    setNovoNumeroWhatsApp('');
    setMostrarAddNumero(false);
  };

  return (
    <>
      <div className="no-print flex flex-col min-h-0">
      <Topbar title="Relatórios" />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <p className="text-gray-600 text-sm">
            Relatórios para gestão e administração: fluxo de caixa (diário/mensal/trimestral/anual), operacional mensal, alunos e inadimplência. O mensal e o operacional mostram as linhas da planilha CONTROLE de caixa antes do texto com IA. O relatório R4 (panorama de alunos) usa a planilha <strong className="font-medium text-gray-800">FLUXO DE CAIXA BYLA</strong> — alunos ativos por aba e modalidade, com mensalidade na competência do mês escolhido. Confira os blocos abaixo e depois gere o parecer com IA para enviar por WhatsApp.
          </p>

          <div className="text-xs text-gray-600 border border-gray-200 rounded-lg p-3 bg-white">
            <span className="font-medium text-gray-700">Legenda de fontes: </span>
            <span className="mr-3"><span className="font-mono text-[11px] bg-slate-100 px-1 rounded">banco</span> extrato / Supabase oficial</span>
            <span className="mr-3"><span className="font-mono text-[11px] bg-slate-100 px-1 rounded">planilha</span> FLUXO / CONTROLE DE CAIXA</span>
            <span><span className="font-mono text-[11px] bg-slate-100 px-1 rounded">sistema</span> regras e agregações (ex.: conciliação)</span>
          </div>

          {/* Tipo + parâmetros */}
          <div className="flex flex-wrap items-end gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Tipo</label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoRelatorio)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="diario">R3 — Diário (fluxo)</option>
                <option value="mensal">R1 — Mensal executivo</option>
                <option value="mensal_operacional">R2 — Mensal operacional</option>
                <option value="trimestral">Trimestral</option>
                <option value="anual">Anual</option>
                <option value="alunos_panorama">R4 — Alunos (FLUXO / panorama)</option>
                <option value="alunos_inadimplencia">R5 — Alunos (inadimplência)</option>
              </select>
            </div>
            {tipo === 'diario' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Data</label>
                <input
                  type="date"
                  value={dataDiario}
                  onChange={(e) => setDataDiario(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-40"
                />
              </div>
            )}
            {(tipo === 'mensal' ||
              tipo === 'mensal_operacional' ||
              tipo === 'alunos_panorama' ||
              tipo === 'alunos_inadimplencia') && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Mês</label>
                  <select
                    value={mes}
                    onChange={(e) => setMes(Number(e.target.value))}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-32"
                  >
                    {MESES.map((nome, i) => (
                      <option key={i} value={i + 1}>{nome}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Ano</label>
                  <input
                    type="number"
                    min={2020}
                    max={2030}
                    value={ano}
                    onChange={(e) => setAno(Number(e.target.value))}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-24"
                  />
                </div>
              </>
            )}
            {tipo === 'trimestral' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Trimestre</label>
                  <select
                    value={trimestre}
                    onChange={(e) => setTrimestre(Number(e.target.value))}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-40"
                  >
                    <option value={1}>1º (Jan–Mar)</option>
                    <option value={2}>2º (Abr–Jun)</option>
                    <option value={3}>3º (Jul–Set)</option>
                    <option value={4}>4º (Out–Dez)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Ano</label>
                  <input
                    type="number"
                    min={2020}
                    max={2030}
                    value={ano}
                    onChange={(e) => setAno(Number(e.target.value))}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-24"
                  />
                </div>
              </>
            )}
            {tipo === 'anual' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Ano</label>
                <input
                  type="number"
                  min={2020}
                  max={2030}
                  value={ano}
                  onChange={(e) => setAno(Number(e.target.value))}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-24"
                />
              </div>
            )}
            <button
              type="button"
              onClick={handleGerar}
              disabled={loading}
              className="px-4 py-2 bg-byla-red text-white rounded-lg text-sm font-medium hover:bg-byla-red/90 disabled:opacity-50"
            >
              {loading ? 'Carregando…' : 'Gerar relatório'}
            </button>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
              {error}
            </div>
          )}

          {dados && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {(dados as RelatorioDiarioPayload).periodo_label ??
                  (dados as RelatorioMensalPayload).periodo_label ??
                  (dados as RelatorioMensalOperacionalPayload).periodo_label ??
                  (dados as RelatorioAlunosPanoramaPayload).periodo_label ??
                  (dados as RelatorioAlunosInadimplenciaPayload).periodo_label ??
                  (dados as RelatorioTrimestralPayload).periodo_label ??
                  (dados as RelatorioAnualPayload).periodo_label}
              </h2>

              {'aviso' in dados && dados.aviso && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-sm">{dados.aviso}</div>
              )}

              {/* Cards resumo */}
              <div
                className={
                  dados.tipo === 'mensal' || dados.tipo === 'trimestral' || dados.tipo === 'anual'
                    ? 'space-y-4'
                    : 'grid grid-cols-2 sm:grid-cols-4 gap-3'
                }
              >
                {dados.tipo === 'mensal' || dados.tipo === 'trimestral' || dados.tipo === 'anual' ? (
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                        Extrato oficial (banco / Supabase)
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                          <div className="text-xs text-green-700 font-medium">Entradas</div>
                          <div className="text-lg font-semibold text-green-800">
                            {formatBRL(dados.entradas.total_oficial)}
                          </div>
                        </div>
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                          <div className="text-xs text-red-700 font-medium">Saídas</div>
                          <div className="text-lg font-semibold text-red-800">
                            {formatBRL(dados.saidas.total_oficial)}
                          </div>
                        </div>
                        <div className="p-3 bg-slate-100 border border-slate-200 rounded-lg sm:col-span-1 col-span-2">
                          <div className="text-xs text-slate-600 font-medium">Lucro / saldo</div>
                          <div className="text-lg font-semibold text-slate-800">
                            {dados.tipo === 'mensal' && 'valor' in dados.lucro
                              ? formatBRL(dados.lucro.valor)
                              : 'total_oficial' in dados.lucro
                                ? formatBRL(dados.lucro.total_oficial)
                                : '–'}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                        Planilha CONTROLE (entrada e saída do mês)
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                          <div className="text-xs text-amber-800 font-medium">Entradas</div>
                          <div className="text-lg font-semibold text-amber-900">
                            {dados.entradas.total_planilha != null ? formatBRL(dados.entradas.total_planilha) : '–'}
                          </div>
                        </div>
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                          <div className="text-xs text-amber-800 font-medium">Saídas</div>
                          <div className="text-lg font-semibold text-amber-900">
                            {dados.saidas.total_planilha != null ? formatBRL(dados.saidas.total_planilha) : '–'}
                          </div>
                        </div>
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg sm:col-span-1 col-span-2">
                          <div className="text-xs text-amber-800 font-medium">Lucro (planilha)</div>
                          <div className="text-lg font-semibold text-amber-900">
                            {dados.tipo === 'mensal' && dados.lucro.valor_planilha != null
                              ? formatBRL(dados.lucro.valor_planilha)
                              : dados.tipo !== 'mensal' && 'total_planilha' in dados.lucro && dados.lucro.total_planilha != null
                                ? formatBRL(dados.lucro.total_planilha)
                                : '–'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : dados.tipo === 'diario' ? (
                  <>
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                      <div className="text-xs text-green-700 font-medium">Entradas</div>
                      <div className="text-lg font-semibold text-green-800">
                        {formatBRL(dados.entradas.total)}
                      </div>
                      <div className="text-xs text-green-600">{dados.entradas.quantidade} mov.</div>
                    </div>
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div className="text-xs text-red-700 font-medium">Saídas</div>
                      <div className="text-lg font-semibold text-red-800">
                        {formatBRL(dados.saidas.total)}
                      </div>
                      <div className="text-xs text-red-600">{dados.saidas.quantidade} mov.</div>
                    </div>
                    <div className="p-3 bg-slate-100 border border-slate-200 rounded-lg">
                      <div className="text-xs text-slate-600 font-medium">Saldo do dia</div>
                      <div className="text-lg font-semibold text-slate-800">
                        {formatBRL(dados.saldo_dia)}
                      </div>
                    </div>
                  </>
                ) : dados.tipo === 'mensal_operacional' ? (
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                        Extrato oficial (banco / Supabase)
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                          <div className="text-xs text-green-700 font-medium">Entradas</div>
                          <div className="text-lg font-semibold text-green-800">
                            {formatBRL(dados.resumo_financeiro_oficial.entradas)}
                          </div>
                        </div>
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                          <div className="text-xs text-red-700 font-medium">Saídas</div>
                          <div className="text-lg font-semibold text-red-800">
                            {formatBRL(dados.resumo_financeiro_oficial.saidas)}
                          </div>
                        </div>
                        <div className="p-3 bg-slate-100 border border-slate-200 rounded-lg sm:col-span-1 col-span-2">
                          <div className="text-xs text-slate-600 font-medium">Saldo</div>
                          <div className="text-lg font-semibold text-slate-800">
                            {formatBRL(dados.resumo_financeiro_oficial.saldo)}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                        Planilha CONTROLE (totais do mês)
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                          <div className="text-xs text-amber-800 font-medium">Entradas</div>
                          <div className="text-lg font-semibold text-amber-900">
                            {dados.planilha_controle_caixa?.entrada_total != null
                              ? formatBRL(dados.planilha_controle_caixa.entrada_total)
                              : '–'}
                          </div>
                        </div>
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                          <div className="text-xs text-amber-800 font-medium">Saídas</div>
                          <div className="text-lg font-semibold text-amber-900">
                            {dados.planilha_controle_caixa?.saida_total != null
                              ? formatBRL(dados.planilha_controle_caixa.saida_total)
                              : '–'}
                          </div>
                        </div>
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg sm:col-span-1 col-span-2">
                          <div className="text-xs text-amber-800 font-medium">Lucro (planilha)</div>
                          <div className="text-lg font-semibold text-amber-900">
                            {dados.planilha_controle_caixa?.lucro_total != null
                              ? formatBRL(dados.planilha_controle_caixa.lucro_total)
                              : '–'}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                      <div className="text-xs text-indigo-700 font-medium">Receita por modalidade (planilha de alunos)</div>
                      <div className="text-sm text-indigo-900">
                        {(dados.receita_por_modalidade_competencia?.length ?? 0)} grupos no JSON — detalhe abaixo no preview CONTROLE.
                      </div>
                    </div>
                  </div>
                ) : dados.tipo === 'alunos_panorama' ? (
                  <div className="col-span-2 sm:col-span-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3 bg-sky-50 border border-sky-200 rounded-lg">
                      <div className="text-xs text-sky-700 font-medium">Alunos ativos (todas as abas)</div>
                      <div className="text-lg font-semibold text-sky-900">
                        {(() => {
                          const t = (dados as RelatorioAlunosPanoramaPayload).totais;
                          if (!t) return '–';
                          if (typeof t.total_alunos_ativos === 'number') return t.total_alunos_ativos;
                          if (typeof t.total_alunos_cadastrados_abas === 'number') return t.total_alunos_cadastrados_abas;
                          return '–';
                        })()}
                      </div>
                    </div>
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <div className="text-xs text-emerald-800 font-medium">Mensalidade na competência</div>
                      <div className="text-lg font-semibold text-emerald-900">
                        {(() => {
                          const t = (dados as RelatorioAlunosPanoramaPayload).totais;
                          if (!t || typeof t.total_mensalidade_competencia !== 'number') return '–';
                          return formatBRL(t.total_mensalidade_competencia);
                        })()}
                      </div>
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                      <div className="text-xs text-slate-600 font-medium">Abas (planilha FLUXO)</div>
                      <div className="text-lg font-semibold text-slate-800">
                        {typeof (dados as RelatorioAlunosPanoramaPayload).totais?.total_abas === 'number'
                          ? (dados as RelatorioAlunosPanoramaPayload).totais!.total_abas
                          : '–'}
                      </div>
                    </div>
                  </div>
                ) : dados.tipo === 'alunos_inadimplencia_mes' ? (
                  <>
                    <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg sm:col-span-2">
                      <div className="text-xs text-orange-800 font-medium">Sem pagamento (lista filtrada)</div>
                      <div className="text-lg font-semibold text-orange-900">
                        {dados.kpis && typeof dados.kpis.inadimplencia_lista === 'number'
                          ? dados.kpis.inadimplencia_lista
                          : dados.itens?.length ?? 0}
                      </div>
                      {dados.lista_truncada && (
                        <div className="text-xs text-orange-700 mt-1">Lista truncada no JSON (máx. 120)</div>
                      )}
                    </div>
                  </>
                ) : null}
              </div>

              {dados.tipo === 'alunos_panorama' && (
                <AlunosPanoramaPreview data={dados as RelatorioAlunosPanoramaPayload} />
              )}

              {(dados.tipo === 'mensal' || dados.tipo === 'mensal_operacional') &&
                dados.controle_caixa_leitura_gestao && (
                  <ControleCaixaGestaoPreview data={dados.controle_caixa_leitura_gestao} />
                )}

              {/* Botão Gerar texto com IA + Aprovar + WhatsApp */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleGerarTextoIA}
                  disabled={loadingIA}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {loadingIA ? 'Gerando texto…' : 'Gerar texto com IA'}
                </button>
                {textoIA && (
                  <>
                    <button
                      type="button"
                      onClick={() => setAprovado(true)}
                      disabled={aprovado}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-70 disabled:cursor-default"
                    >
                      {aprovado ? '✓ Aprovado' : 'Aprovar relatório'}
                    </button>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-gray-500">Enviar para:</span>
                      <select
                        value={numeroWhatsAppSelecionado}
                        onChange={(e) => setNumeroWhatsAppSelecionado(e.target.value)}
                        className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                      >
                        {numerosWhatsApp.map((num) => (
                          <option key={num} value={num}>
                            {formatarNumeroExibicao(num)}
                          </option>
                        ))}
                      </select>
                      <a
                        href={`https://wa.me/${numeroWhatsAppSelecionado}?text=${encodeURIComponent(
                          `*Relatório ${dados.tipo} – ${'periodo_label' in dados ? dados.periodo_label : ''}*\n\n${textoIA}`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#25D366] text-white rounded-lg text-sm font-medium hover:opacity-90"
                      >
                        Enviar por WhatsApp
                      </a>
                      <button
                        type="button"
                        onClick={() => window.print()}
                        title="Abre a impressão do navegador — em Destino, escolha Salvar como PDF"
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-700 text-white rounded-lg text-sm font-medium hover:bg-slate-800"
                      >
                        Exportar PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => setMostrarAddNumero((v) => !v)}
                        className="text-xs text-gray-500 underline hover:text-gray-700"
                      >
                        {mostrarAddNumero ? 'Cancelar' : '+ Adicionar número'}
                      </button>
                    </div>
                    {mostrarAddNumero && (
                      <div className="flex flex-wrap items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
                        <input
                          type="tel"
                          placeholder="Ex.: 71 99275-0807 ou 71992750807"
                          value={novoNumeroWhatsApp}
                          onChange={(e) => setNovoNumeroWhatsApp(e.target.value)}
                          className="rounded border border-gray-300 px-2 py-1.5 text-sm w-48"
                        />
                        <button
                          type="button"
                          onClick={adicionarNumeroWhatsApp}
                          className="px-3 py-1.5 bg-gray-700 text-white rounded text-sm hover:bg-gray-800"
                        >
                          Salvar número
                        </button>
                      </div>
                    )}
                  </>
                )}
                <span className="text-xs text-gray-500">
                  {iaConfigured === true
                    ? 'IA disponível. Aprove o relatório e envie por WhatsApp.'
                    : iaConfigured === false
                      ? 'Sempre gera texto. Para IA: GEMINI_API_KEY ou GROQ_API_KEY (grátis) no backend/.env.'
                      : 'Verificando IA…'}
                </span>
              </div>
              {errorIA && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                  {errorIA}
                </div>
              )}
              {textoIA && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-2 bg-gray-100 text-sm font-medium text-gray-700 border-b flex items-center justify-between">
                    <span>{aprovado ? '✓ Relatório aprovado' : 'Rascunho – Relatório gerado pela IA'}</span>
                  </div>
                  <div className="p-4 bg-white text-gray-800 text-sm max-h-96 overflow-y-auto">
                    <RelatorioTextoIaView text={textoIA} />
                  </div>
                </div>
              )}

              {/* JSON colapsável */}
              <details className="border border-gray-200 rounded-lg overflow-hidden">
                <summary className="px-4 py-3 bg-gray-100 cursor-pointer text-sm font-medium text-gray-700">
                  Ver JSON completo (para IA)
                </summary>
                <pre className="p-4 bg-gray-900 text-gray-100 text-xs overflow-x-auto max-h-96 overflow-y-auto">
                  {JSON.stringify(dados, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      </div>
    </div>

      {textoIA && dados && (
        <div className="print-only p-10 max-w-3xl mx-auto text-gray-900 text-sm leading-relaxed">
          <header className="mb-6 border-b border-gray-300 pb-4">
            <h1 className="text-2xl font-semibold tracking-tight">Espaço Byla</h1>
            <p className="text-base text-gray-700 mt-1">{tituloRelatorioCurto(tipo)}</p>
            <p className="text-gray-600 mt-1">{periodoRelatorioLabel(dados)}</p>
            <p className="text-xs text-gray-500 mt-3">
              Gerado em {new Date().toLocaleString('pt-BR')}
              {aprovado ? ' · Aprovado para envio' : ''}
            </p>
          </header>
          <p className="text-xs text-gray-600 mb-4 border-b border-gray-200 pb-3">
            Legenda de fontes: <span className="font-mono">banco</span> = extrato/Supabase oficial;{' '}
            <span className="font-mono">planilha</span> = FLUXO / CONTROLE DE CAIXA;{' '}
            <span className="font-mono">sistema</span> = regras e conciliação.
          </p>
          <div className="text-sm leading-relaxed">
            <RelatorioTextoIaView text={textoIA} />
          </div>
        </div>
      )}
    </>
  );
}
