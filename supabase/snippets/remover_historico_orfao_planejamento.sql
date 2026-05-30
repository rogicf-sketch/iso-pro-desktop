-- Remove linhas de atendimentoHistorico e atendimentos que referenciam desenhos
-- inexistentes no planejamento actual (11 referencias orfas identificadas em producao).
-- Tenant: organizacao principal. Ajuste tenant_id se necessario.

BEGIN;

WITH params AS (
  SELECT
    '00000000-0000-0000-0000-000000000001'::uuid AS tenant_id,
    ARRAY[
      '720d52b7-94df-46cd-a811-b2abaab47928',
      '48b64a5d-60a2-446a-8db5-699d074fbe12',
      '273b34e9-bf70-4cc1-b48a-90e23204bf57',
      'd03d30d4-31a0-42c3-95d5-3447606112e3',
      '7c568525-c258-45f8-ae6e-cf8382e49c19',
      'b361c3b4-4ac7-47dc-8e47-df4e0fc816c0',
      'd1b6b3b9-2155-4f63-886c-5eca11d4f2bc',
      'ed668ab9-2488-4cf7-8c21-48192eb1c443',
      '104fd6a5-bd9c-4c7f-9330-8ab53cc88807',
      '43eea035-9300-4e85-b7cc-29a4bc9b9009',
      '9437ddd8-184b-4647-800c-f046bde4ab16'
    ]::text[] AS orphan_doc_ids,
    ARRAY[
      'AG-6"-UT-243-CS11-NI',
      'AG-6"-UT-245-CS11-NI',
      'BGS-10"-SB-002-SS1-NI',
      'BGS-10"-SB-006-SS1-NI',
      'E.RAZN008B-ISR-10006_B',
      'E.RAZN008B-QRS-10001',
      'SE-SE1-FR-FTR01',
      'SE-SE1-FR-FTR02',
      'VE-24"-DV-007-CS9-IQ',
      'VIQ-12"-RE-001-SS1-PP',
      'VIQ-12"-RE-003-SS1-NI'
    ]::text[] AS orphan_doc_nums
),
snap AS (
  SELECT s.payload
  FROM public.iso_pro_snapshot s
  CROSS JOIN params p
  WHERE s.id = 'default'
    AND s.tenant_id = p.tenant_id
  FOR UPDATE OF s
),
filtered AS (
  SELECT
    COALESCE(
      (
        SELECT jsonb_agg(elem ORDER BY ord)
        FROM snap,
          jsonb_array_elements(COALESCE(snap.payload->'atendimentoHistorico', '[]'::jsonb))
            WITH ORDINALITY AS t(elem, ord)
        CROSS JOIN params p
        WHERE NOT (
          trim(coalesce(elem->>'documentoId', '')) = ANY (p.orphan_doc_ids)
          OR lower(trim(coalesce(elem->>'documento', ''))) = ANY (
            SELECT lower(trim(x)) FROM unnest(p.orphan_doc_nums) AS x
          )
        )
      ),
      '[]'::jsonb
    ) AS atendimento_historico,
    COALESCE(
      (
        SELECT jsonb_agg(elem ORDER BY ord)
        FROM snap,
          jsonb_array_elements(COALESCE(snap.payload->'atendimentos', '[]'::jsonb))
            WITH ORDINALITY AS t(elem, ord)
        CROSS JOIN params p
        WHERE NOT (
          trim(coalesce(elem->>'documentoId', '')) = ANY (p.orphan_doc_ids)
          OR lower(trim(coalesce(elem->>'documentoNumero', ''))) = ANY (
            SELECT lower(trim(x)) FROM unnest(p.orphan_doc_nums) AS x
          )
        )
      ),
      '[]'::jsonb
    ) AS atendimentos
)
UPDATE public.iso_pro_snapshot s
SET
  payload = s.payload
    || jsonb_build_object(
      'atendimentoHistorico', f.atendimento_historico,
      'atendimentos', f.atendimentos,
      'dataAtualizacao', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ),
  updated_at = now()
FROM params p, filtered f
WHERE s.id = 'default'
  AND s.tenant_id = p.tenant_id;

COMMIT;
