import { Link } from 'react-router-dom';

type ModalityRevenueLegendProps = {
  mesAnoLabel: string;
};

export function ModalityRevenueLegend({ mesAnoLabel }: ModalityRevenueLegendProps) {
  return (
    <details className="group rounded-xl border border-slate-200/90 bg-slate-50/80 shadow-sm open:bg-white dark:border-slate-700 dark:bg-slate-900/50 dark:open:bg-slate-900/90 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-100/80 dark:text-slate-100 dark:hover:bg-slate-800/60">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-slate-200 bg-white text-xs text-slate-500 transition-transform duration-200 group-open:rotate-90 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
          aria-hidden
        >
          ›
        </span>
        <span className="flex-1">Como este gráfico é calculado</span>
        <span className="text-xs font-normal text-slate-500 dark:text-slate-400">legenda</span>
      </summary>
      <div className="space-y-2.5 border-t border-slate-200/80 px-3 pb-3 pt-2.5 text-sm leading-relaxed text-slate-600 dark:border-slate-700 dark:text-slate-400">
        <p>
          <strong className="text-slate-800 dark:text-slate-200">De onde vêm os valores:</strong> só dos
          pagamentos que estão no <strong>Fluxo de caixa</strong> (mensalidade paga por aluno).{' '}
          <strong className="text-slate-800 dark:text-slate-200">Não</strong> vêm do extrato do{' '}
          <strong className="text-slate-800 dark:text-slate-200">banco</strong> nem do{' '}
          <strong className="text-slate-800 dark:text-slate-200">Controle de caixa</strong> (fechamento do mês) —
          por isso o total aqui pode ser diferente das outras seções desta página.
        </p>
        <p>
          <strong className="text-slate-800 dark:text-slate-200">Como somamos:</strong> pegamos cada pagamento
          com competência <strong className="text-slate-800 dark:text-slate-200">{mesAnoLabel}</strong>, somamos o
          valor pago e agrupamos por atividade (BYLA Dança, Pilates…). Ao clicar numa barra, você vê as
          modalidades só daquela atividade. O % na visão geral é do mês inteiro; no detalhe, é dentro da
          atividade.
        </p>
        <p>
          <Link
            to="/fluxo-caixa"
            className="font-medium text-emerald-700 underline decoration-emerald-700/40 underline-offset-2 hover:text-emerald-800 dark:text-emerald-300 dark:decoration-emerald-400/50 dark:hover:text-emerald-200"
          >
            Abrir Fluxo de caixa →
          </Link>
        </p>
      </div>
    </details>
  );
}
