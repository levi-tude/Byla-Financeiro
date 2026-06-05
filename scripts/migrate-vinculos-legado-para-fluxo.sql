-- Migra vínculos validacao_pagamentos_vinculos (formato planilha Google)
-- para fluxo::uuid (fluxo_pagamentos_operacionais), para OK extrato no Fluxo de Caixa.
-- Match: aluno + data + valor (+ linha planilha quando ambíguo).

BEGIN;

WITH leg AS (
  SELECT
    v.id,
    v.planilha_id AS old_id,
    v.banco_id,
    NULLIF(split_part(v.planilha_id, '::', 2), '')::int AS linha_leg,
    lower(trim(split_part(v.planilha_id, '::', 3))) AS aluno_norm,
    split_part(v.planilha_id, '::', 4)::date AS data_pg,
    NULLIF(split_part(v.planilha_id, '::', 5), '')::numeric AS valor_leg
  FROM validacao_pagamentos_vinculos v
  WHERE v.planilha_id NOT LIKE 'fluxo::%'
),
candidates AS (
  SELECT
    leg.id,
    p.id AS fluxo_id,
    ROW_NUMBER() OVER (
      PARTITION BY leg.id
      ORDER BY ABS(p.linha_planilha - COALESCE(leg.linha_leg, p.linha_planilha)) ASC, p.id
    ) AS rn
  FROM leg
  JOIN fluxo_pagamentos_operacionais p
    ON p.data_pagamento = leg.data_pg
   AND ABS(p.valor - leg.valor_leg) < 0.02
   AND lower(trim(p.aluno_nome)) = leg.aluno_norm
),
best AS (
  SELECT id, fluxo_id FROM candidates WHERE rn = 1
),
dedup AS (
  SELECT DISTINCT ON (fluxo_id) id, fluxo_id
  FROM best
  ORDER BY fluxo_id, id
)
UPDATE validacao_pagamentos_vinculos v
SET
  planilha_id = 'fluxo::' || d.fluxo_id,
  updated_at = now()
FROM dedup d
WHERE v.id = d.id
  AND NOT EXISTS (
    SELECT 1
    FROM validacao_pagamentos_vinculos x
    WHERE x.planilha_id = 'fluxo::' || d.fluxo_id
      AND x.id <> v.id
  );

-- Duplicatas legado (mesmo pagamento fluxo já migrado por outro id)
DELETE FROM validacao_pagamentos_vinculos v
WHERE v.planilha_id NOT LIKE 'fluxo::%'
  AND EXISTS (
    SELECT 1
    FROM validacao_pagamentos_vinculos m
    WHERE m.planilha_id LIKE 'fluxo::%'
      AND m.banco_id = v.banco_id
      AND m.data_ref = v.data_ref
      AND EXISTS (
        SELECT 1
        FROM fluxo_pagamentos_operacionais p
        WHERE ('fluxo::' || p.id::text) = m.planilha_id
          AND p.data_pagamento = split_part(v.planilha_id, '::', 4)::date
          AND ABS(p.valor - NULLIF(split_part(v.planilha_id, '::', 5), '')::numeric) < 0.02
          AND lower(trim(p.aluno_nome)) = lower(trim(split_part(v.planilha_id, '::', 3)))
      )
  );

COMMIT;
