import { Link } from 'react-router-dom';

export type ValidacaoCalendarioGuiaVariant = 'validacao' | 'calendario';

export interface ValidacaoCalendarioGuiaProps {
  variant: ValidacaoCalendarioGuiaVariant;
  /** Data ISO (YYYY-MM-DD) para link «Validar este dia» no calendário. */
  dataIso?: string;
}

function todayIsoLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDataBr(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

const CHECKLIST_VALIDACAO = [
  'Escolha a data do extrato (Hoje, Ontem ou link vindo do calendário).',
  'Compare os totais fluxo operacional × banco do dia.',
  'Resolva itens não confirmados e matches possíveis.',
  'Salve vínculos manuais quando o sistema só sugerir correspondência.',
] as const;

const CHECKLIST_CALENDARIO = [
  'Veja o status de cada dia no mês (OK, atenção, divergente).',
  'Clique no dia com problema para o resumo rápido.',
  'Use «Validar este dia» para abrir a conferência fluxo × banco.',
  'Use seleção de vários dias só para somar valores — não substitui a validação diária.',
] as const;

export function ValidacaoCalendarioGuia({ variant, dataIso }: ValidacaoCalendarioGuiaProps) {
  const hoje = todayIsoLocal();
  const dataValidacao = dataIso && /^\d{4}-\d{2}-\d{2}$/.test(dataIso) ? dataIso : hoje;
  const validacaoHref = `/validacao-pagamentos-diaria?data=${encodeURIComponent(dataValidacao)}`;
  const validacaoHojeHref = `/validacao-pagamentos-diaria?data=${encodeURIComponent(hoje)}`;

  const cardBase =
    'rounded-xl border p-4 text-sm transition-shadow dark:border-slate-600';
  const cardAtivo =
    'border-violet-500 bg-violet-50/90 shadow-sm ring-2 ring-violet-300/50 dark:border-violet-500 dark:bg-violet-950/50 dark:ring-violet-700/40';
  const cardInativo = 'border-slate-200 bg-white/90 dark:border-slate-700 dark:bg-slate-900/60';

  const checklist = variant === 'validacao' ? CHECKLIST_VALIDACAO : CHECKLIST_CALENDARIO;

  return (
    <section
      className="mt-4 space-y-4"
      aria-label="Guia operacional: validação diária e calendário mensal"
    >
      <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-slate-50 p-4 dark:border-violet-800/60 dark:from-violet-950/40 dark:via-slate-950 dark:to-slate-900">
        <p className="text-center text-xs font-semibold uppercase tracking-wider text-violet-800 dark:text-violet-200">
          Em 10 segundos
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div
            className={`rounded-lg border-l-4 border-emerald-500 bg-white/90 px-3 py-2.5 dark:bg-slate-900/80 ${
              variant === 'validacao' ? 'ring-2 ring-emerald-300/40' : ''
            }`}
          >
            <p className="text-sm font-bold text-emerald-900 dark:text-emerald-100">Pagamentos (dia a dia)</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
              Um <strong>dia por vez</strong>: entradas no banco × pagamentos do fluxo operacional, vínculos e pendências daquele dia.
            </p>
          </div>
          <div
            className={`rounded-lg border-l-4 border-indigo-500 bg-white/90 px-3 py-2.5 dark:bg-slate-900/80 ${
              variant === 'calendario' ? 'ring-2 ring-indigo-300/40' : ''
            }`}
          >
            <p className="text-sm font-bold text-indigo-900 dark:text-indigo-100">Calendário (mensal)</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
              <strong>Visão do mês inteiro</strong>: totais e status por dia — clique no dia e abra a validação diária.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50/95 p-4 dark:border-slate-700 dark:bg-slate-900/80">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
          Checklist {variant === 'validacao' ? 'da validação diária' : 'do calendário mensal'}
        </h2>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-slate-700 dark:text-slate-300">
          {checklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950/80">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Onde ir agora
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className={`${cardBase} ${variant === 'validacao' ? cardAtivo : cardInativo}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
              Hoje eu valido
            </p>
            <p className="mt-1 font-semibold text-slate-900 dark:text-slate-50">Validação de pagamentos</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              Conferência do <strong>dia</strong>: fluxo operacional × extrato, vínculos e não confirmados.
            </p>
            {variant === 'validacao' ? (
              <p className="mt-3 text-xs font-semibold text-violet-800 dark:text-violet-200">✓ Você está aqui</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  to={validacaoHojeHref}
                  className="inline-flex rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  Validar hoje →
                </Link>
                {dataIso && dataIso !== hoje ? (
                  <Link
                    to={validacaoHref}
                    className="inline-flex rounded-lg border border-emerald-400 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 dark:border-emerald-600 dark:bg-slate-900 dark:text-emerald-200"
                  >
                    Validar {formatDataBr(dataIso)} →
                  </Link>
                ) : null}
              </div>
            )}
          </div>

          <div className={`${cardBase} ${variant === 'calendario' ? cardAtivo : cardInativo}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
              No mês eu planejo
            </p>
            <p className="mt-1 font-semibold text-slate-900 dark:text-slate-50">Calendário financeiro</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              <strong>Mapa do mês</strong>: status por dia. Clique no dia e depois valide na tela diária.
            </p>
            {variant === 'calendario' ? (
              <p className="mt-3 text-xs font-semibold text-violet-800 dark:text-violet-200">✓ Você está aqui</p>
            ) : (
              <Link
                to="/calendario-financeiro"
                className="mt-3 inline-flex rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-50 dark:border-indigo-600 dark:bg-slate-900 dark:text-indigo-200 dark:hover:bg-indigo-950/50"
              >
                Ver calendário do mês →
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
