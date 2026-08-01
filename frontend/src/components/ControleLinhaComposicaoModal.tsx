import { useQuery } from '@tanstack/react-query';
import {
  getControleLinhaComposicao,
  type ControleModo,
  type VisaoControle,
} from '../services/backendApi';

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

function formatDate(s: string | null): string {
  if (!s) return '–';
  return new Date(s + (s.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR');
}

export type ControleLinhaComposicaoTarget = {
  blocoTemplateKey: string;
  linhaTemplateKey: string;
  linhaLabel: string;
  blocoTitulo: string;
};

/**
 * Detalhe Admin/Secretária: o que compõe o valor da linha no Controle.
 * Reutiliza o padrão visual dos drill modals (PlanilhaLinha / CategoriasBanco).
 */
export function ControleLinhaComposicaoModal(props: {
  open: boolean;
  onClose: () => void;
  mes: number;
  ano: number;
  modo: ControleModo;
  visao?: VisaoControle;
  target: ControleLinhaComposicaoTarget | null;
}) {
  const { open, onClose, mes, ano, modo, visao = 'competencia', target } = props;

  const q = useQuery({
    queryKey: [
      'controle-linha-composicao',
      mes,
      ano,
      modo,
      visao,
      target?.blocoTemplateKey,
      target?.linhaTemplateKey,
      target?.linhaLabel,
    ],
    queryFn: () =>
      getControleLinhaComposicao({
        mes,
        ano,
        modo,
        blocoTemplateKey: target!.blocoTemplateKey,
        linhaTemplateKey: target!.linhaTemplateKey,
        linhaLabel: target!.linhaLabel,
        visao,
      }),
    enabled: open && !!target,
  });

  if (!open || !target) return null;

  const data = q.data;
  const totalLinha = data?.totalLinha;
  const totalItens = data?.totalItens ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="controle-linha-composicao-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 id="controle-linha-composicao-title" className="text-lg font-semibold text-slate-900">
              Composição da linha
              <span className="font-normal text-slate-600"> — {target.linhaLabel}</span>
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {target.blocoTitulo} · {String(mes).padStart(2, '0')}/{ano} · modo{' '}
              {modo === 'oficial' ? 'Oficial' : 'Sistema'}
              {totalLinha != null ? ` · Total da linha ${formatBRL(totalLinha)}` : null}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
          >
            Fechar
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {q.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-slate-100" />
              ))}
            </div>
          ) : q.error ? (
            <p className="text-sm text-rose-700">
              {q.error instanceof Error ? q.error.message : 'Erro ao carregar composição.'}
            </p>
          ) : data?.tipoComposicao === 'formula_repasse' && data.formula ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                <p className="font-medium">Repasse por fórmula</p>
                <p className="mt-1 text-amber-900/90">{data.formula.aviso}</p>
              </div>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <dt className="text-xs text-slate-500">Base (entrada do parceiro)</dt>
                  <dd className="mt-0.5 font-medium text-slate-900">
                    {data.formula.labelEntrada}: {formatBRL(data.formula.baseEntrada)}
                  </dd>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <dt className="text-xs text-slate-500">Cálculo</dt>
                  <dd className="mt-0.5 font-medium tabular-nums text-slate-900">
                    {data.formula.descricao}
                  </dd>
                </div>
              </dl>
              {totalLinha != null ? (
                <p className="text-sm text-slate-600">
                  Valor na linha: <strong className="tabular-nums text-slate-900">{formatBRL(totalLinha)}</strong>
                </p>
              ) : null}
            </div>
          ) : data?.mensagem && !data.itens.length ? (
            <p className="text-sm text-slate-600">{data.mensagem}</p>
          ) : !data?.itens.length ? (
            <p className="text-sm text-slate-500">Nenhuma transação nesta linha.</p>
          ) : (
            <>
              <p className="mb-3 text-xs text-slate-500">
                {data.itens.length} lançamento(s) · Soma {formatBRL(totalItens)}
                {totalLinha != null && Math.abs(totalItens - totalLinha) > 0.02 ? (
                  <span className="text-amber-700">
                    {' '}
                    (diferença em relação ao valor da linha — confira sync / visão)
                  </span>
                ) : null}
              </p>
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="text-left text-slate-600">
                    <th className="px-2 py-2">Data</th>
                    <th className="px-2 py-2">Pessoa</th>
                    <th className="px-2 py-2 text-right">Valor</th>
                    <th className="px-2 py-2">Meio</th>
                    <th className="px-2 py-2">Origem</th>
                  </tr>
                </thead>
                <tbody>
                  {data.itens.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="whitespace-nowrap px-2 py-2">{formatDate(row.data)}</td>
                      <td className="px-2 py-2">{row.pessoa ?? '—'}</td>
                      <td className="px-2 py-2 text-right font-medium tabular-nums">
                        {formatBRL(row.valor)}
                      </td>
                      <td className="px-2 py-2">{row.meioLabel || '—'}</td>
                      <td className="px-2 py-2 text-xs text-slate-600">
                        {row.origem === 'dinheiro_fluxo' ? 'Dinheiro (Fluxo)' : 'Extrato'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
