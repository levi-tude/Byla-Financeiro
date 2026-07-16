import { useCallback, useEffect, useMemo, useState } from 'react';
import { Topbar } from '../app/Topbar';
import { useAuth } from '../auth/AuthContext';
import {
  createAluguelReserva,
  createAluguelSala,
  deleteAluguelReserva,
  getAluguelResumoWhatsApp,
  listAluguelReservas,
  listAluguelSalas,
  patchAluguelReserva,
  patchAluguelSala,
  type AluguelClassificacao,
  type AluguelReserva,
  type AluguelSala,
} from '../services/backendApi';

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const WHATSAPP_STORAGE_KEY = 'byla-whatsapp-numeros';
const NUMERO_PADRAO = '5571992750807';

const CLASSIFICACAO_LABEL: Record<AluguelClassificacao, string> = {
  teatro: 'Teatro',
  ensaio: 'Ensaio',
  coworking: 'Coworking',
  outro: 'Outro',
};

function monthTitle(mes: number, ano: number): string {
  return new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function normalizarNumeroWhatsApp(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('55')) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length === 12 || digits.length === 13) return digits;
  return digits;
}

/** Exibe número: 5571992750807 → 71 99275-0807 */
function formatarNumeroExibicao(numero: string): string {
  const d = numero.replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) {
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    return rest.length === 9 ? `${ddd} ${rest.slice(0, 5)}-${rest.slice(5)}` : `${ddd} ${rest}`;
  }
  return numero;
}

function loadWhatsAppNumeros(): string[] {
  try {
    const raw = localStorage.getItem(WHATSAPP_STORAGE_KEY);
    if (!raw) return [NUMERO_PADRAO];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return [NUMERO_PADRAO];
    return parsed.map((n) => normalizarNumeroWhatsApp(String(n))).filter(Boolean);
  } catch {
    return [NUMERO_PADRAO];
  }
}

function saveWhatsAppNumeros(numeros: string[]): void {
  localStorage.setItem(WHATSAPP_STORAGE_KEY, JSON.stringify(numeros));
}

type DaySlot = { data: string; day: number } | null;

function buildCalendarSlots(mes: number, ano: number): DaySlot[] {
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const primeiro = new Date(ano, mes - 1, 1);
  const jsWeekday = primeiro.getDay();
  const offsetMon = jsWeekday === 0 ? 6 : jsWeekday - 1;
  const slots: DaySlot[] = [];
  for (let i = 0; i < offsetMon; i++) slots.push(null);
  for (let d = 1; d <= ultimoDia; d++) {
    const data = `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    slots.push({ data, day: d });
  }
  while (slots.length % 7 !== 0) slots.push(null);
  return slots;
}

type ReservaForm = {
  id?: string;
  sala_id: string;
  titulo: string;
  data: string;
  hora_inicio: string;
  hora_fim: string;
  observacao: string;
};

const emptyForm = (salaId: string, data: string): ReservaForm => ({
  sala_id: salaId,
  titulo: '',
  data,
  hora_inicio: '09:00',
  hora_fim: '12:00',
  observacao: '',
});

export function AluguelSalasPage() {
  const auth = useAuth();
  const isAdmin = auth.role === 'admin';
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const [salas, setSalas] = useState<AluguelSala[]>([]);
  const [salaFiltro, setSalaFiltro] = useState<string | null>(null);
  const [reservas, setReservas] = useState<AluguelReserva[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<ReservaForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSalasAdmin, setShowSalasAdmin] = useState(false);
  const [novaSalaNome, setNovaSalaNome] = useState('');
  const [novaSalaClass, setNovaSalaClass] = useState<AluguelClassificacao>('outro');
  const [whatsappNumeros, setWhatsappNumeros] = useState(loadWhatsAppNumeros);
  const [whatsappSelecionado, setWhatsappSelecionado] = useState(
    () => loadWhatsAppNumeros()[0] ?? NUMERO_PADRAO,
  );
  const [novoNumeroWhatsApp, setNovoNumeroWhatsApp] = useState('');
  const [mostrarAddNumero, setMostrarAddNumero] = useState(false);
  const [resumoBusy, setResumoBusy] = useState(false);

  const loadSalas = useCallback(async () => {
    const salasList = await listAluguelSalas({ todas: isAdmin });
    setSalas(salasList);
    const ativas = salasList.filter((s) => s.ativa);
    const defaultSala =
      ativas.find((s) => s.slug === 'sala-teatro')?.id ?? ativas[0]?.id ?? '';
    setSalaFiltro((prev) => {
      if (prev === null) return defaultSala;
      if (prev === '') return '';
      if (salasList.some((s) => s.id === prev)) return prev;
      return defaultSala;
    });
    return { salasList, defaultSala };
  }, [isAdmin]);

  const loadReservas = useCallback(async () => {
    if (salaFiltro === null) return;
    const reservasList = await listAluguelReservas(mes, ano, salaFiltro || undefined);
    setReservas(reservasList);
  }, [mes, ano, salaFiltro]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await loadSalas();
        if (cancelled) return;
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSalas]);

  useEffect(() => {
    if (salaFiltro === null) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await loadReservas();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadReservas, salaFiltro]);

  const reloadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadSalas();
      await loadReservas();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [loadSalas, loadReservas]);

  const reservasPorDia = useMemo(() => {
    const m = new Map<string, AluguelReserva[]>();
    for (const r of reservas) {
      const list = m.get(r.data) ?? [];
      list.push(r);
      m.set(r.data, list);
    }
    return m;
  }, [reservas]);

  const slots = useMemo(() => buildCalendarSlots(mes, ano), [mes, ano]);
  const salasAtivas = useMemo(() => salas.filter((s) => s.ativa), [salas]);
  const salaDefaultId = salasAtivas.find((s) => s.slug === 'sala-teatro')?.id ?? salasAtivas[0]?.id ?? '';

  const shiftMonth = (delta: number) => {
    let m = mes + delta;
    let a = ano;
    if (m < 1) {
      m = 12;
      a -= 1;
    } else if (m > 12) {
      m = 1;
      a += 1;
    }
    setMes(m);
    setAno(a);
  };

  const openNew = (data: string) => {
    setForm(emptyForm(salaFiltro || salaDefaultId, data));
    setNotice(null);
  };

  const openEdit = (r: AluguelReserva) => {
    setForm({
      id: r.id,
      sala_id: r.sala_id,
      titulo: r.titulo,
      data: r.data,
      hora_inicio: r.hora_inicio.slice(0, 5),
      hora_fim: r.hora_fim.slice(0, 5),
      observacao: r.observacao ?? '',
    });
    setNotice(null);
  };

  const saveForm = async () => {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      if (form.id) {
        await patchAluguelReserva(form.id, {
          sala_id: form.sala_id,
          titulo: form.titulo,
          data: form.data,
          hora_inicio: form.hora_inicio,
          hora_fim: form.hora_fim,
          observacao: form.observacao || null,
        });
      } else {
        await createAluguelReserva({
          sala_id: form.sala_id,
          titulo: form.titulo,
          data: form.data,
          hora_inicio: form.hora_inicio,
          hora_fim: form.hora_fim,
          observacao: form.observacao || null,
        });
      }
      setForm(null);
      await reloadAll();
      setNotice('Reserva salva.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const removeReserva = async () => {
    if (!form?.id) return;
    if (!window.confirm('Excluir esta reserva?')) return;
    setSaving(true);
    try {
      await deleteAluguelReserva(form.id);
      setForm(null);
      await reloadAll();
      setNotice('Reserva excluída.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const criarSala = async () => {
    if (!novaSalaNome.trim()) return;
    setSaving(true);
    try {
      await createAluguelSala({
        nome: novaSalaNome.trim(),
        classificacao: novaSalaClass,
        ativa: true,
      });
      setNovaSalaNome('');
      await reloadAll();
      setNotice('Sala criada.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleSalaAtiva = async (sala: AluguelSala) => {
    setSaving(true);
    try {
      await patchAluguelSala(sala.id, { ativa: !sala.ativa });
      await reloadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const adicionarNumeroWhatsApp = () => {
    const norm = normalizarNumeroWhatsApp(novoNumeroWhatsApp);
    if (norm.length < 12) {
      setError('Número inválido. Use DDD + número (ex.: 71 99275-0807).');
      return;
    }
    if (whatsappNumeros.includes(norm)) {
      setWhatsappSelecionado(norm);
      setNovoNumeroWhatsApp('');
      setMostrarAddNumero(false);
      setNotice('Número já estava na lista; selecionado.');
      return;
    }
    const novaLista = [...whatsappNumeros, norm];
    setWhatsappNumeros(novaLista);
    saveWhatsAppNumeros(novaLista);
    setWhatsappSelecionado(norm);
    setNovoNumeroWhatsApp('');
    setMostrarAddNumero(false);
    setError(null);
    setNotice(`Número ${formatarNumeroExibicao(norm)} adicionado.`);
  };

  const handleWhatsApp = async (mode: 'copy' | 'open') => {
    setResumoBusy(true);
    setError(null);
    try {
      const resumo = await getAluguelResumoWhatsApp(mes, ano, salaFiltro || undefined);
      if (mode === 'copy') {
        await navigator.clipboard.writeText(resumo.texto);
        setNotice('Texto do resumo copiado.');
      } else {
        const num = normalizarNumeroWhatsApp(whatsappSelecionado || NUMERO_PADRAO);
        const url = `https://wa.me/${num}?text=${encodeURIComponent(resumo.texto)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setResumoBusy(false);
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <Topbar
        title="Aluguel de salas"
        subtitle="Calendário de reservas (Sala do Teatro e outras salas)"
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          onClick={() => shiftMonth(-1)}
        >
          ←
        </button>
        <span className="min-w-[10rem] text-center text-sm font-semibold capitalize text-slate-800 dark:text-slate-100">
          {monthTitle(mes, ano)}
        </span>
        <button
          type="button"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          onClick={() => shiftMonth(1)}
        >
          →
        </button>

        <label className="ml-2 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          Sala
          <select
            className="select-with-chevron rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            value={salaFiltro ?? ''}
            onChange={(e) => setSalaFiltro(e.target.value)}
          >
            <option value="">Todas</option>
            {salasAtivas.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </label>

        <div className="ml-auto flex flex-col items-stretch gap-2 sm:items-end">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">Enviar para:</span>
            <select
              className="select-with-chevron rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-800"
              value={whatsappSelecionado}
              onChange={(e) => setWhatsappSelecionado(e.target.value)}
              title="Número WhatsApp (compartilhado com Relatórios IA)"
            >
              {whatsappNumeros.map((n) => (
                <option key={n} value={n}>
                  {formatarNumeroExibicao(n)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setMostrarAddNumero((v) => !v)}
              className="text-xs text-slate-500 underline hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              {mostrarAddNumero ? 'Cancelar' : '+ Adicionar número'}
            </button>
            <button
              type="button"
              disabled={resumoBusy}
              onClick={() => void handleWhatsApp('copy')}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            >
              Copiar texto
            </button>
            <button
              type="button"
              disabled={resumoBusy}
              onClick={() => void handleWhatsApp('open')}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Abrir WhatsApp
            </button>
            {isAdmin ? (
              <button
                type="button"
                onClick={() => setShowSalasAdmin((v) => !v)}
                className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-100"
              >
                {showSalasAdmin ? 'Fechar salas' : 'Gerenciar salas'}
              </button>
            ) : null}
          </div>
          {mostrarAddNumero ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900/50">
              <input
                type="tel"
                placeholder="Ex.: 71 99275-0807 ou 71992750807"
                value={novoNumeroWhatsApp}
                onChange={(e) => setNovoNumeroWhatsApp(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    adicionarNumeroWhatsApp();
                  }
                }}
                className="w-52 rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
              />
              <button
                type="button"
                onClick={adicionarNumeroWhatsApp}
                className="rounded bg-slate-700 px-3 py-1.5 text-sm text-white hover:bg-slate-800"
              >
                Salvar número
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {notice ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      {isAdmin && showSalasAdmin ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">Salas</h2>
          <ul className="mb-4 space-y-2 text-sm">
            {salas.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-700"
              >
                <span>
                  <span
                    className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: s.cor ?? '#64748b' }}
                  />
                  <strong>{s.nome}</strong>
                  <span className="ml-2 text-xs text-slate-500">
                    {CLASSIFICACAO_LABEL[s.classificacao]} · {s.ativa ? 'ativa' : 'inativa'}
                  </span>
                </span>
                <button
                  type="button"
                  className="text-xs text-indigo-600 hover:underline"
                  onClick={() => void toggleSalaAtiva(s)}
                >
                  {s.ativa ? 'Desativar' : 'Ativar'}
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-slate-600 dark:text-slate-300">
              Nova sala
              <input
                className="mt-1 block w-48 rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
                value={novaSalaNome}
                onChange={(e) => setNovaSalaNome(e.target.value)}
                placeholder="Ex.: Sala 2"
              />
            </label>
            <label className="text-xs text-slate-600 dark:text-slate-300">
              Classificação
              <select
                className="select-with-chevron mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
                value={novaSalaClass}
                onChange={(e) => setNovaSalaClass(e.target.value as AluguelClassificacao)}
              >
                {(Object.keys(CLASSIFICACAO_LABEL) as AluguelClassificacao[]).map((c) => (
                  <option key={c} value={c}>
                    {CLASSIFICACAO_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={saving || !novaSalaNome.trim()}
              onClick={() => void criarSala()}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Adicionar
            </button>
          </div>
        </section>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-700">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="bg-slate-50 px-2 py-2 text-center text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {slots.map((slot, idx) => {
              if (!slot) {
                return (
                  <div
                    key={`e-${idx}`}
                    className="min-h-[6.5rem] border-b border-r border-slate-100 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/40"
                  />
                );
              }
              const dayReservas = reservasPorDia.get(slot.data) ?? [];
              return (
                <button
                  key={slot.data}
                  type="button"
                  onClick={() => openNew(slot.data)}
                  className="min-h-[6.5rem] border-b border-r border-slate-100 p-1.5 text-left align-top hover:bg-indigo-50/40 dark:border-slate-800 dark:hover:bg-indigo-950/30"
                >
                  <div className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-200">{slot.day}</div>
                  <div className="space-y-1">
                    {dayReservas.slice(0, 3).map((r) => (
                      <div
                        key={r.id}
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(r);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.stopPropagation();
                            openEdit(r);
                          }
                        }}
                        className="truncate rounded px-1 py-0.5 text-[10px] font-medium text-white"
                        style={{ backgroundColor: r.sala?.cor ?? '#7c3aed' }}
                        title={`${r.hora_inicio}–${r.hora_fim} ${r.titulo}`}
                      >
                        {r.hora_inicio} {r.titulo}
                      </div>
                    ))}
                    {dayReservas.length > 3 ? (
                      <div className="text-[10px] text-slate-500">+{dayReservas.length - 3}</div>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-xs text-slate-500">
        Clique em um dia para nova reserva. Clique em um evento para editar. Use Copiar texto / Abrir WhatsApp
        para enviar o resumo do mês à gerência.
      </p>

      {form ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <h3 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100">
              {form.id ? 'Editar reserva' : 'Nova reserva'}
            </h3>
            <div className="space-y-3 text-sm">
              <label className="block">
                Sala
                <select
                  className="select-with-chevron mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
                  value={form.sala_id}
                  onChange={(e) => setForm((f) => (f ? { ...f, sala_id: e.target.value } : f))}
                >
                  {salasAtivas.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                Evento
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
                  value={form.titulo}
                  onChange={(e) => setForm((f) => (f ? { ...f, titulo: e.target.value } : f))}
                  placeholder="Ex.: Ensaio Cia X"
                />
              </label>
              <label className="block">
                Data
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
                  value={form.data}
                  onChange={(e) => setForm((f) => (f ? { ...f, data: e.target.value } : f))}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  Início
                  <input
                    type="time"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
                    value={form.hora_inicio}
                    onChange={(e) => setForm((f) => (f ? { ...f, hora_inicio: e.target.value } : f))}
                  />
                </label>
                <label className="block">
                  Fim
                  <input
                    type="time"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
                    value={form.hora_fim}
                    onChange={(e) => setForm((f) => (f ? { ...f, hora_fim: e.target.value } : f))}
                  />
                </label>
              </div>
              <label className="block">
                Observação
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
                  rows={2}
                  value={form.observacao}
                  onChange={(e) => setForm((f) => (f ? { ...f, observacao: e.target.value } : f))}
                />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap justify-between gap-2">
              <div>
                {form.id ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void removeReserva()}
                    className="rounded-lg px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50 dark:text-rose-300"
                  >
                    Excluir
                  </button>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm(null)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={saving || !form.titulo.trim() || !form.sala_id}
                  onClick={() => void saveForm()}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
