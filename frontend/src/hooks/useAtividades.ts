import { useState, useEffect, useMemo } from 'react';
import { getResumoAtividade, getAlunosPorAtividade, getMensalidadesPorAtividade } from '../services/atividades';
import type { ResumoAtividadeRow, AlunoPorAtividadeRow, MensalidadePorAtividadeRow } from '../types/atividades';

function filterByMonthYear(rows: MensalidadePorAtividadeRow[], mes: number, ano: number): MensalidadePorAtividadeRow[] {
  return rows.filter((r) => {
    if (!r.data_pagamento) return false;
    const d = new Date(r.data_pagamento);
    return d.getMonth() + 1 === mes && d.getFullYear() === ano;
  });
}

function aggregateResumoByMonth(mensalidades: MensalidadePorAtividadeRow[]): ResumoAtividadeRow[] {
  const byAtividade = new Map<number, { nome: string; alunos: Set<number>; valor: number }>();
  for (const m of mensalidades) {
    const id = m.atividade_id;
    if (!byAtividade.has(id)) byAtividade.set(id, { nome: m.atividade_nome ?? '', alunos: new Set(), valor: 0 });
    const row = byAtividade.get(id)!;
    row.alunos.add(m.aluno_id);
    row.valor += m.valor ?? 0;
  }
  return Array.from(byAtividade.entries())
    .map(([atividade_id, { nome, alunos, valor }]) => ({
      atividade_id,
      atividade_nome: nome,
      total_alunos: alunos.size,
      total_mensalidades: mensalidades.filter((x) => x.atividade_id === atividade_id).length,
      total_valor: valor,
    }))
    .sort((a, b) => b.total_valor - a.total_valor);
}

export function useAtividades(atividadeId?: number, mes?: number, ano?: number) {
  const [resumoGlobal, setResumoGlobal] = useState<ResumoAtividadeRow[]>([]);
  const [alunos, setAlunos] = useState<AlunoPorAtividadeRow[]>([]);
  const [mensalidades, setMensalidades] = useState<MensalidadePorAtividadeRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [r, a, m] = await Promise.all([
          getResumoAtividade(),
          getAlunosPorAtividade(atividadeId),
          getMensalidadesPorAtividade(atividadeId),
        ]);
        if (!cancelled) {
          setResumoGlobal(r);
          setAlunos(a);
          setMensalidades(m);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [atividadeId]);

  const resumo = useMemo(() => {
    if (mes != null && ano != null) {
      const filtradas = filterByMonthYear(mensalidades, mes, ano);
      return aggregateResumoByMonth(filtradas);
    }
    return resumoGlobal;
  }, [mes, ano, mensalidades, resumoGlobal]);

  return { resumo, alunos, mensalidades, isLoading, error };
}
