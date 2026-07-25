import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '../app/Topbar';
import { FilterBar } from '../components/finance/FilterBar';
import { EmptyState, ErrorPanel, LoadingRow } from '../components/finance/StateBlocks';
import { formatBrl, formatDate } from '../components/finance/classificacao/utils';
import {
  listAssinaturasCreditoRecorrente,
  patchAssinaturaCreditoRecorrente,
  upsertAssinaturaCreditoRecorrente,
  type AssinaturaCreditoRecorrente,
  type StatusBylaAssinatura,
  type UpsertAssinaturaCreditoRecorrenteBody,
} from '../services/backendApi';
import { useToast } from '../context/ToastContext';

const STATUS_BYLA_LABEL: Record<StatusBylaAssinatura, string> = {
  ativa: 'Ativa',
  cancelada: 'Cancelada',
  parou_de_pagar: 'Parou de pagar',
  concluida: 'Plano concluído',
};

function statusBylaBadgeClass(status: StatusBylaAssinatura): string {
  if (status === 'ativa') {
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200';
  }
  if (status === 'concluida') {
    return 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200';
  }
  if (status === 'parou_de_pagar') {
    return 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200';
  }
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
}

function normalizeSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

type FormState = {
  mode: 'create' | 'edit';
  pagbank_subs_id: string;
  pagbank_cust_id: string;
  nome_exibicao: string;
  status_pagbank: 'Ativa' | 'Cancelada';
  valor_bruto: string;
  plano_rotulo: string;
  dia_cobranca: string;
  ciclo_atual: string;
  ciclo_total: string;
  proxima_cobranca: string;
  offset_dias_extrato: string;
  ativo: boolean;
  editId?: string;
};

const emptyForm = (): FormState => ({
  mode: 'create',
  pagbank_subs_id: '',
  pagbank_cust_id: '',
  nome_exibicao: '',
  status_pagbank: 'Ativa',
  valor_bruto: '',
  plano_rotulo: '',
  dia_cobranca: '5',
  ciclo_atual: '1',
  ciclo_total: '1',
  proxima_cobranca: '',
  offset_dias_extrato: '5',
  ativo: true,
});

function formFromAssinatura(a: AssinaturaCreditoRecorrente): FormState {
  return {
    mode: 'edit',
    editId: a.id,
    pagbank_subs_id: a.pagbank_subs_id,
    pagbank_cust_id: a.pagbank_cust_id ?? '',
    nome_exibicao: a.nome_exibicao,
    status_pagbank: a.status_pagbank,
    valor_bruto: String(a.valor_bruto),
    plano_rotulo: a.plano_rotulo ?? '',
    dia_cobranca: String(a.dia_cobranca),
    ciclo_atual: String(a.ciclo_atual),
    ciclo_total: String(a.ciclo_total),
    proxima_cobranca: a.proxima_cobranca ?? '',
    offset_dias_extrato: String(a.offset_dias_extrato),
    ativo: a.ativo,
  };
}

function buildUpsertBody(form: FormState): UpsertAssinaturaCreditoRecorrenteBody {
  const valor = Number(form.valor_bruto.replace(',', '.'));
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new Error('Informe um valor bruto válido.');
  }
  const proxima = form.proxima_cobranca.trim();
  return {
    pagbank_subs_id: form.pagbank_subs_id.trim(),
    pagbank_cust_id: form.pagbank_cust_id.trim() || null,
    nome_exibicao: form.nome_exibicao.trim(),
    status_pagbank: form.status_pagbank,
    valor_bruto: valor,
    plano_rotulo: form.plano_rotulo.trim() || null,
    dia_cobranca: Number(form.dia_cobranca),
    ciclo_atual: Number(form.ciclo_atual),
    ciclo_total: Number(form.ciclo_total),
    proxima_cobranca: proxima || null,
    offset_dias_extrato: Number(form.offset_dias_extrato) || 5,
    ativo: form.ativo,
  };
}

export function AssinaturasCreditoRecorrentePage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState('');
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['assinaturas-credito-recorrente'],
    queryFn: () => listAssinaturasCreditoRecorrente(),
  });

  const assinaturas = query.data?.assinaturas ?? [];

  const assinaturasFiltradas = useMemo(() => {
    const q = normalizeSearch(busca);
    if (!q) return assinaturas;
    return assinaturas.filter((a) => {
      const hay = normalizeSearch(
        `${a.nome_exibicao} ${a.plano_rotulo ?? ''} ${a.pagbank_subs_id} ${STATUS_BYLA_LABEL[a.status_byla]}`,
      );
      return hay.includes(q);
    });
  }, [assinaturas, busca]);

  const saveMutation = useMutation({
    mutationFn: async (current: FormState) => {
      const body = buildUpsertBody(current);
      if (current.mode === 'edit' && current.editId) {
        const { pagbank_subs_id: _subs, ...patchBody } = body;
        return patchAssinaturaCreditoRecorrente(current.editId, patchBody);
      }
      return upsertAssinaturaCreditoRecorrente(body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['assinaturas-credito-recorrente'] });
      setForm(null);
      setFormError(null);
      showToast('Assinatura salva.', 'success');
    },
    onError: (e) => {
      setFormError(e instanceof Error ? e.message : String(e));
    },
  });

  const chips = busca.trim()
    ? [{ id: 'busca', label: `Busca: ${busca.trim()}`, onRemove: () => setBusca('') }]
    : [];

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <Topbar
        title="Assinaturas (crédito recorrente)"
        subtitle="Cadastro espelhado do PagBank Assinaturas — quem paga por cartão recorrente"
      />

      <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-100">
        Mantenha alinhado ao painel PagBank. Assinaturas com ciclo completo (ex.: 5/5) aparecem como
        plano concluído — sem próxima cobrança e sem alerta de parada na Conciliação.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setForm(emptyForm());
            setFormError(null);
          }}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
        >
          Nova assinatura
        </button>
      </div>

      {query.error ? (
        <ErrorPanel
          message={
            query.error instanceof Error
              ? query.error.message
              : 'Não foi possível carregar as assinaturas.'
          }
          action={
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-medium hover:bg-rose-100 dark:border-rose-800 dark:hover:bg-rose-950/60"
            >
              Tentar de novo
            </button>
          }
        />
      ) : null}

      <FilterBar
        title="Filtros"
        subtitle="Busque pelo nome, plano ou código SUBS do PagBank."
        chips={chips}
        onClear={busca.trim() ? () => setBusca('') : undefined}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
          <div className="sm:col-span-2 lg:col-span-6">
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Busca
            </label>
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome, plano ou SUBS…"
              autoComplete="off"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
        </div>
      </FilterBar>

      {!query.isLoading && assinaturas.length > 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Mostrando{' '}
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {assinaturasFiltradas.length}
          </span>{' '}
          de{' '}
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {assinaturas.length}
          </span>{' '}
          assinaturas.
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2.5 font-medium">Nome</th>
              <th className="px-3 py-2.5 font-medium">PagBank</th>
              <th className="px-3 py-2.5 font-medium">Status Byla</th>
              <th className="px-3 py-2.5 font-medium">Ciclo</th>
              <th className="px-3 py-2.5 font-medium">Próxima</th>
              <th className="px-3 py-2.5 font-medium">Valor</th>
              <th className="px-3 py-2.5 font-medium">Ação</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              <LoadingRow colSpan={7} rows={5} />
            ) : assinaturasFiltradas.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-4">
                  <EmptyState
                    message={
                      assinaturas.length === 0
                        ? 'Nenhuma assinatura cadastrada ainda.'
                        : 'Nenhum resultado com a busca atual.'
                    }
                  />
                </td>
              </tr>
            ) : (
              assinaturasFiltradas.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                >
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-slate-800 dark:text-slate-100">
                      {a.nome_exibicao}
                    </div>
                    {a.plano_rotulo ? (
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {a.plano_rotulo}
                      </div>
                    ) : null}
                    {a.status_byla === 'concluida' ? (
                      <p className="mt-1 text-xs text-sky-700 dark:text-sky-300">
                        Plano de cobranças <strong>concluído</strong> (ciclo completo). Sem próxima
                        cobrança.
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">
                    {a.status_pagbank}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusBylaBadgeClass(a.status_byla)}`}
                    >
                      {STATUS_BYLA_LABEL[a.status_byla]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-600 dark:text-slate-300">
                    {a.ciclo_atual}/{a.ciclo_total}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-600 dark:text-slate-300">
                    {a.proxima_cobranca ? formatDate(a.proxima_cobranca) : '—'}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-600 dark:text-slate-300">
                    {formatBrl(a.valor_bruto)}
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setForm(formFromAssinatura(a));
                        setFormError(null);
                      }}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {form ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="assinatura-form-title"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <h2 id="assinatura-form-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {form.mode === 'create' ? 'Nova assinatura' : 'Editar assinatura'}
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Dados do PagBank Assinaturas (SUBS, ciclo, valor bruto).
            </p>

            {formError ? (
              <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                {formError}
              </p>
            ) : null}

            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!form.pagbank_subs_id.trim() || !form.nome_exibicao.trim()) {
                  setFormError('Preencha SUBS e nome de exibição.');
                  return;
                }
                saveMutation.mutate(form);
              }}
            >
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">SUBS PagBank</label>
                <input
                  value={form.pagbank_subs_id}
                  onChange={(e) => setForm({ ...form, pagbank_subs_id: e.target.value })}
                  disabled={form.mode === 'edit'}
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:disabled:bg-slate-800/60"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  CUST PagBank (opcional)
                </label>
                <input
                  value={form.pagbank_cust_id}
                  onChange={(e) => setForm({ ...form, pagbank_cust_id: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Nome de exibição
                </label>
                <input
                  value={form.nome_exibicao}
                  onChange={(e) => setForm({ ...form, nome_exibicao: e.target.value })}
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Status PagBank
                  </label>
                  <select
                    value={form.status_pagbank}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        status_pagbank: e.target.value as 'Ativa' | 'Cancelada',
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                  >
                    <option value="Ativa">Ativa</option>
                    <option value="Cancelada">Cancelada</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Valor bruto (R$)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.valor_bruto}
                    onChange={(e) => setForm({ ...form, valor_bruto: e.target.value })}
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Plano (rótulo)
                </label>
                <input
                  value={form.plano_rotulo}
                  onChange={(e) => setForm({ ...form, plano_rotulo: e.target.value })}
                  placeholder="Ex.: 225 - 3 Meses"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Dia cobrança
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={form.dia_cobranca}
                    onChange={(e) => setForm({ ...form, dia_cobranca: e.target.value })}
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Ciclo atual</label>
                  <input
                    type="number"
                    min={0}
                    value={form.ciclo_atual}
                    onChange={(e) => setForm({ ...form, ciclo_atual: e.target.value })}
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Ciclo total</label>
                  <input
                    type="number"
                    min={1}
                    value={form.ciclo_total}
                    onChange={(e) => setForm({ ...form, ciclo_total: e.target.value })}
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Próxima cobrança
                  </label>
                  <input
                    type="date"
                    value={form.proxima_cobranca}
                    onChange={(e) => setForm({ ...form, proxima_cobranca: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Offset extrato (dias)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={45}
                    value={form.offset_dias_extrato}
                    onChange={(e) => setForm({ ...form, offset_dias_extrato: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={form.ativo}
                  onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                />
                Assinatura ativa no cadastro
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setForm(null);
                    setFormError(null);
                  }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 dark:bg-indigo-500"
                >
                  {saveMutation.isPending ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
