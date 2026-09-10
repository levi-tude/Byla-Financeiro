import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  confirmarExtratoAntesFluxo,
  getTransacoesPorMes,
  type ConciliacaoPagamentosResponse,
} from '../../services/backendApi';
import { formatBrl, formatDate } from '../finance/classificacao/utils';

type Item = ConciliacaoPagamentosResponse['itens'][number];

type Props = {
  open: boolean;
  onClose: () => void;
  item: Item | null;
  mes: number;
  ano: number;
};

export function ConfirmarExtratoAntesFluxoDialog({ open, onClose, item, mes, ano }: Props) {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState('');
  const [bancoId, setBancoId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setBusca(item?.aluno_nome?.split(/\s+/)[0] ?? '');
    setBancoId(null);
    setErro(null);
  }, [open, item]);

  const bancoQuery = useQuery({
    queryKey: ['extrato-antes-banco', mes, ano, busca],
    queryFn: () =>
      getTransacoesPorMes(mes, ano, 'entrada', {
        q: busca.trim() || undefined,
        limit: 120,
        visao: 'caixa',
      }),
    enabled: open,
  });

  const bancos = bancoQuery.data?.itens ?? [];
  const bancoSel = useMemo(() => bancos.find((t) => t.id === bancoId) ?? null, [bancos, bancoId]);

  async function confirmar() {
    if (!item || !bancoSel) return;
    setSaving(true);
    setErro(null);
    try {
      const dataRef = String(bancoSel.data).slice(0, 10);
      await confirmarExtratoAntesFluxo({
        aluno_id: item.aluno_id,
        mes,
        ano,
        banco_id: bancoSel.id,
        data_ref: dataRef,
      });
      void queryClient.invalidateQueries({ queryKey: ['conciliacao-pagamentos'] });
      onClose();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!open || !item) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Confirmar extrato antes do Fluxo"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-xl dark:border-emerald-800 dark:bg-slate-900">
        <div className="border-b border-emerald-100 bg-emerald-50 px-5 py-4 dark:border-emerald-900 dark:bg-emerald-950/40">
          <h2 className="text-base font-semibold text-emerald-950 dark:text-emerald-100">
            Confirmar pagamento no extrato
          </h2>
          <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-200">
            Marca que {item.aluno_nome} já pagou no banco neste mês, mesmo sem lançamento no Fluxo
            ainda. Não conta como “não pagou” — fica “pago no banco · Fluxo pendente”.
          </p>
        </div>

        <div className="space-y-3 overflow-y-auto px-5 py-4">
          <label className="block text-sm">
            <span className="text-slate-600 dark:text-slate-400">Buscar no extrato</span>
            <input
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome no extrato"
            />
          </label>

          <ul className="max-h-64 space-y-1 overflow-y-auto rounded border border-slate-200 dark:border-slate-700">
            {bancoQuery.isLoading ? (
              <li className="px-3 py-2 text-sm text-slate-500">Carregando…</li>
            ) : bancos.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-500">Nenhuma entrada neste mês.</li>
            ) : (
              bancos.map((t) => {
                const selected = t.id === bancoId;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setBancoId(t.id)}
                      className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-emerald-50 dark:hover:bg-emerald-950/30 ${
                        selected ? 'bg-emerald-100 dark:bg-emerald-950/50' : ''
                      }`}
                    >
                      <span className="font-medium text-slate-800 dark:text-slate-100">
                        {(t.pessoa ?? '').trim() || 'Sem nome'}
                      </span>
                      <span className="tabular-nums text-xs text-slate-600 dark:text-slate-400">
                        {formatDate(String(t.data).slice(0, 10))} · {formatBrl(Number(t.valor ?? 0))}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          {erro ? <p className="text-sm text-rose-600 dark:text-rose-300">{erro}</p> : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 dark:border-slate-600 dark:text-slate-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!bancoSel || saving}
            onClick={() => void confirmar()}
            className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? 'Salvando…' : 'Confirmar extrato'}
          </button>
        </div>
      </div>
    </div>
  );
}
