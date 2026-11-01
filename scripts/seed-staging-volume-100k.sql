-- Seed ~100k desenhos para prova formal de escala (STAGING-LOAD ONLY).
-- Prefixo: LOAD100K- / load100k-doc-
-- NUNCA correr em LIVE (ofeogtjydjdjrmrekebh).
--
-- Uso (ligado ao staging-load sacaiokhqhegvtpzlpkf):
--   npx supabase db query --linked -f scripts/seed-staging-volume-100k.sql
--
-- Parametros: 100k docs × 4 itens = 400k linhas de item; materiais 20k.
-- Lotes de 2k docs para evitar statement_timeout.

DO $$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_docs integer := 100000;
  v_itens_por_doc integer := 4;
  v_mats integer := 20000;
  v_batch integer := 2000;
  v_from integer;
  v_to integer;
BEGIN
  PERFORM set_config('statement_timeout', '300s', true);

  -- Materiais (idempotente)
  INSERT INTO public.materiais (
    id, codigo, descricao, unidade, ativo, codigo_barras, tenant_id
  )
  SELECT
    nextval('public.materiais_id_seq'),
    'LOAD100K-M-' || lpad(g::text, 5, '0'),
    'Material escala 100k ' || g,
    'UN',
    true,
    'BC1' || lpad(g::text, 7, '0'),
    v_tenant
  FROM generate_series(1, v_mats) AS g
  WHERE NOT EXISTS (
    SELECT 1 FROM public.materiais m
    WHERE m.tenant_id = v_tenant
      AND m.codigo = 'LOAD100K-M-' || lpad(g::text, 5, '0')
  );

  v_from := 1;
  WHILE v_from <= v_docs LOOP
    v_to := LEAST(v_from + v_batch - 1, v_docs);

    INSERT INTO public.iso_pro_documentos_planejamento (
      tenant_id, id, numero, revisao, data_documento, descricao, responsavel, status, updated_at
    )
    SELECT
      v_tenant,
      'load100k-doc-' || lpad(g::text, 6, '0'),
      'E.LOAD100K-' || lpad(g::text, 6, '0'),
      'A',
      CURRENT_DATE,
      'Desenho prova escala 100k #' || g,
      'LoadTest100k',
      'pendente',
      now()
    FROM generate_series(v_from, v_to) AS g
    ON CONFLICT (tenant_id, id) DO NOTHING;

    INSERT INTO public.iso_pro_documento_itens_planejamento (
      tenant_id, documento_id, id, codigo, descricao, unidade,
      quantidade, quantidade_atendida, localizacao, updated_at
    )
    SELECT
      v_tenant,
      'load100k-doc-' || lpad(d::text, 6, '0'),
      'load100k-doc-' || lpad(d::text, 6, '0') || '-it-' || j,
      'LOAD100K-M-' || lpad((((d + j - 1) % v_mats) + 1)::text, 5, '0'),
      'Item escala ' || j,
      'UN',
      10 + (j % 5),
      0,
      'A-' || lpad(((d % 50) + 1)::text, 2, '0'),
      now()
    FROM generate_series(v_from, v_to) AS d
    CROSS JOIN generate_series(1, v_itens_por_doc) AS j
    ON CONFLICT (tenant_id, id) DO NOTHING;

    RAISE NOTICE 'seed 100k: docs % .. %', v_from, v_to;
    v_from := v_to + 1;
  END LOOP;

  -- Snapshot leve (meta) — nao embutir 100k no JSON
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
  SET
    updated_at = EXCLUDED.updated_at,
    payload = coalesce(public.iso_pro_snapshot.payload, '{}'::jsonb)
      || jsonb_build_object('dataAtualizacao', now());
END $$;

SELECT
  (SELECT count(*) FROM public.iso_pro_documentos_planejamento WHERE id LIKE 'load100k-doc-%') AS docs_seed_100k,
  (SELECT count(*) FROM public.iso_pro_documento_itens_planejamento WHERE id LIKE 'load100k-doc-%') AS itens_seed_100k,
  (SELECT count(*) FROM public.materiais WHERE codigo LIKE 'LOAD100K-M-%') AS mats_seed_100k,
  (SELECT count(*) FROM public.iso_pro_documentos_planejamento) AS docs_total,
  (SELECT count(*) FROM public.iso_pro_documento_itens_planejamento) AS itens_total;
