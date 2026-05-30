# UX Patterns (finance)

Padrões mínimos reutilizáveis para manter consistência entre `Transações`, `Visão Geral` e `Fluxo`.

## 1) `FilterBar`
- Header único de filtros (título, subtítulo, período e ação de limpar).
- Chips de filtro ativo com remoção rápida.
- Conteúdo de filtros fica no `children` para cada página adaptar campos sem perder padrão.

## 2) `DataTable`
- Tabela compacta com cabeçalho consistente.
- Suporte a 1ª coluna sticky (`sticky: true`) para leitura em listas longas.
- Suporte a colunas opcionais (`optional: true`) com botão `Mais colunas`.

## 3) `KpiStrip`
- Faixa padronizada de KPI cards (até 6).
- Reaproveita `KpiCard` atual para evitar regressão visual e funcional.
- Mantém helper/trend/accent/CTA com mesma API do card original.

## 4) `StatusBadge`
- Estados visuais padronizados: `ok`, `atencao`, `divergente`, `pendente`.
- Substitui badges ad-hoc por token único de semântica operacional.

## 5) `StateBlocks`
- `EmptyState`: vazio padronizado.
- `LoadingRow`: skeleton para linhas de tabela.
- `ErrorPanel`: erro de carregamento com mesma linguagem visual.

## Piloto aplicado
- Página piloto: `frontend/src/pages/TransacoesPage.tsx`.
- Mantido sem alteração funcional crítica: resumo por dia com hover e clique na data.
