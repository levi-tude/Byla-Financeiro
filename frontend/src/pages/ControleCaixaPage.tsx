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
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

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
      isDefault: b.isDefault ?? false,
      isCustom: b.isCustom ?? !(b.isDefault ?? false),
      lockedLevel: b.lockedLevel ?? 'none',
      linhas: b.linhas.map((l) => ({ ...l })),
    })),
  };
}

function parseNullableNumber(raw: string): number | null {
  const v = raw
    .trim()
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatNullableCurrency(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  return BRL_FORMATTER.format(value);
}

function createDefaultDraft(): DraftState {
  const blocos: ControleCaixaBloco[] = [
    {
      tipo: 'entrada',
      titulo: 'Entradas Parceiros',
      ordem: 0,
      templateKey: 'entrada_parceiros',
      isDefault: true,
      isCustom: false,
      lockedLevel: 'strong',
      linhas: [
        'Pilates',
        'Dança',
        'Teatro',
        'Yoga',
        'Funcional',
        'Outros parceiros',
      ].map((label, ordem) => ({
        label,
        valor: null,
        valorTexto: null,
        ordem,
        templateKey: `ent_parc_${ordem}`,
        isDefault: true,
        isCustom: false,
        lockedLevel: 'warn',
      })),
    },
    {
      tipo: 'entrada',
      titulo: 'Entradas Aluguel / Coworking',
      ordem: 1,
      templateKey: 'entrada_aluguel_coworking',
      isDefault: true,
      isCustom: false,
      lockedLevel: 'strong',
      linhas: ['Aluguel sala 1', 'Aluguel sala 2', 'Coworking', 'Outras entradas aluguel'].map((label, ordem) => ({
        label,
        valor: null,
        valorTexto: null,
        ordem,
        templateKey: `ent_alug_${ordem}`,
        isDefault: true,
        isCustom: false,
        lockedLevel: 'warn',
      })),
    },
    {
      tipo: 'saida',
      titulo: 'Total Saídas (Parceiros)',
      ordem: 2,
      templateKey: 'saida_parceiros',
      isDefault: true,
      isCustom: false,
      lockedLevel: 'strong',
      linhas: ['Repasse Pilates', 'Repasse Dança', 'Repasse Teatro', 'Repasse Yoga', 'Repasse Funcional', 'Outros repasses'].map(
        (label, ordem) => ({
          label,
          valor: null,
          valorTexto: null,
          ordem,
          templateKey: `sai_parc_${ordem}`,
          isDefault: true,
          isCustom: false,
          lockedLevel: 'warn',
        })
      ),
    },
    {
      tipo: 'saida',
      titulo: 'Gastos Fixos',
      ordem: 3,
      templateKey: 'saida_gastos_fixos',
      isDefault: true,
      isCustom: false,
      lockedLevel: 'strong',
      linhas: [
        'Aluguel',
        'Energia',
        'Água',
        'Internet',
        'Salários / Pró-labore',
        'Impostos e taxas',
        'Sistemas / assinaturas',
        'Marketing',
        'Outros gastos fixos',
      ].map((label, ordem) => ({
        label,
        valor: null,
        valorTexto: null,
        ordem,
        templateKey: `sai_fix_${ordem}`,
        isDefault: true,
        isCustom: false,
        lockedLevel: 'warn',
      })),
    },
    {
      tipo: 'saida',
      titulo: 'Saídas Aluguel',
      ordem: 4,
      templateKey: 'saida_aluguel',
      isDefault: true,
      isCustom: false,
      lockedLevel: 'strong',
      linhas: ['Limpeza', 'Manutenção', 'Condomínio', 'Outras saídas aluguel'].map((label, ordem) => ({
        label,
        valor: null,
        valorTexto: null,
        ordem,
        templateKey: `sai_alug_${ordem}`,
        isDefault: true,
        isCustom: false,
        lockedLevel: 'warn',
      })),
    },
  ];
  return {
    abaRef: '',
    totais: {
      entradaTotal: null,
      saidaTotal: null,
      lucroTotal: null,
      saidaParceirosTotal: null,
      saidaFixasTotal: null,
      saidaSomaSecoesPrincipais: null,
    },
    blocos,
  };
}

type DeleteTarget =
  | null
  | { kind: 'bloco'; blocoIdx: number; titulo: string; strong: boolean }
  | { kind: 'linha'; blocoIdx: number; linhaIdx: number; label: string; strong: boolean };

type DefaultEditDecision =
  | null
  | {
      kind: 'bloco' | 'linha';
      blocoIdx: number;
      linhaIdx?: number;
      title: string;
      description: string;
    };

export function ControleCaixaPage() {
  const { monthYear } = useMonthYear();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [defaultEditDecision, setDefaultEditDecision] = useState<DefaultEditDecision>(null);

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

  const stats = useMemo(() => {
    if (!draft) {
      return { totalBlocos: 0, totalLinhas: 0, defaultBlocos: 0, defaultLinhas: 0, customLinhas: 0, percentPreservado: 0 };
    }
    const totalBlocos = draft.blocos.length;
    let totalLinhas = 0;
    let defaultLinhas = 0;
    let customLinhas = 0;
    const defaultBlocos = draft.blocos.filter((b) => b.isDefault).length;
    for (const b of draft.blocos) {
      totalLinhas += b.linhas.length;
      defaultLinhas += b.linhas.filter((l) => l.isDefault).length;
      customLinhas += b.linhas.filter((l) => l.isCustom).length;
    }
    const percentPreservado = totalLinhas === 0 ? 0 : Math.round((defaultLinhas / totalLinhas) * 100);
    return { totalBlocos, totalLinhas, defaultBlocos, defaultLinhas, customLinhas, percentPreservado };
  }, [draft]);

  const lastUpdateLabel = useMemo(() => {
    const raw = controleQuery.data?.updatedAt;
    if (!raw) return 'Ainda não salvo';
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? 'Ainda não salvo' : d.toLocaleString('pt-BR');
  }, [controleQuery.data?.updatedAt]);

  function applyDefaultDecisionConvertToCustom() {
    if (!defaultEditDecision) return;
    setDraft((prev) => {
      if (!prev) return prev;
      const blocos = [...prev.blocos];
      if (defaultEditDecision.kind === 'bloco') {
        const b = blocos[defaultEditDecision.blocoIdx];
        if (!b) return prev;
        blocos[defaultEditDecision.blocoIdx] = {
          ...b,
          isDefault: false,
          isCustom: true,
          lockedLevel: 'none',
        };
      } else {
        const b = blocos[defaultEditDecision.blocoIdx];
        if (!b) return prev;
        const linhas = [...b.linhas];
        const l = linhas[defaultEditDecision.linhaIdx ?? -1];
        if (!l) return prev;
        linhas[defaultEditDecision.linhaIdx ?? -1] = {
          ...l,
          isDefault: false,
          isCustom: true,
          lockedLevel: 'none',
        };
        blocos[defaultEditDecision.blocoIdx] = { ...b, linhas };
      }
      return { ...prev, blocos };
    });
    setDefaultEditDecision(null);
  }

  function removeConfirmedTarget() {
    if (!deleteTarget) return;
    setDraft((prev) => {
      if (!prev) return prev;
      const blocos = [...prev.blocos];
      if (deleteTarget.kind === 'bloco') {
        return { ...prev, blocos: blocos.filter((_, i) => i !== deleteTarget.blocoIdx) };
      }
      const b = blocos[deleteTarget.blocoIdx];
      if (!b) return prev;
      blocos[deleteTarget.blocoIdx] = { ...b, linhas: b.linhas.filter((_, i) => i !== deleteTarget.linhaIdx) };
      return { ...prev, blocos };
    });
    setDeleteTarget(null);
  }

  return (
    <div className="p-6 space-y-6">
      <Topbar
        title="Controle de Caixa"
        subtitle="Estrutura padrão mensal com liberdade para customização. Todos os meses ficam salvos para consulta."
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
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
              <p className="text-xs font-semibold text-emerald-700">Entradas</p>
              <p className="mt-1 text-lg font-semibold text-emerald-900">{formatNullableCurrency(draft.totais.entradaTotal) || 'R$ 0,00'}</p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4">
              <p className="text-xs font-semibold text-rose-700">Saídas</p>
              <p className="mt-1 text-lg font-semibold text-rose-900">{formatNullableCurrency(draft.totais.saidaTotal) || 'R$ 0,00'}</p>
            </div>
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4">
              <p className="text-xs font-semibold text-indigo-700">Resultado</p>
              <p className="mt-1 text-lg font-semibold text-indigo-900">{formatNullableCurrency(draft.totais.lucroTotal) || 'R$ 0,00'}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-xs font-semibold text-slate-600">Última atualização</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{lastUpdateLabel}</p>
              <p className="mt-1 text-xs text-slate-600">{isDirty ? 'Rascunho com alterações não salvas' : 'Sincronizado com Supabase'}</p>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-800">Saúde da estrutura</h2>
                <p className="text-xs text-slate-500">
                  Blocos: {stats.totalBlocos} ({stats.defaultBlocos} padrão) · Linhas: {stats.totalLinhas} · Customizadas: {stats.customLinhas}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                Padrão preservado: {stats.percentPreservado}%
              </span>
            </div>
          </section>

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
                    value={formatNullableCurrency(draft.totais[key as keyof DraftState['totais']])}
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
                    inputMode="decimal"
                    placeholder="R$ 0,00"
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
                              {
                                tipo: 'entrada',
                                titulo: 'Novo bloco de entrada',
                                ordem: prev.blocos.length,
                                templateKey: null,
                                isDefault: false,
                                isCustom: true,
                                lockedLevel: 'none',
                                linhas: [],
                              },
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
                              {
                                tipo: 'saida',
                                titulo: 'Novo bloco de saída',
                                ordem: prev.blocos.length,
                                templateKey: null,
                                isDefault: false,
                                isCustom: true,
                                lockedLevel: 'none',
                                linhas: [],
                              },
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
                <div className="flex items-center gap-2">
                  {bloco.isDefault ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Padrão</span>
                  ) : null}
                  {bloco.isCustom ? (
                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-900">Customizado</span>
                  ) : null}
                </div>
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
                      onBlur={(e) => {
                        const valor = e.target.value.trim();
                        if (bloco.isDefault && valor && valor !== (controleQuery.data?.blocos[blocoIdx]?.titulo ?? '')) {
                          setDefaultEditDecision({
                            kind: 'bloco',
                            blocoIdx,
                            title: 'Alterar bloco padrão',
                            description: `Você alterou o título do bloco padrão "${bloco.titulo}". Deseja manter como padrão no mês ou converter para customizado?`,
                          });
                        }
                      }}
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
                      <div className="md:col-span-1 flex items-center justify-center">
                        {linha.isDefault ? (
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900">P</span>
                        ) : linha.isCustom ? (
                          <span className="rounded bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-900">C</span>
                        ) : null}
                      </div>
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
                        className="md:col-span-4 rounded border border-slate-300 px-2 py-1.5 text-sm"
                        onBlur={(e) => {
                          const valor = e.target.value.trim();
                          if (linha.isDefault && valor && valor !== (controleQuery.data?.blocos[blocoIdx]?.linhas[linhaIdx]?.label ?? '')) {
                            setDefaultEditDecision({
                              kind: 'linha',
                              blocoIdx,
                              linhaIdx,
                              title: 'Alterar linha padrão',
                              description: `Você alterou a linha padrão "${linha.label}". Deseja manter como padrão no mês ou converter para customizada?`,
                            });
                          }
                        }}
                        placeholder="Label"
                      />
                      <input
                        value={formatNullableCurrency(linha.valor)}
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
                        placeholder="R$ 0,00"
                        inputMode="decimal"
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
                          setDeleteTarget({
                            kind: 'linha',
                            blocoIdx,
                            linhaIdx,
                            label: linha.label,
                            strong: linha.lockedLevel === 'strong' || linha.isDefault === true,
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
                        linhas.push({
                          label: 'Nova linha',
                          valor: null,
                          valorTexto: null,
                          ordem: linhas.length,
                          templateKey: null,
                          isDefault: false,
                          isCustom: true,
                          lockedLevel: 'none',
                        });
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
                      setDeleteTarget({
                        kind: 'bloco',
                        blocoIdx,
                        titulo: bloco.titulo,
                        strong: bloco.lockedLevel === 'strong' || bloco.isDefault === true,
                      })
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
              onClick={() => setDraft(createDefaultDraft())}
              className="rounded border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700"
            >
              Restaurar estrutura padrão
            </button>
            <button
              type="button"
              onClick={() => setDraft(controleQuery.data ? cloneState(controleQuery.data) : null)}
              className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
            >
              Descartar rascunho
            </button>
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

      <ConfirmDialog
        open={deleteTarget != null}
        title={deleteTarget?.kind === 'bloco' ? 'Excluir bloco?' : 'Excluir linha?'}
        message={
          deleteTarget?.kind === 'bloco'
            ? `${deleteTarget.strong ? 'Este bloco é padrão e protegido.' : ''} Excluir o bloco "${deleteTarget.titulo}"?`
            : `${deleteTarget?.strong ? 'Esta linha é padrão e protegida.' : ''} Excluir a linha "${deleteTarget?.label ?? ''}"?`
        }
        confirmLabel={deleteTarget?.strong ? 'Excluir mesmo assim' : 'Excluir'}
        danger={deleteTarget?.strong}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={removeConfirmedTarget}
      />

      {defaultEditDecision ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">{defaultEditDecision.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{defaultEditDecision.description}</p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setDefaultEditDecision(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
              >
                Manter padrão no mês
              </button>
              <button
                type="button"
                onClick={applyDefaultDecisionConvertToCustom}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white"
              >
                Converter para customizado
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
