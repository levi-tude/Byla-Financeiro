import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '../app/Topbar';
import { MonthYearPicker } from '../components/ui/MonthYearPicker';
import { useMonthYear } from '../context/MonthYearContext';
import {
  getControleCaixa,
  putControleCaixa,
  type ControleCaixaBloco,
  type ControleCaixaResponse,
} from '../services/backendApi';
import { useToast } from '../context/ToastContext';
import { ApiErrorPanel } from '../components/ui/ApiErrorPanel';

type DraftState = {
  abaRef: string;
  totais: ControleCaixaResponse['totais'];
  blocos: ControleCaixaBloco[];
};

function cloneState(data: ControleCaixaResponse): DraftState {
  return {
    abaRef: data.abaRef ?? '',
    totais: { ...data.totais },
    blocos: data.blocos.map((b) => ({
      ...b,
      linhas: b.linhas.map((l) => ({ ...l })),
    })),
  };
}

function parseNullableNumber(raw: string): number | null {
  const v = raw.trim().replace(',', '.');
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function ControleCaixaPage() {
  const { monthYear } = useMonthYear();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<DraftState | null>(null);

  const controleQuery = useQuery({
    queryKey: ['controle-caixa', monthYear.mes, monthYear.ano],
    queryFn: () => getControleCaixa(monthYear.mes, monthYear.ano),
  });

  useEffect(() => {
    if (controleQuery.data) {
      setDraft(cloneState(controleQuery.data));
    }
  }, [controleQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (state: DraftState) =>
      putControleCaixa(monthYear.mes, monthYear.ano, {
        abaRef: state.abaRef.trim() || null,
        totais: state.totais,
        blocos: state.blocos,
      }),
    onSuccess: async (data) => {
      setDraft(cloneState(data));
      showToast('Alterações salvas no Supabase.', 'success');
      await queryClient.invalidateQueries({ queryKey: ['controle-caixa', monthYear.mes, monthYear.ano] });
      await queryClient.invalidateQueries({ queryKey: ['fluxo-completo', monthYear.mes, monthYear.ano] });
    },
    onError: (e) => {
      showToast(e instanceof Error ? e.message : String(e), 'error');
    },
  });

  const isDirty = useMemo(() => {
    if (!draft || !controleQuery.data) return false;
    return JSON.stringify(draft) !== JSON.stringify(cloneState(controleQuery.data));
  }, [draft, controleQuery.data]);

  return (
    <div className="p-6 space-y-6">
      <Topbar
        title="Controle de Caixa (edição)"
        subtitle="Editar blocos e linhas direto no sistema (Supabase)"
        childrenRight={<MonthYearPicker />}
      />

      {controleQuery.isLoading && <div className="text-sm text-gray-500">Carregando dados do mês...</div>}
      {controleQuery.error && (
        <ApiErrorPanel
          message={controleQuery.error instanceof Error ? controleQuery.error.message : 'Erro ao carregar controle.'}
          onRetry={() => controleQuery.refetch()}
        />
      )}

      {draft && (
        <>
          <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-slate-800">Cabeçalho e totais</h2>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <label className="text-sm text-slate-700">
                Aba de referência
                <input
                  value={draft.abaRef}
                  onChange={(e) => setDraft((prev) => (prev ? { ...prev, abaRef: e.target.value } : prev))}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                />
              </label>
              {[
                ['entradaTotal', 'Entrada total'],
                ['saidaTotal', 'Saída total'],
                ['lucroTotal', 'Lucro total'],
                ['saidaParceirosTotal', 'Saída parceiros'],
                ['saidaFixasTotal', 'Saída fixas'],
                ['saidaSomaSecoesPrincipais', 'Saída soma seções principais'],
              ].map(([key, label]) => (
                <label key={key} className="text-sm text-slate-700">
                  {label}
                  <input
                    value={draft.totais[key as keyof DraftState['totais']] ?? ''}
                    onChange={(e) =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              totais: {
                                ...prev.totais,
                                [key]: parseNullableNumber(e.target.value),
                              },
                            }
                          : prev
                      )
                    }
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                  />
                </label>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Blocos e linhas</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            blocos: [
                              ...prev.blocos,
                              { tipo: 'entrada', titulo: 'Novo bloco de entrada', ordem: prev.blocos.length, linhas: [] },
                            ],
                          }
                        : prev
                    )
                  }
                  className="rounded border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm text-blue-700"
                >
                  + Bloco entrada
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            blocos: [
                              ...prev.blocos,
                              { tipo: 'saida', titulo: 'Novo bloco de saída', ordem: prev.blocos.length, linhas: [] },
                            ],
                          }
                        : prev
                    )
                  }
                  className="rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-700"
                >
                  + Bloco saída
                </button>
              </div>
            </div>

            {draft.blocos.length === 0 && (
              <p className="text-sm text-slate-500">Sem blocos ainda para este mês. Use os botões acima para criar.</p>
            )}

            {draft.blocos.map((bloco, blocoIdx) => (
              <div key={`${bloco.tipo}-${blocoIdx}`} className="rounded-lg border border-slate-200 p-3 space-y-3">
                <div className="grid gap-2 md:grid-cols-4">
                  <label className="text-sm text-slate-700">
                    Tipo
                    <select
                      value={bloco.tipo}
                      onChange={(e) =>
                        setDraft((prev) => {
                          if (!prev) return prev;
                          const blocos = [...prev.blocos];
                          blocos[blocoIdx] = { ...blocos[blocoIdx], tipo: e.target.value as 'entrada' | 'saida' };
                          return { ...prev, blocos };
                        })
                      }
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                    >
                      <option value="entrada">entrada</option>
                      <option value="saida">saida</option>
                    </select>
                  </label>
                  <label className="text-sm text-slate-700 md:col-span-2">
                    Título
                    <input
                      value={bloco.titulo}
                      onChange={(e) =>
                        setDraft((prev) => {
                          if (!prev) return prev;
                          const blocos = [...prev.blocos];
                          blocos[blocoIdx] = { ...blocos[blocoIdx], titulo: e.target.value };
                          return { ...prev, blocos };
                        })
                      }
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                    />
                  </label>
                  <label className="text-sm text-slate-700">
                    Ordem
                    <input
                      value={bloco.ordem}
                      onChange={(e) =>
                        setDraft((prev) => {
                          if (!prev) return prev;
                          const blocos = [...prev.blocos];
                          blocos[blocoIdx] = { ...blocos[blocoIdx], ordem: Number(e.target.value || 0) };
                          return { ...prev, blocos };
                        })
                      }
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                    />
                  </label>
                </div>

                <div className="space-y-2">
                  {bloco.linhas.map((linha, linhaIdx) => (
                    <div key={`${blocoIdx}-${linhaIdx}`} className="grid gap-2 md:grid-cols-12">
                      <input
                        value={linha.label}
                        onChange={(e) =>
                          setDraft((prev) => {
                            if (!prev) return prev;
                            const blocos = [...prev.blocos];
                            const linhas = [...blocos[blocoIdx].linhas];
                            linhas[linhaIdx] = { ...linhas[linhaIdx], label: e.target.value };
                            blocos[blocoIdx] = { ...blocos[blocoIdx], linhas };
                            return { ...prev, blocos };
                          })
                        }
                        className="md:col-span-5 rounded border border-slate-300 px-2 py-1.5 text-sm"
                        placeholder="Label"
                      />
                      <input
                        value={linha.valor ?? ''}
                        onChange={(e) =>
                          setDraft((prev) => {
                            if (!prev) return prev;
                            const blocos = [...prev.blocos];
                            const linhas = [...blocos[blocoIdx].linhas];
                            linhas[linhaIdx] = { ...linhas[linhaIdx], valor: parseNullableNumber(e.target.value) };
                            blocos[blocoIdx] = { ...blocos[blocoIdx], linhas };
                            return { ...prev, blocos };
                          })
                        }
                        className="md:col-span-2 rounded border border-slate-300 px-2 py-1.5 text-sm"
                        placeholder="Valor numérico"
                      />
                      <input
                        value={linha.valorTexto ?? ''}
                        onChange={(e) =>
                          setDraft((prev) => {
                            if (!prev) return prev;
                            const blocos = [...prev.blocos];
                            const linhas = [...blocos[blocoIdx].linhas];
                            linhas[linhaIdx] = { ...linhas[linhaIdx], valorTexto: e.target.value || null };
                            blocos[blocoIdx] = { ...blocos[blocoIdx], linhas };
                            return { ...prev, blocos };
                          })
                        }
                        className="md:col-span-3 rounded border border-slate-300 px-2 py-1.5 text-sm"
                        placeholder="Valor texto"
                      />
                      <input
                        value={linha.ordem}
                        onChange={(e) =>
                          setDraft((prev) => {
                            if (!prev) return prev;
                            const blocos = [...prev.blocos];
                            const linhas = [...blocos[blocoIdx].linhas];
                            linhas[linhaIdx] = { ...linhas[linhaIdx], ordem: Number(e.target.value || 0) };
                            blocos[blocoIdx] = { ...blocos[blocoIdx], linhas };
                            return { ...prev, blocos };
                          })
                        }
                        className="md:col-span-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
                        placeholder="Ord."
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((prev) => {
                            if (!prev) return prev;
                            const blocos = [...prev.blocos];
                            blocos[blocoIdx] = {
                              ...blocos[blocoIdx],
                              linhas: blocos[blocoIdx].linhas.filter((_, i) => i !== linhaIdx),
                            };
                            return { ...prev, blocos };
                          })
                        }
                        className="md:col-span-1 rounded border border-rose-300 bg-rose-50 px-2 py-1.5 text-xs text-rose-700"
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((prev) => {
                        if (!prev) return prev;
                        const blocos = [...prev.blocos];
                        const linhas = [...blocos[blocoIdx].linhas];
                        linhas.push({ label: 'Nova linha', valor: null, valorTexto: null, ordem: linhas.length });
                        blocos[blocoIdx] = { ...blocos[blocoIdx], linhas };
                        return { ...prev, blocos };
                      })
                    }
                    className="rounded border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs text-slate-700"
                  >
                    + Linha
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((prev) =>
                        prev ? { ...prev, blocos: prev.blocos.filter((_, i) => i !== blocoIdx) } : prev
                      )
                    }
                    className="rounded border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs text-rose-700"
                  >
                    Excluir bloco
                  </button>
                </div>
              </div>
            ))}
          </section>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={!isDirty || saveMutation.isPending}
              onClick={() => draft && saveMutation.mutate(draft)}
              className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Salvando...' : 'Salvar no Supabase'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
