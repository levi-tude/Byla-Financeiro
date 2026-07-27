import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Topbar } from '../app/Topbar';
import { FilterBar, type FilterChip } from '../components/finance/FilterBar';
import { EmptyState, ErrorPanel } from '../components/finance/StateBlocks';
import { usePersistedPageState } from '../hooks/usePersistedPageState';
import {
  getCadastroAlunosResumo,
  type CadastroAlunoItem,
  type CadastroAlunoSecao,
  type CadastroAlunoCadastroFiltro,
  type CadastroAlunoVinculoFiltro,
  type MeioPagamentoAluno,
  type MeioPagamentoAlunoFiltro,
} from '../services/backendApi';

const MEIO_LABEL: Record<MeioPagamentoAluno, string> = {
  pix: 'PIX',
  debito: 'Débito',
  credito_a_vista: 'Crédito à vista',
  credito_recorrente: 'Crédito por recorrência',
  dinheiro: 'Dinheiro',
  desconhecido: 'Não identificado',
};

const VINCULO_STATUS_LABEL = {
  cadastro: 'No cadastro',
  aprendido: 'Aprendido na Validação',
  nenhum: 'Sem vínculo',
} as const;

type PageFilters = {
  aba: string;
  modalidade: string;
  vinculo: CadastroAlunoVinculoFiltro;
  cadastro: CadastroAlunoCadastroFiltro;
  meio: MeioPagamentoAlunoFiltro;
  mostrarComVinculo: boolean;
  mostrarSemVinculo: boolean;
};

const INITIAL_FILTERS: PageFilters = {
  aba: '',
  modalidade: '',
  vinculo: 'todos',
  cadastro: 'todos',
  meio: 'todos',
  mostrarComVinculo: true,
  mostrarSemVinculo: true,
};

function pagadorExibicao(item: CadastroAlunoItem): string {
  return item.pagador_cadastro ?? item.pagador_vinculo ?? '—';
}

function montarTextoLista(secoes: CadastroAlunoSecao[], somenteSemVinculo: boolean): string {
  const linhas: string[] = [
    'Lista de alunos — Espaço Byla',
    somenteSemVinculo
      ? 'Alunos SEM vínculo de pagador (precisam informar forma e quem paga)'
      : 'Todos os alunos por aba e modalidade',
    '',
  ];

  for (const secao of secoes) {
    linhas.push(`=== ${secao.aba} / ${secao.modalidade} ===`);
    linhas.push(
      `Total: ${secao.total} | Com vínculo: ${secao.com_vinculo} | Sem vínculo: ${secao.sem_vinculo}`,
    );
    if (secao.por_forma.length > 0) {
      linhas.push(
        'Formas: ' +
          secao.por_forma.map((f) => `${f.forma} (${f.count})`).join(' · '),
      );
    }
    linhas.push('');

    const blocos: Array<{ titulo: string; itens: CadastroAlunoItem[] }> = somenteSemVinculo
      ? [{ titulo: 'SEM VÍNCULO', itens: secao.alunos_sem_vinculo }]
      : [
          { titulo: 'SEM VÍNCULO', itens: secao.alunos_sem_vinculo },
          { titulo: 'COM VÍNCULO', itens: secao.alunos_com_vinculo },
        ];

    for (const bloco of blocos) {
      if (bloco.itens.length === 0) continue;
      linhas.push(`--- ${bloco.titulo} ---`);
      for (const a of bloco.itens) {
        const forma = a.forma_habitual ?? 'forma não registrada';
        const pagador = pagadorExibicao(a);
        const pend = a.cadastro_pendencias.length ? ` | pendências: ${a.cadastro_pendencias.join(', ')}` : '';
        const familia = a.grupo_familia ? ` | família: ${a.grupo_familia}` : '';
        linhas.push(`- ${a.aluno_nome} | ${forma} | pagador: ${pagador}${pend}${familia}`);
      }
      linhas.push('');
    }
  }

  return linhas.join('\n').trim();
}

export function CadastroAlunosResumoPage() {
  const [filters, setFilters] = usePersistedPageState<PageFilters>('cadastro-alunos-resumo', INITIAL_FILTERS);
  const [copiado, setCopiado] = useState(false);

  const query = useQuery({
    queryKey: [
      'cadastro-alunos-resumo',
      filters.aba,
      filters.modalidade,
      filters.vinculo,
      filters.cadastro,
      filters.meio,
    ],
    queryFn: () =>
      getCadastroAlunosResumo({
        aba: filters.aba || undefined,
        modalidade: filters.modalidade || undefined,
        vinculo: filters.vinculo,
        cadastro: filters.cadastro,
        meio: filters.meio,
        ativo: true,
      }),
  });

  const abas = useMemo(() => {
    const set = new Set<string>();
    for (const s of query.data?.secoes ?? []) set.add(s.aba);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [query.data?.secoes]);

  const modalidades = useMemo(() => {
    const set = new Set<string>();
    for (const s of query.data?.secoes ?? []) {
      if (!filters.aba || s.aba === filters.aba) set.add(s.modalidade);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [query.data?.secoes, filters.aba]);

  const secoesVisiveis = useMemo(() => {
    return (query.data?.secoes ?? []).map((secao) => ({
      ...secao,
      alunos_com_vinculo: filters.mostrarComVinculo ? secao.alunos_com_vinculo : [],
      alunos_sem_vinculo: filters.mostrarSemVinculo ? secao.alunos_sem_vinculo : [],
    }));
  }, [query.data?.secoes, filters.mostrarComVinculo, filters.mostrarSemVinculo]);

  const chips: FilterChip[] = useMemo(() => {
    const c: FilterChip[] = [];
    if (filters.vinculo !== 'todos') {
      c.push({
        id: 'vinculo',
        label:
          filters.vinculo === 'com_vinculo'
            ? 'Com vínculo de pagador'
            : 'Sem vínculo de pagador',
        onRemove: () => setFilters((f) => ({ ...f, vinculo: 'todos' })),
      });
    }
    if (filters.cadastro !== 'todos') {
      c.push({
        id: 'cadastro',
        label: filters.cadastro === 'completo' ? 'Cadastro completo' : 'Cadastro incompleto',
        onRemove: () => setFilters((f) => ({ ...f, cadastro: 'todos' })),
      });
    }
    if (filters.meio !== 'todos') {
      c.push({
        id: 'meio',
        label: MEIO_LABEL[filters.meio as MeioPagamentoAluno],
        onRemove: () => setFilters((f) => ({ ...f, meio: 'todos' })),
      });
    }
    return c;
  }, [filters.vinculo, filters.cadastro, filters.meio, setFilters]);

  async function copiarLista(somenteSemVinculo: boolean) {
    const texto = montarTextoLista(secoesVisiveis, somenteSemVinculo);
    await navigator.clipboard.writeText(texto);
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 2500);
  }

  return (
    <div className="space-y-4 pb-10">
      <Topbar
        title="Cadastro de alunos"
        subtitle="Lista por aba e modalidade — vínculo de pagador, forma habitual e pendências de cadastro"
      />

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
        <p>
          Use esta lista para a secretária informar <span className="font-medium">como cada aluno paga</span> e{' '}
          <span className="font-medium">quem é o pagador no extrato</span> (PIX/cartão).{' '}
          <span className="font-medium">Vínculo</span> = pagador cadastrado no Fluxo ou nome aprendido na Validação
          bancária. Alunos <span className="font-medium">sem vínculo</span> precisam de preenchimento.
        </p>
      </div>

      <FilterBar
        title="Filtros"
        subtitle="Aba, modalidade, vínculo de pagador, cadastro e forma de pagamento."
        chips={chips}
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
            Aba
            <select
              className="min-w-[140px] rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={filters.aba}
              onChange={(e) =>
                setFilters((f) => ({ ...f, aba: e.target.value, modalidade: '' }))
              }
            >
              <option value="">Todas</option>
              {abas.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
            Modalidade
            <select
              className="min-w-[160px] rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={filters.modalidade}
              onChange={(e) => setFilters((f) => ({ ...f, modalidade: e.target.value }))}
            >
              <option value="">Todas</option>
              {modalidades.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
            Vínculo pagador
            <select
              className="min-w-[160px] rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={filters.vinculo}
              onChange={(e) =>
                setFilters((f) => ({ ...f, vinculo: e.target.value as CadastroAlunoVinculoFiltro }))
              }
            >
              <option value="todos">Todos</option>
              <option value="com_vinculo">Com vínculo</option>
              <option value="sem_vinculo">Sem vínculo</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
            Cadastro
            <select
              className="min-w-[160px] rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={filters.cadastro}
              onChange={(e) =>
                setFilters((f) => ({ ...f, cadastro: e.target.value as CadastroAlunoCadastroFiltro }))
              }
            >
              <option value="todos">Todos</option>
              <option value="completo">Completo</option>
              <option value="incompleto">Incompleto</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
            Forma (meio)
            <select
              className="min-w-[160px] rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={filters.meio}
              onChange={(e) =>
                setFilters((f) => ({ ...f, meio: e.target.value as MeioPagamentoAlunoFiltro }))
              }
            >
              <option value="todos">Todos</option>
              {(Object.keys(MEIO_LABEL) as MeioPagamentoAluno[]).map((m) => (
                <option key={m} value={m}>
                  {MEIO_LABEL[m]}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap gap-2 pb-0.5">
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
              onClick={() => copiarLista(true)}
            >
              {copiado ? 'Copiado!' : 'Copiar só sem vínculo'}
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
              onClick={() => copiarLista(false)}
            >
              Copiar lista completa
            </button>
            <Link
              to="/fluxo-caixa"
              className="rounded-md bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-700"
            >
              Editar no Fluxo
            </Link>
          </div>
        </div>
      </FilterBar>

      {query.isLoading ? (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
          Carregando cadastro de alunos…
        </div>
      ) : null}
      {query.error ? (
        <ErrorPanel
          message={
            query.error instanceof Error
              ? query.error.message
              : 'Não foi possível carregar a lista de alunos.'
          }
          action={
            <button type="button" className="text-sm underline" onClick={() => query.refetch()}>
              Tentar de novo
            </button>
          }
        />
      ) : null}

      {query.data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ResumoCard label="Alunos ativos" value={query.data.totais.alunos} />
            <ResumoCard label="Com vínculo pagador" value={query.data.totais.com_vinculo} tone="ok" />
            <ResumoCard label="Sem vínculo pagador" value={query.data.totais.sem_vinculo} tone="warn" />
            <ResumoCard
              label="Cadastro incompleto"
              value={query.data.totais.cadastro_incompleto}
              tone="muted"
            />
          </div>

          {query.data.totais.por_meio.length > 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
              <p className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                Alunos por forma de pagamento (último lançamento)
              </p>
              <div className="flex flex-wrap gap-2">
                {query.data.totais.por_meio.map((m) => (
                  <span
                    key={m.meio}
                    className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    {MEIO_LABEL[m.meio]}: {m.count}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {secoesVisiveis.length === 0 ? (
            <EmptyState message="Nenhum aluno encontrado com estes filtros. Ajuste os filtros acima." />
          ) : (
            <div className="space-y-6">
              {secoesVisiveis.map((secao) => (
                <SecaoModalidade key={`${secao.aba}::${secao.modalidade}`} secao={secao} />
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function ResumoCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'ok' | 'warn' | 'muted';
}) {
  const toneClass =
    tone === 'ok'
      ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/30'
      : tone === 'warn'
        ? 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30'
        : tone === 'muted'
          ? 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40'
          : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950';
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <p className="text-xs text-slate-600 dark:text-slate-400">{label}</p>
      <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}

function SecaoModalidade({ secao }: { secao: CadastroAlunoSecao }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <header className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {secao.aba} · {secao.modalidade}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {secao.total} alunos · {secao.com_vinculo} com vínculo · {secao.sem_vinculo} sem vínculo ·{' '}
            {secao.cadastro_incompleto} cadastro incompleto
          </p>
        </div>
        {secao.por_forma.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {secao.por_forma.map((f) => (
              <span
                key={`${f.forma}-${f.meio}`}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {f.forma}: {f.count}
              </span>
            ))}
          </div>
        ) : null}
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-2">
        <ListaAlunos titulo="Sem vínculo de pagador" itens={secao.alunos_sem_vinculo} destaque />
        <ListaAlunos titulo="Com vínculo de pagador" itens={secao.alunos_com_vinculo} />
      </div>
    </section>
  );
}

function ListaAlunos({
  titulo,
  itens,
  destaque = false,
}: {
  titulo: string;
  itens: CadastroAlunoItem[];
  destaque?: boolean;
}) {
  if (itens.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 p-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        {titulo}: nenhum aluno neste grupo.
      </div>
    );
  }

  return (
    <div
      className={
        destaque
          ? 'rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900/40 dark:bg-amber-950/20'
          : 'rounded-lg border border-slate-100 p-3 dark:border-slate-800'
      }
    >
      <h3 className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-100">
        {titulo} ({itens.length})
      </h3>
      <ul className="space-y-2">
        {itens.map((a) => (
          <li
            key={a.id}
            className="rounded-md border border-slate-100 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900/50"
          >
            <div className="font-medium text-slate-900 dark:text-slate-100">{a.aluno_nome}</div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
              <span>Forma: {a.forma_habitual ?? '—'}</span>
              <span>Meio: {MEIO_LABEL[a.meio]}</span>
              <span>Pagador: {pagadorExibicao(a)}</span>
              <span>{VINCULO_STATUS_LABEL[a.vinculo_status]}</span>
              {a.venc ? <span>Venc: dia {a.venc}</span> : null}
              {a.grupo_familia ? <span>Família: {a.grupo_familia}</span> : null}
            </div>
            {a.cadastro_pendencias.length > 0 ? (
              <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
                Pendências: {a.cadastro_pendencias.join(' · ')}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
