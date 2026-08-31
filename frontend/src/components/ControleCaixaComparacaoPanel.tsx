import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ControleCaixaBloco, ControleCaixaResponse, ControleModo } from '../services/backendApi';
import {
  blocoParaSnap,
  cellTemDiff,
  compararControles,
  formatDeltaSignedBrl,
  labelPresenca,
  type DeltaCell,
} from '../logic/controleCaixaComparacao';

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function fmt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return BRL.format(v);
}

function DeltaCellRow({
  label,
  cell,
  emphasize,
}: {
  label: string;
  cell: DeltaCell;
  emphasize?: boolean;
}) {
  const pres = labelPresenca(cell.presenca);
  return (
    <tr className={emphasize ? 'font-semibold' : undefined}>
      <td className="py-1 pr-2 text-left text-slate-700 dark:text-slate-200">{label}</td>
      <td className="py-1 px-1 text-right tabular-nums text-slate-600 dark:text-slate-300">{fmt(cell.oficial)}</td>
      <td className="py-1 px-1 text-right tabular-nums text-slate-600 dark:text-slate-300">{fmt(cell.sistema)}</td>
      <td className="py-1 pl-1 text-right tabular-nums text-slate-800 dark:text-slate-100">
        {formatDeltaSignedBrl(cell.delta)}
        {pres ? (
          <span className="mt-0.5 block text-[10px] font-normal text-slate-500 dark:text-slate-400">{pres}</span>
        ) : null}
      </td>
    </tr>
  );
}

export type PendenciasComparacao = {
  entradasValor: number;
  despesasValor: number;
  entradasTx: number;
  despesasTx: number;
};

type DraftLike = {
  totais: ControleCaixaResponse['totais'];
  blocos: ControleCaixaBloco[];
};

type Props = {
  modoAtivo: ControleModo;
  oficial: ControleCaixaResponse | DraftLike | null | undefined;
  sistema: ControleCaixaResponse | DraftLike | null | undefined;
  oficialExiste: boolean;
  sistemaExiste: boolean;
  loadingOutro: boolean;
  pendencias?: PendenciasComparacao | null;
  mostrarPendencias: boolean;
};

export function ControleCaixaComparacaoPanel({
  modoAtivo,
  oficial,
  sistema,
  oficialExiste,
  sistemaExiste,
  loadingOutro,
  pendencias,
  mostrarPendencias,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const [blocoAberto, setBlocoAberto] = useState<string | null>(null);

  const outroLabel = modoAtivo === 'sistema' ? 'Planilha' : 'Sistema';
  const podeComparar = oficialExiste && sistemaExiste;

  const comparacao = useMemo(() => {
    if (!oficial || !sistema || !podeComparar) return null;
    return compararControles(
      {
        totais: oficial.totais,
        blocos: oficial.blocos.map(blocoParaSnap),
      },
      {
        totais: sistema.totais,
        blocos: sistema.blocos.map(blocoParaSnap),
      },
      { soDiffs: true },
    );
  }, [oficial, sistema, podeComparar]);

  return (
    <section
      className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
      aria-label="Comparação Planilha e Sistema"
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-700 dark:text-slate-200"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
      >
        <span>
          Comparar com {outroLabel}
          {podeComparar && comparacao ? (
            <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
              {comparacao.qtdLinhasComDiff === 0
                ? '· sem diferenças nas linhas'
                : `· ${comparacao.qtdLinhasComDiff} linha${comparacao.qtdLinhasComDiff === 1 ? '' : 's'} diferente${comparacao.qtdLinhasComDiff === 1 ? '' : 's'}`}
            </span>
          ) : null}
        </span>
        <span className="text-slate-400" aria-hidden>
          {aberto ? '▾' : '▸'}
        </span>
      </button>

      {aberto ? (
        <div className="space-y-3 border-t border-slate-100 px-4 pb-4 pt-3 dark:border-slate-700">
          {!oficialExiste || !sistemaExiste ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {!oficialExiste
                ? 'Sem Planilha neste mês — só há dados no Sistema (ou ainda não migrados).'
                : 'Sem dados no Sistema neste mês para comparar.'}
            </p>
          ) : null}

          {podeComparar && loadingOutro ? (
            <p className="text-xs text-slate-500">Carregando o outro modo…</p>
          ) : null}

          {podeComparar && comparacao ? (
            <>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Δ = Sistema − Planilha. Mostrando só diferenças (acima de R$ 0,01).
              </p>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[280px] text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      <th className="pb-1 text-left font-medium"> </th>
                      <th className="pb-1 px-1 text-right font-medium">Planilha</th>
                      <th className="pb-1 px-1 text-right font-medium">Sistema</th>
                      <th className="pb-1 pl-1 text-right font-medium">Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    <DeltaCellRow label="Entradas" cell={comparacao.totais.entradas} emphasize />
                    <DeltaCellRow label="Saídas" cell={comparacao.totais.saidas} emphasize />
                    <DeltaCellRow label="Lucro" cell={comparacao.totais.lucro} emphasize />
                  </tbody>
                </table>
              </div>

              {mostrarPendencias && pendencias && (pendencias.entradasValor > 0 || pendencias.despesasValor > 0 || pendencias.entradasTx > 0 || pendencias.despesasTx > 0) ? (
                <div className="rounded-lg border border-amber-200/80 bg-amber-50/70 px-3 py-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/25 dark:text-amber-100">
                  <p className="font-medium">Ainda não classificado no extrato (não entra no Controle)</p>
                  <ul className="mt-1 space-y-0.5 text-amber-900/90 dark:text-amber-200/90">
                    {(pendencias.entradasTx > 0 || pendencias.entradasValor > 0) && (
                      <li>
                        Entradas:{' '}
                        {pendencias.entradasValor > 0 ? fmt(pendencias.entradasValor) : '—'}
                        {pendencias.entradasTx > 0 ? ` · ${pendencias.entradasTx} lanç.` : ''}
                        {' · '}
                        <Link to="/entradas?foco=pendentes" className="underline font-medium">
                          Classificar
                        </Link>
                      </li>
                    )}
                    {(pendencias.despesasTx > 0 || pendencias.despesasValor > 0) && (
                      <li>
                        Saídas:{' '}
                        {pendencias.despesasValor > 0 ? fmt(pendencias.despesasValor) : '—'}
                        {pendencias.despesasTx > 0 ? ` · ${pendencias.despesasTx} lanç.` : ''}
                        {' · '}
                        <Link to="/despesas?foco=pendentes" className="underline font-medium">
                          Classificar
                        </Link>
                      </li>
                    )}
                  </ul>
                </div>
              ) : null}

              {comparacao.blocos.length === 0 ? (
                <p className="text-sm text-emerald-700 dark:text-emerald-400">
                  Categorias e linhas alinhadas — nenhuma diferença acima da tolerância.
                </p>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Diferenças por categoria
                  </p>
                  {comparacao.blocos.map((b) => {
                    const open = blocoAberto === b.chave;
                    return (
                      <div
                        key={b.chave}
                        className="rounded-lg border border-slate-200/90 dark:border-slate-700"
                      >
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs"
                          onClick={() => setBlocoAberto(open ? null : b.chave)}
                          aria-expanded={open}
                        >
                          <span className="min-w-0 flex-1 truncate font-medium text-slate-800 dark:text-slate-100">
                            {b.titulo}
                          </span>
                          <span className="shrink-0 tabular-nums text-slate-600 dark:text-slate-300">
                            {formatDeltaSignedBrl(b.agregado.delta)}
                          </span>
                          <span className="text-slate-400" aria-hidden>
                            {open ? '▾' : '▸'}
                          </span>
                        </button>
                        {open ? (
                          <div className="border-t border-slate-100 px-2 pb-2 dark:border-slate-700">
                            <table className="w-full text-[11px]">
                              <tbody>
                                {b.linhas.length === 0 && cellTemDiff(b.agregado) ? (
                                  <DeltaCellRow label="(total do bloco)" cell={b.agregado} />
                                ) : null}
                                {b.linhas.map((l) => (
                                  <DeltaCellRow key={l.chave} label={l.label} cell={l.cell} />
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
