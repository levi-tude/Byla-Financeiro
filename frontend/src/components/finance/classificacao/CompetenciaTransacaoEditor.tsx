import { useState } from 'react';
import { StatusBadge } from '../StatusBadge';
import {
  AVISO_COMPETENCIA_DIFERENTE,
  competenciaAlinhaComDataPagamento,
  labelCompetenciaMesAno,
} from '../../../utils/competenciaPagamento';

export type TransacaoCompetenciaFields = {
  id: string;
  data: string;
  mes_competencia?: number;
  ano_competencia?: number;
  competencia_confirmada?: boolean;
  competencia_sugerida_mes?: number;
  competencia_sugerida_ano?: number;
  competencia_alinha_data?: boolean;
  alerta_duplicata_competencia?: boolean;
};

export function CompetenciaTransacaoEditor({
  transacao,
  mesRef,
  anoRef,
  onSave,
  saving,
}: {
  transacao: TransacaoCompetenciaFields;
  mesRef: number;
  anoRef: number;
  onSave: (patch: { mes_competencia: number; ano_competencia: number; confirmada: boolean }) => void;
  saving?: boolean;
}) {
  const sugMes = transacao.competencia_sugerida_mes ?? transacao.mes_competencia ?? mesRef;
  const sugAno = transacao.competencia_sugerida_ano ?? transacao.ano_competencia ?? anoRef;
  const [mesComp, setMesComp] = useState(String(transacao.mes_competencia ?? sugMes));
  const [anoComp, setAnoComp] = useState(String(transacao.ano_competencia ?? sugAno));

  const mesNum = Number(mesComp);
  const anoNum = Number(anoComp);
  const alinha =
    Number.isFinite(mesNum) &&
    Number.isFinite(anoNum) &&
    competenciaAlinhaComDataPagamento(transacao.data, mesNum, anoNum);

  const precisaConfirmar =
    !transacao.competencia_confirmada ||
    mesNum !== (transacao.mes_competencia ?? sugMes) ||
    anoNum !== (transacao.ano_competencia ?? sugAno);

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs dark:border-slate-700 dark:bg-slate-800/50">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-slate-700 dark:text-slate-300">Compet├¬ncia</span>
        {transacao.competencia_confirmada ? (
          <StatusBadge tone="ok" label="Confirmada" />
        ) : (
          <StatusBadge tone="atencao" label="Sugest├úo" />
        )}
        {transacao.alerta_duplicata_competencia && (
          <StatusBadge tone="pendente" label="Duplicata?" />
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5">
          M├¬s
          <input
            type="number"
            min={1}
            max={12}
            className="w-16 rounded border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
            value={mesComp}
            onChange={(e) => setMesComp(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          Ano
          <input
            type="number"
            min={2000}
            max={2100}
            className="w-20 rounded border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
            value={anoComp}
            onChange={(e) => setAnoComp(e.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={saving || !Number.isFinite(mesNum) || mesNum < 1 || mesNum > 12 || !Number.isFinite(anoNum)}
          className="rounded bg-indigo-600 px-2 py-1 font-semibold text-white disabled:opacity-50"
          onClick={() =>
            onSave({ mes_competencia: mesNum, ano_competencia: anoNum, confirmada: true })
          }
        >
          {saving ? 'ÔÇª' : precisaConfirmar ? 'Confirmar' : 'Atualizar'}
        </button>
      </div>
      {!alinha && Number.isFinite(mesNum) && Number.isFinite(anoNum) && (
        <p className="mt-1 text-amber-800 dark:text-amber-200" title={AVISO_COMPETENCIA_DIFERENTE}>
          Compet├¬ncia {labelCompetenciaMesAno(mesNum, anoNum)} Ôëá m├¬s do PIX (
          {transacao.data.slice(0, 7)}).
        </p>
      )}
      {!transacao.competencia_confirmada && (
        <p className="mt-1 text-slate-600 dark:text-slate-400">
          Sugest├úo: {labelCompetenciaMesAno(sugMes, sugAno)}
        </p>
      )}
    </div>
  );
}
