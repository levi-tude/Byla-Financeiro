import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createValidacaoVinculo,
  getFluxoOperacionalPagamentos,
  getTransacoesPorMes,
  type FluxoOperacionalPagamento,
  type TransacaoItem,
} from '../../services/backendApi';

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateBr(iso: string): string {
  const d = (iso ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return iso;
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function planilhaIdFromFluxo(f: FluxoOperacionalPagamento): string {
  if (f.planilha_id?.trim()) return f.planilha_id.trim();
  return `fluxo::${f.id}`;
}

export type BancoExcecaoPreselect = {
  id: string;
  pessoa: string;
  valor: number;
  data: string;
  descricao?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  mesInicial: number;
  anoInicial: number;
  bancoPreselecionado?: BancoExcecaoPreselect | null;
  fluxoPreselecionado?: FluxoOperacionalPagamento | null;
  onSuccess?: () => void;
};

export function ValidacaoVinculoExcecaoDialog({
  open,
  onClose,
  mesInicial,
  anoInicial,
  bancoPreselecionado,
  fluxoPreselecionado,
  onSuccess,
}: Props) {
  const queryClient = useQueryClient();
  const [mes, setMes] = useState(mesInicial);
  const [ano, setAno] = useState(anoInicial);
  const [buscaBanco, setBuscaBanco] = useState('');
  const [buscaFluxo, setBuscaFluxo] = useState('');
  const [bancoId, setBancoId] = useState<string | null>(bancoPreselecionado?.id ?? null);
  const [fluxoId, setFluxoId] = useState<string | null>(fluxoPreselecionado?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMes(mesInicial);
    setAno(anoInicial);
    setBuscaBanco('');
    setBuscaFluxo('');
    setBancoId(bancoPreselecionado?.id ?? null);
    setFluxoId(fluxoPreselecionado?.id ?? null);
    setErro(null);
  }, [open, mesInicial, anoInicial, bancoPreselecionado, fluxoPreselecionado]);

  const bancoQuery = useQuery({
    queryKey: ['excecao-vinculo-banco', mes, ano, buscaBanco],
    queryFn: () =>
      getTransacoesPorMes(mes, ano, 'entrada', {
        q: buscaBanco.trim() || undefined,
        limit: 150,
        visao: 'caixa',
      }),
    enabled: open,
  });

  const fluxoQuery = useQuery({
    queryKey: ['excecao-vinculo-fluxo', mes, ano, buscaFluxo],
    queryFn: () =>
      getFluxoOperacionalPagamentos({
        mes,
        ano,
        q: buscaFluxo.trim() || undefined,
        limit: 120,
      }),
    enabled: open,
  });

  const bancos = bancoQuery.data?.itens ?? [];
  const fluxos = fluxoQuery.data?.itens ?? [];

  const bancoSel = useMemo(() => {
    if (bancoPreselecionado && bancoId === bancoPreselecionado.id) return bancoPreselecionado;
    const found = bancos.find((t) => t.id === bancoId);
    if (!found) return null;
    return {
      id: found.id,
      pessoa: found.pessoa ?? '',
      valor: Number(found.valor ?? 0),
      data: found.data,
      descricao: found.descricao,
    };
  }, [bancoPreselecionado, bancoId, bancos]);

  const fluxoSel = useMemo(() => {
    if (fluxoPreselecionado && fluxoId === fluxoPreselecionado.id) return fluxoPreselecionado;
    return fluxos.find((f) => f.id === fluxoId) ?? null;
  }, [fluxoPreselecionado, fluxoId, fluxos]);

  const podeConfirmar = Boolean(bancoSel && fluxoSel && !saving);

  async function confirmar() {
    if (!bancoSel || !fluxoSel) return;
    setSaving(true);
    setErro(null);
    try {
      const dataRef = (fluxoSel.data_pagamento ?? '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dataRef)) {
        throw new Error('Data do pagamento no fluxo inválida.');
      }
      const mesComp = fluxoSel.mes_competencia >= 1 ? fluxoSel.mes_competencia : mes;
      const anoComp = fluxoSel.ano_competencia >= 2000 ? fluxoSel.ano_competencia : ano;

      await createValidacaoVinculo(dataRef, mesComp, anoComp, bancoSel.id, [planilhaIdFromFluxo(fluxoSel)], {
        observacao: 'excecao_admin',
      });

      void queryClient.invalidateQueries({ queryKey: ['validacao-pagamentos-diaria'] });
      void queryClient.invalidateQueries({ queryKey: ['matches-provaveis'] });
      void queryClient.invalidateQueries({ queryKey: ['fluxo-operacional-pagamentos'] });
      void queryClient.invalidateQueries({ queryKey: ['cadastro-alunos-resumo'] });
      void queryClient.invalidateQueries({ queryKey: ['financas-alunos'] });
      void queryClient.invalidateQueries({ queryKey: ['conciliacao-pagamentos'] });
      void queryClient.invalidateQueries({ queryKey: ['transacoes'] });
      onSuccess?.();
      onClose();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Vincular exceção"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-violet-200 bg-white shadow-xl dark:border-violet-800 dark:bg-slate-900">
        <div className="border-b border-violet-100 bg-violet-50 px-5 py-4 dark:border-violet-900 dark:bg-violet-950/40">
          <h2 className="text-base font-semibold text-violet-950 dark:text-violet-100">Vincular em exceção</h2>
          <p className="mt-1 text-xs text-violet-800 dark:text-violet-200">
            Escolha livremente uma entrada do extrato e um pagamento do fluxo — sem exigir match, valor ou mesmo dia.
            Salva como vínculo normal e atualiza classificação / controle.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3 text-sm dark:border-slate-800">
          <label className="flex items-center gap-2">
            <span className="text-slate-600 dark:text-slate-400">Mês ref.</span>
            <select
              className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
              value={mes}
              onChange={(e) => setMes(Number(e.target.value))}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {String(m).padStart(2, '0')}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-slate-600 dark:text-slate-400">Ano</span>
            <input
              type="number"
              className="w-20 rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
              value={ano}
              onChange={(e) => setAno(Number(e.target.value))}
            />
          </label>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-auto p-5 md:grid-cols-2">
          <section className="flex min-h-0 flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Extrato (entrada)</h3>
            <input
              type="search"
              placeholder="Buscar pessoa ou descrição…"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
              value={buscaBanco}
              onChange={(e) => setBuscaBanco(e.target.value)}
            />
            <div className="min-h-[12rem] flex-1 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
              {bancoPreselecionado && bancoId === bancoPreselecionado.id && !bancos.some((b) => b.id === bancoId) ? (
                <button
                  type="button"
                  className={`block w-full border-b px-3 py-2 text-left text-xs hover:bg-violet-50 ${
                    bancoId === bancoPreselecionado.id ? 'bg-violet-100 font-medium' : ''
                  }`}
                  onClick={() => setBancoId(bancoPreselecionado.id)}
                >
                  {bancoPreselecionado.pessoa || '(sem nome)'} · {formatCurrency(bancoPreselecionado.valor)} ·{' '}
                  {formatDateBr(bancoPreselecionado.data)}
                </button>
              ) : null}
              {bancos.map((t: TransacaoItem) => (
                <button
                  key={t.id}
                  type="button"
                  className={`block w-full border-b border-slate-100 px-3 py-2 text-left text-xs hover:bg-violet-50 dark:border-slate-800 ${
                    bancoId === t.id ? 'bg-violet-100 font-medium dark:bg-violet-950/50' : ''
                  }`}
                  onClick={() => setBancoId(t.id)}
                >
                  {t.pessoa || t.descricao || '(sem nome)'} · {formatCurrency(Math.abs(Number(t.valor ?? 0)))} ·{' '}
                  {formatDateBr(t.data)}
                </button>
              ))}
              {!bancoQuery.isLoading && bancos.length === 0 ? (
                <p className="p-3 text-xs text-slate-500">Nenhuma entrada neste mês.</p>
              ) : null}
            </div>
          </section>

          <section className="flex min-h-0 flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fluxo (pagamento)</h3>
            <input
              type="search"
              placeholder="Buscar aluno, modalidade…"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
              value={buscaFluxo}
              onChange={(e) => setBuscaFluxo(e.target.value)}
            />
            <div className="min-h-[12rem] flex-1 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
              {fluxos.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`block w-full border-b border-slate-100 px-3 py-2 text-left text-xs hover:bg-violet-50 dark:border-slate-800 ${
                    fluxoId === f.id ? 'bg-violet-100 font-medium dark:bg-violet-950/50' : ''
                  } ${f.status_extrato === 'validado' ? 'opacity-60' : ''}`}
                  onClick={() => setFluxoId(f.id)}
                >
                  <span className="font-medium">{f.aluno_nome}</span>
                  <span className="text-slate-500">
                    {' '}
                    · {f.aba} / {f.modalidade} · {formatCurrency(Number(f.valor ?? 0))} ·{' '}
                    {formatDateBr(f.data_pagamento)}
                  </span>
                  {f.status_extrato === 'validado' ? (
                    <span className="ml-1 text-[10px] text-emerald-700">(já validado)</span>
                  ) : null}
                </button>
              ))}
              {!fluxoQuery.isLoading && fluxos.length === 0 ? (
                <p className="p-3 text-xs text-slate-500">Nenhum pagamento no fluxo neste mês.</p>
              ) : null}
            </div>
          </section>
        </div>

        {(bancoSel || fluxoSel) && (
          <div className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-xs dark:border-slate-800 dark:bg-slate-950/50">
            {bancoSel ? (
              <p>
                <strong>Extrato:</strong> {bancoSel.pessoa} · {formatCurrency(bancoSel.valor)} ·{' '}
                {formatDateBr(bancoSel.data)}
              </p>
            ) : null}
            {fluxoSel ? (
              <p className="mt-1">
                <strong>Fluxo:</strong> {fluxoSel.aluno_nome} · {fluxoSel.aba} · {formatCurrency(fluxoSel.valor)} ·{' '}
                {formatDateBr(fluxoSel.data_pagamento)} · competência {fluxoSel.mes_competencia}/{fluxoSel.ano_competencia}
              </p>
            ) : null}
          </div>
        )}

        {erro ? (
          <p className="px-5 pb-2 text-xs font-medium text-red-700" role="alert">
            {erro}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 dark:border-slate-600"
            disabled={saving}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800 disabled:opacity-50"
            disabled={!podeConfirmar}
            onClick={() => void confirmar()}
          >
            {saving ? 'Salvando…' : 'Confirmar vínculo exceção'}
          </button>
        </div>
      </div>
    </div>
  );
}
