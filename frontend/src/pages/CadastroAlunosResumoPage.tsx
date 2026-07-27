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
  type CadastroAlunoRegimeFiltro,
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
  validacao: 'Vinculado na Validação',
  cadastro: 'Só pagador no Fluxo',
  nenhum: 'Sem vínculo',
} as const;

type PageFilters = {
  aba: string;
  modalidade: string;
  vinculo: CadastroAlunoVinculoFiltro;
  cadastro: CadastroAlunoCadastroFiltro;
  regime: CadastroAlunoRegimeFiltro;
  meio: MeioPagamentoAlunoFiltro;
  diaVencimento: string;
  mostrarComVinculo: boolean;
  mostrarSemVinculo: boolean;
  mostrarBolsaExcecao: boolean;
};

const INITIAL_FILTERS: PageFilters = {
  aba: '',
  modalidade: '',
  vinculo: 'todos',
  cadastro: 'todos',
  regime: 'todos',
  meio: 'todos',
  diaVencimento: '',
  mostrarComVinculo: true,
  mostrarSemVinculo: true,
  mostrarBolsaExcecao: true,
};

function parseDiaVencimentoFiltro(value: string): number | 'sem' | undefined {
  if (!value) return undefined;
  if (value === 'sem') return 'sem';
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function pagadorExibicao(item: CadastroAlunoItem): string {
  if (item.vinculo_status === 'validacao') {
    return item.pagador_vinculo ?? 'Confirmado no extrato';
  }
  return item.pagador_cadastro ?? '—';
}

function montarTextoLista(
  secoes: CadastroAlunoSecao[],
  modo: 'completo' | 'sem_vinculo' | 'bolsa_excecao',
): string {
  const linhas: string[] = [
    'Lista de alunos — Espaço Byla',
    modo === 'sem_vinculo'
      ? 'Alunos SEM vínculo na Validação (precisam confirmar pagamento no extrato) — sem bolsa/exceção'
      : modo === 'bolsa_excecao'
        ? 'Alunos em Bolsa ou Exceção (sem cobrança)'
        : 'Todos os alunos por aba e modalidade',
    '',
  ];

  for (const secao of secoes) {
    linhas.push(`=== ${secao.aba} / ${secao.modalidade} ===`);
    linhas.push(
      `Total: ${secao.total} | Com vínculo: ${secao.com_vinculo} | Sem vínculo: ${secao.sem_vinculo} | Bolsa/Exceção: ${secao.bolsa_excecao ?? 0}`,
    );
    if (secao.por_forma.length > 0) {
      linhas.push(
        'Formas: ' +
          secao.por_forma.map((f) => `${f.forma} (${f.count})`).join(' · '),
      );
    }
    linhas.push('');

    const blocos: Array<{ titulo: string; itens: CadastroAlunoItem[] }> =
      modo === 'sem_vinculo'
        ? [{ titulo: 'SEM VÍNCULO', itens: secao.alunos_sem_vinculo }]
        : modo === 'bolsa_excecao'
          ? [{ titulo: 'BOLSA / EXCEÇÃO', itens: secao.alunos_bolsa_excecao ?? [] }]
          : [
              { titulo: 'SEM VÍNCULO', itens: secao.alunos_sem_vinculo },
              { titulo: 'COM VÍNCULO', itens: secao.alunos_com_vinculo },
              { titulo: 'BOLSA / EXCEÇÃO', itens: secao.alunos_bolsa_excecao ?? [] },
            ];

    for (const bloco of blocos) {
      if (bloco.itens.length === 0) continue;
      linhas.push(`--- ${bloco.titulo} ---`);
      for (const a of bloco.itens) {
        const forma = a.forma_habitual ?? 'forma não registrada';
        const pagador = pagadorExibicao(a);
        const regime =
          a.regime_cobranca && a.regime_cobranca !== 'normal'
            ? ` | ${a.regime_cobranca === 'bolsa' ? 'Bolsa' : 'Exceção'}`
            : '';
        const pend = a.cadastro_pendencias.length ? ` | pendências: ${a.cadastro_pendencias.join(', ')}` : '';
        const familia = a.grupo_familia ? ` | família: ${a.grupo_familia}` : '';
        linhas.push(`- ${a.aluno_nome} | ${forma} | pagador: ${pagador}${regime}${pend}${familia}`);
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
      filters.regime,
      filters.meio,
      filters.diaVencimento,
    ],
    queryFn: () =>
      getCadastroAlunosResumo({
        aba: filters.aba || undefined,
        modalidade: filters.modalidade || undefined,
        vinculo: filters.vinculo,
        cadastro: filters.cadastro,
        regime: filters.regime,
        meio: filters.meio,
        diaVencimento: parseDiaVencimentoFiltro(filters.diaVencimento),
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
      alunos_bolsa_excecao: filters.mostrarBolsaExcecao ? secao.alunos_bolsa_excecao ?? [] : [],
    }));
  }, [
    query.data?.secoes,
    filters.mostrarComVinculo,
    filters.mostrarSemVinculo,
    filters.mostrarBolsaExcecao,
  ]);

  const chips: FilterChip[] = useMemo(() => {
    const c: FilterChip[] = [];
    if (filters.vinculo !== 'todos') {
      c.push({
        id: 'vinculo',
        label:
          filters.vinculo === 'com_vinculo'
            ? 'Com vínculo na Validação'
            : 'Sem vínculo na Validação',
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
    if (filters.regime !== 'todos') {
      const regimeLabel: Record<Exclude<CadastroAlunoRegimeFiltro, 'todos'>, string> = {
        normal: 'Cobrança normal',
        bolsa: 'Bolsa',
        excecao: 'Exceção',
        bolsa_excecao: 'Bolsa ou Exceção',
      };
      c.push({
        id: 'regime',
        label: regimeLabel[filters.regime],
        onRemove: () => setFilters((f) => ({ ...f, regime: 'todos' })),
      });
    }
    if (filters.meio !== 'todos') {
      c.push({
        id: 'meio',
        label: MEIO_LABEL[filters.meio as MeioPagamentoAluno],
        onRemove: () => setFilters((f) => ({ ...f, meio: 'todos' })),
      });
    }
    if (filters.diaVencimento) {
      c.push({
        id: 'diaVencimento',
        label:
          filters.diaVencimento === 'sem'
            ? 'Sem vencimento cadastrado'
            : `Vencimento dia ${filters.diaVencimento}`,
        onRemove: () => setFilters((f) => ({ ...f, diaVencimento: '' })),
      });
    }
    return c;
  }, [filters.vinculo, filters.cadastro, filters.regime, filters.meio, filters.diaVencimento, setFilters]);

  async function copiarLista(modo: 'completo' | 'sem_vinculo' | 'bolsa_excecao') {
    const texto = montarTextoLista(secoesVisiveis, modo);
    await navigator.clipboard.writeText(texto);
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 2500);
  }

  return (
    <div className="space-y-4 pb-10">
      <Topbar
        title="Cadastro de alunos"
        subtitle="Lista por aba e modalidade — vínculo na Validação, forma habitual e pendências de cadastro"
      />

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
        <p>
          Use esta lista para a secretária saber <span className="font-medium">quem já teve pagamento confirmado no extrato</span>{' '}
          (Validação diária) e quem ainda precisa vincular.{' '}
          <span className="font-medium">Com vínculo</span> = confirmado na Validação (fica salvo para os próximos meses).{' '}
          Ter pagador só no cadastro do Fluxo <span className="font-medium">não conta</span> — ainda aparece em{' '}
          <span className="font-medium">sem vínculo</span>.
        </p>
      </div>

      <FilterBar
        title="Filtros"
        subtitle="Aba, modalidade, vínculo na Validação, cadastro, forma de pagamento e dia de vencimento."
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
            Vínculo (Validação)
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
            Cobrança
            <select
              className="min-w-[160px] rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={filters.regime}
              onChange={(e) =>
                setFilters((f) => ({ ...f, regime: e.target.value as CadastroAlunoRegimeFiltro }))
              }
            >
              <option value="todos">Todos</option>
              <option value="normal">Normal</option>
              <option value="bolsa">Bolsa</option>
              <option value="excecao">Exceção</option>
              <option value="bolsa_excecao">Bolsa ou Exceção</option>
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

          <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
            Dia de vencimento
            <select
              className="min-w-[180px] rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={filters.diaVencimento}
              onChange={(e) => setFilters((f) => ({ ...f, diaVencimento: e.target.value }))}
            >
              <option value="">Todos</option>
              {(query.data?.totais.por_dia_vencimento ?? []).map((d) => (
                <option key={d.dia} value={String(d.dia)}>
                  Dia {d.dia} ({d.count})
                </option>
              ))}
              {(query.data?.totais.sem_vencimento_cadastrado ?? 0) > 0 ? (
                <option value="sem">
                  Sem vencimento ({query.data?.totais.sem_vencimento_cadastrado})
                </option>
              ) : null}
            </select>
          </label>

          <div className="flex flex-wrap gap-2 pb-0.5">
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
              onClick={() => copiarLista('sem_vinculo')}
            >
              {copiado ? 'Copiado!' : 'Copiar só sem vínculo'}
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
              onClick={() => copiarLista('bolsa_excecao')}
            >
              Copiar bolsa/exceção
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
              onClick={() => copiarLista('completo')}
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <ResumoCard label="Alunos ativos" value={query.data.totais.alunos} />
            <ResumoCard label="Com vínculo na Validação" value={query.data.totais.com_vinculo} tone="ok" />
            <ResumoCard label="Sem vínculo na Validação" value={query.data.totais.sem_vinculo} tone="warn" />
            <ResumoCard
              label="Bolsa / Exceção"
              value={query.data.totais.bolsa_excecao ?? 0}
              tone="muted"
            />
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

          {query.data.totais.por_dia_vencimento.length > 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
              <p className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                Alunos por dia de vencimento cadastrado
              </p>
              <div className="flex flex-wrap gap-2">
                {query.data.totais.por_dia_vencimento.map((d) => (
                  <button
                    key={d.dia}
                    type="button"
                    className={`rounded-full px-2.5 py-1 text-xs ${
                      filters.diaVencimento === String(d.dia)
                        ? 'bg-sky-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                    }`}
                    onClick={() =>
                      setFilters((f) => ({
                        ...f,
                        diaVencimento: f.diaVencimento === String(d.dia) ? '' : String(d.dia),
                      }))
                    }
                  >
                    Dia {d.dia}: {d.count}
                  </button>
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
            {secao.bolsa_excecao ?? 0} bolsa/exceção · {secao.cadastro_incompleto} cadastro incompleto
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

      <div className="grid gap-4 p-4 lg:grid-cols-3">
        <ListaAlunos titulo="Sem vínculo na Validação" itens={secao.alunos_sem_vinculo} destaque />
        <ListaAlunos titulo="Com vínculo na Validação" itens={secao.alunos_com_vinculo} />
        <ListaAlunos titulo="Bolsa / Exceção" itens={secao.alunos_bolsa_excecao ?? []} />
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
              {a.regime_cobranca === 'bolsa' ? <span className="font-medium text-sky-700 dark:text-sky-300">Bolsa</span> : null}
              {a.regime_cobranca === 'excecao' ? (
                <span className="font-medium text-violet-700 dark:text-violet-300">Exceção</span>
              ) : null}
              {a.dia_vencimento != null ? (
                <span>Venc: dia {a.dia_vencimento}</span>
              ) : a.venc ? (
                <span>Venc: {a.venc}</span>
              ) : null}
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
