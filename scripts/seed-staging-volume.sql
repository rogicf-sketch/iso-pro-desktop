-- Seed volume para stress (~2× docs / ~2.5× itens vs prod tipico).
-- Tenant default. Idempotente por prefixo LOADVOL- / loadvol-doc-.
-- USAR SÓ EM STAGING (ref vghbcwkvmmihakunvwqw). NUNCA em prod.
--
-- Uso:
--   npx supabase link --project-ref vghbcwkvmmihakunvwqw
--   npx supabase db query --linked -f scripts/seed-staging-volume.sql

DO $$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_docs integer := 8000;
  v_itens_por_doc integer := 8;
  v_mats integer := 10000;
BEGIN
  -- Materiais (PK tenant_id,id bigint; unique codigo por tenant)
  INSERT INTO public.materiais (
    id, codigo, descricao, unidade, ativo, codigo_barras, tenant_id
  )
  SELECT
    nextval('public.materiais_id_seq'),
    'LOADVOL-M-' || lpad(g::text, 5, '0'),
    'Material stress ' || g,
    'UN',
    true,
    'BC' || lpad(g::text, 8, '0'),
    v_tenant
  FROM generate_series(1, v_mats) AS g
  WHERE NOT EXISTS (
    SELECT 1 FROM public.materiais m
    WHERE m.tenant_id = v_tenant
      AND m.codigo = 'LOADVOL-M-' || lpad(g::text, 5, '0')
  );

  -- Documentos
  INSERT INTO public.iso_pro_documentos_planejamento (
    tenant_id, id, numero, revisao, data_documento, descricao, responsavel, status, updated_at
  )
  SELECT
    v_tenant,
    'loadvol-doc-' || lpad(g::text, 5, '0'),
    'SPDA-VOL-' || lpad(g::text, 5, '0'),
    '0',
    CURRENT_DATE,
    'Desenho stress volume ' || g,
    'LoadTest',
    'pendente',
    now()
  FROM generate_series(1, v_docs) AS g
  ON CONFLICT (tenant_id, id) DO NOTHING;

  -- Itens (PK tenant_id, id)
  INSERT INTO public.iso_pro_documento_itens_planejamento (
    tenant_id, documento_id, id, codigo, descricao, unidade,
    quantidade, quantidade_atendida, localizacao, updated_at
  )
  SELECT
    v_tenant,
    'loadvol-doc-' || lpad(d::text, 5, '0'),
    'loadvol-doc-' || lpad(d::text, 5, '0') || '-it-' || j,
    'LOADVOL-M-' || lpad((((d + j - 1) % v_mats) + 1)::text, 5, '0'),
    'Item stress ' || j,
    'UN',
    10,
    0,
    'A1',
    now()
  FROM generate_series(1, v_docs) AS d
  CROSS JOIN generate_series(1, v_itens_por_doc) AS j
  ON CONFLICT (tenant_id, id) DO NOTHING;

  -- Snapshot baseline (nao apaga historico util se ja existir payload maior)
  INSERT INTO public.iso_pro_snapshot (id, tenant_id, payload, updated_at)
  VALUES (
    'default',
    v_tenant,
    jsonb_build_object(
      'documentos', '[]'::jsonb,
      'atendimentoHistorico', '[]'::jsonb,
      'atendimentos', '[]'::jsonb,
      'configuracoesSistema', jsonb_build_object('sequenciaAtendimento', 1),
      'dataAtualizacao', now()
    ),
    now()
  )
  ON CONFLICT (id, tenant_id) DO UPDATE
  SET updated_at = EXCLUDED.updated_at;
END $$;

SELECT
  (SELECT count(*) FROM public.iso_pro_documentos_planejamento WHERE id LIKE 'loadvol-doc-%') AS docs_seed,
  (SELECT count(*) FROM public.iso_pro_documento_itens_planejamento WHERE id LIKE 'loadvol-doc-%') AS itens_seed,
  (SELECT count(*) FROM public.materiais WHERE codigo LIKE 'LOADVOL-M-%') AS mats_seed,
  (SELECT count(*) FROM public.iso_pro_documentos_planejamento) AS docs_total,
  (SELECT count(*) FROM public.iso_pro_documento_itens_planejamento) AS itens_total,
  (SELECT count(*) FROM public.materiais) AS mats_total;
