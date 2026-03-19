import { useState, useEffect } from 'react';
import { Topbar } from '../app/Topbar';
import {
  getRelatorioDiario,
  getRelatorioMensal,
  getRelatorioTrimestral,
  getRelatorioAnual,
  gerarTextoRelatorioIA,
  getRelatoriosIAStatus,
  type RelatorioPayload,
  type RelatorioDiarioPayload,
  type RelatorioMensalPayload,
  type RelatorioTrimestralPayload,
  type RelatorioAnualPayload,
} from '../services/backendApi';

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

type TipoRelatorio = 'diario' | 'mensal' | 'trimestral' | 'anual';

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
      } else if (tipo === 'trimestral') {
        const r = await getRelatorioTrimestral(trimestre, ano);
        setDados(r);
      } else {
        const r = await getRelatorioAnual(ano);
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
    <div className="flex flex-col min-h-0">
      <Topbar title="Relatórios" />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <p className="text-gray-600 text-sm">
            Gere relatórios diário, mensal, trimestral ou anual (entradas e saídas). Diário usa só Supabase; mensal/trimestral usam Supabase e planilha CONTROLE DE CAIXA. Gere o texto com IA e aprove antes de enviar por WhatsApp.
          </p>

          {/* Tipo + parâmetros */}
          <div className="flex flex-wrap items-end gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Tipo</label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoRelatorio)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="diario">Diário</option>
                <option value="mensal">Mensal</option>
                <option value="trimestral">Trimestral</option>
                <option value="anual">Anual</option>
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
            {tipo === 'mensal' && (
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
                  (dados as RelatorioTrimestralPayload).periodo_label ??
                  (dados as RelatorioAnualPayload).periodo_label}
              </h2>

              {/* Cards resumo */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {dados.tipo === 'diario' ? (
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
                ) : 'entradas' in dados && 'total_oficial' in dados.entradas && (
                  <>
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                      <div className="text-xs text-green-700 font-medium">Entradas (oficial)</div>
                      <div className="text-lg font-semibold text-green-800">
                        {formatBRL(dados.entradas.total_oficial)}
                      </div>
                    </div>
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div className="text-xs text-red-700 font-medium">Saídas (oficial)</div>
                      <div className="text-lg font-semibold text-red-800">
                        {formatBRL(dados.saidas.total_oficial)}
                      </div>
                    </div>
                    <div className="p-3 bg-slate-100 border border-slate-200 rounded-lg">
                      <div className="text-xs text-slate-600 font-medium">Lucro (oficial)</div>
                      <div className="text-lg font-semibold text-slate-800">
                        {'lucro' in dados && 'valor' in dados.lucro
                          ? formatBRL(dados.lucro.valor)
                          : 'total_oficial' in dados.lucro
                            ? formatBRL(dados.lucro.total_oficial)
                            : '-'}
                      </div>
                    </div>
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <div className="text-xs text-amber-700 font-medium">Planilha</div>
                      <div className="text-sm text-amber-800">
                        Entr. {dados.entradas.total_planilha != null ? formatBRL(dados.entradas.total_planilha) : '–'} / Saíd. {dados.saidas.total_planilha != null ? formatBRL(dados.saidas.total_planilha) : '–'}
                      </div>
                    </div>
                  </>
                )}
              </div>

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
                  <div className="p-4 bg-white text-gray-800 text-sm whitespace-pre-wrap max-h-96 overflow-y-auto">
                    {textoIA}
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
  );
}
