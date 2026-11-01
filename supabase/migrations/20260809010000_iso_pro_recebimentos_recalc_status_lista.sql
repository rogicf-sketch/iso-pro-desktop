-- Após gravar NF/recebimentos (SoT), refresca a coluna status dos desenhos
-- que usam os códigos afectadosidos — mesma lógica da lista da Organização principal
-- (Recebido/Parcial), sem depender de outbox/escala.
--
-- Causa do RMF-337-SEQ4-054: detalhe recalcula ao vivo → Recebido;
-- lista (filtro Todos) lia coluna status ainda em pendente.

BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_codigos_de_recebimentos_json(p_arr jsonb)
RETURNS text[]
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT c), ARRAY[]::text[])
  FROM (
    SELECT lower(btrim(coalesce(
      nullif(btrim(item->>'codigoMaterial'), ''),
      nullif(btrim(item->>'codigo'), ''),
      ''
    ))) AS c
    FROM jsonb_array_elements(coalesce(p_arr, '[]'::jsonb)) AS rec
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(rec->'itens', '[]'::jsonb)) AS item
  ) x
  WHERE c <> '';
$$;

COMMENT ON FUNCTION public.iso_pro_codigos_de_recebimentos_json(jsonb) IS
  'Extrai códigos normalizados dos itens de um array JSON de recebimentos.';

CREATE OR REPLACE FUNCTION public.iso_pro_recalcular_status_documentos_por_codigos(
  p_tenant_id uuid,
  p_codigos text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '90s'
AS $$
DECLARE
  v_codes text[];
  v_atualizados int := 0;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tenant_id em falta.');
  END IF;

  SELECT coalesce(array_agg(DISTINCT lower(btrim(c))), ARRAY[]::text[])
  INTO v_codes
  FROM unnest(coalesce(p_codigos, ARRAY[]::text[])) AS c
  WHERE btrim(coalesce(c, '')) <> '';

  IF coalesce(cardinality(v_codes), 0) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'atualizados', 0, 'codigos', 0);
  END IF;

  IF to_regprocedure('public.iso_pro_documento_status_derivado(uuid,text,text)') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'iso_pro_documento_status_derivado ausente.');
  END IF;

  UPDATE public.iso_pro_documentos_planejamento d
  SET
    status = public.iso_pro_documento_status_derivado(p_tenant_id, d.id, d.status),
    updated_at = now()
  WHERE d.tenant_id = p_tenant_id
    AND lower(btrim(coalesce(d.status, ''))) IS DISTINCT FROM 'cancelado'
    AND EXISTS (
      SELECT 1
      FROM public.iso_pro_documento_itens_planejamento i
      WHERE i.tenant_id = d.tenant_id
        AND i.documento_id = d.id
        AND lower(btrim(coalesce(i.codigo, ''))) = ANY (v_codes)
    );

  GET DIAGNOSTICS v_atualizados = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'atualizados', v_atualizados,
    'codigos', cardinality(v_codes)
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_recalcular_status_documentos_por_codigos(uuid, text[]) IS
  'Recalcula status da lista de planejamento para desenhos que usam os códigos indicados.';

REVOKE ALL ON FUNCTION public.iso_pro_recalcular_status_documentos_por_codigos(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_recalcular_status_documentos_por_codigos(uuid, text[])
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.iso_pro_write_recebimentos_sot(
  p_tenant_id uuid,
  p_baseline timestamptz DEFAULT NULL,
  p_upsert jsonb DEFAULT NULL,
  p_remove_ids text[] DEFAULT NULL,
  p_replace_all jsonb DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_new timestamptz := now();
  v_payload jsonb;
  v_arr jsonb := '[]'::jsonb;
  v_upsert jsonb := '[]'::jsonb;
  v_ids text[] := ARRAY[]::text[];
  v_id text;
  v_sync jsonb;
  v_updated int := 0;
  v_codigos text[] := ARRAY[]::text[];
  v_codigos_rm text[] := ARRAY[]::text[];
  v_codigos_up text[] := ARRAY[]::text[];
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'ISO_PRO_TENANT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  -- Códigos dos recebimentos a apagar (antes do delete) para refrescar status.
  IF p_remove_ids IS NOT NULL AND coalesce(cardinality(p_remove_ids), 0) > 0 THEN
    SELECT coalesce(array_agg(DISTINCT lower(btrim(ri.codigo))), ARRAY[]::text[])
    INTO v_codigos_rm
    FROM public.iso_pro_recebimento_itens ri
    WHERE ri.tenant_id = p_tenant_id
      AND ri.recebimento_id = ANY (p_remove_ids)
      AND btrim(coalesce(ri.codigo, '')) <> '';
  END IF;

  -- Modo replaceAll: limpa tabelas e regrava a partir do array.
  IF p_replace_all IS NOT NULL THEN
    IF jsonb_typeof(p_replace_all) <> 'array' THEN
      RAISE EXCEPTION 'ISO_PRO_RECEBIMENTOS_INVALID' USING ERRCODE = 'P0001';
    END IF;
    DELETE FROM public.iso_pro_recebimento_itens WHERE tenant_id = p_tenant_id;
    DELETE FROM public.iso_pro_recebimentos WHERE tenant_id = p_tenant_id;
    v_sync := public.iso_pro_upsert_recebimentos_lote(p_tenant_id, p_replace_all);
    IF coalesce((v_sync ->> 'ok')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION '%', coalesce(v_sync ->> 'error', 'Falha ao gravar recebimentos (replace).')
        USING ERRCODE = 'P0001';
    END IF;
    v_arr := p_replace_all;
    v_codigos_up := public.iso_pro_codigos_de_recebimentos_json(p_replace_all);

  ELSE
    IF p_remove_ids IS NOT NULL AND coalesce(cardinality(p_remove_ids), 0) > 0 THEN
      v_sync := public.iso_pro_delete_recebimentos(p_tenant_id, p_remove_ids);
      IF coalesce((v_sync ->> 'ok')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION '%', coalesce(v_sync ->> 'error', 'Falha ao apagar recebimentos.')
          USING ERRCODE = 'P0001';
      END IF;
    END IF;

    IF p_upsert IS NOT NULL THEN
      IF jsonb_typeof(p_upsert) <> 'array' THEN
        RAISE EXCEPTION 'ISO_PRO_RECEBIMENTOS_INVALID' USING ERRCODE = 'P0001';
      END IF;
      v_upsert := p_upsert;
      v_sync := public.iso_pro_upsert_recebimentos_lote(p_tenant_id, v_upsert);
      IF coalesce((v_sync ->> 'ok')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION '%', coalesce(v_sync ->> 'error', 'Falha ao gravar recebimentos (upsert).')
          USING ERRCODE = 'P0001';
      END IF;

      SELECT coalesce(array_agg(DISTINCT btrim(elem->>'id')), ARRAY[]::text[])
      INTO v_ids
      FROM jsonb_array_elements(v_upsert) elem
      WHERE btrim(coalesce(elem->>'id', '')) <> '';

      v_codigos_up := public.iso_pro_codigos_de_recebimentos_json(v_upsert);
    END IF;

    SELECT s.payload
    INTO v_payload
    FROM public.iso_pro_snapshot s
    WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;

    v_arr := coalesce(v_payload -> 'recebimentos', '[]'::jsonb);
    IF jsonb_typeof(v_arr) <> 'array' THEN
      v_arr := '[]'::jsonb;
    END IF;

    IF coalesce(cardinality(p_remove_ids), 0) > 0 OR coalesce(cardinality(v_ids), 0) > 0 THEN
      SELECT coalesce(jsonb_agg(elem ORDER BY ord), '[]'::jsonb)
      INTO v_arr
      FROM (
        SELECT elem, ord
        FROM jsonb_array_elements(v_arr) WITH ORDINALITY AS t(elem, ord)
        WHERE btrim(coalesce(elem->>'id', '')) <> ''
          AND NOT (
            coalesce(cardinality(p_remove_ids), 0) > 0
            AND btrim(elem->>'id') = ANY (p_remove_ids)
          )
          AND NOT (
            coalesce(cardinality(v_ids), 0) > 0
            AND btrim(elem->>'id') = ANY (v_ids)
          )
      ) x;
    END IF;

    IF jsonb_typeof(v_upsert) = 'array' AND jsonb_array_length(v_upsert) > 0 THEN
      v_arr := coalesce(v_arr, '[]'::jsonb) || v_upsert;
    END IF;
  END IF;

  PERFORM set_config('iso_pro.skip_escala_outbox', 'on', true);
  BEGIN
    IF p_baseline IS NULL THEN
      INSERT INTO public.iso_pro_snapshot (id, tenant_id, payload, updated_at)
      VALUES (
        'default',
        p_tenant_id,
        jsonb_build_object('recebimentos', v_arr, 'dataAtualizacao', v_new),
        v_new
      )
      ON CONFLICT (id, tenant_id) DO UPDATE SET
        payload = coalesce(public.iso_pro_snapshot.payload, '{}'::jsonb)
          || jsonb_build_object('recebimentos', v_arr, 'dataAtualizacao', v_new),
        updated_at = v_new;
    ELSE
      UPDATE public.iso_pro_snapshot s
      SET
        payload = coalesce(s.payload, '{}'::jsonb)
          || jsonb_build_object('recebimentos', v_arr, 'dataAtualizacao', v_new),
        updated_at = v_new
      WHERE s.id = 'default' AND s.tenant_id = p_tenant_id AND s.updated_at = p_baseline;
      GET DIAGNOSTICS v_updated = ROW_COUNT;
      IF v_updated = 0 THEN
        RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_CONFLICT' USING ERRCODE = 'P0001';
      END IF;
    END IF;
    PERFORM set_config('iso_pro.skip_escala_outbox', 'off', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('iso_pro.skip_escala_outbox', 'off', true);
    RAISE;
  END;

  -- Une códigos removidos + gravados e refresca status da lista.
  SELECT coalesce(array_agg(DISTINCT c), ARRAY[]::text[])
  INTO v_codigos
  FROM unnest(
    coalesce(v_codigos_rm, ARRAY[]::text[]) || coalesce(v_codigos_up, ARRAY[]::text[])
  ) AS c
  WHERE btrim(coalesce(c, '')) <> '';

  IF coalesce(cardinality(v_codigos), 0) > 0 THEN
    PERFORM public.iso_pro_recalcular_status_documentos_por_codigos(p_tenant_id, v_codigos);
  END IF;

  RETURN v_new;
END;
$$;

COMMENT ON FUNCTION public.iso_pro_write_recebimentos_sot(uuid, timestamptz, jsonb, text[], jsonb) IS
  'SoT recebimentos: tabelas + snapshot; refresca status da lista de planejamento dos códigos tocados.';

REVOKE ALL ON FUNCTION public.iso_pro_write_recebimentos_sot(uuid, timestamptz, jsonb, text[], jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_write_recebimentos_sot(uuid, timestamptz, jsonb, text[], jsonb)
  TO authenticated, service_role;

-- Heal one-shot: desenhos ainda "pendente" cujo status derivado já é recebido/parcial/atendido.
-- Evita timeout: só candidatos com pelo menos um código presente em recebimentos activos.
DO $$
DECLARE
  v_tenant uuid;
  v_ids text[];
  v_batch text[];
  v_i int;
BEGIN
  FOR v_tenant IN
    SELECT DISTINCT tenant_id FROM public.iso_pro_documentos_planejamento
  LOOP
    SELECT array_agg(d.id)
    INTO v_ids
    FROM public.iso_pro_documentos_planejamento d
    WHERE d.tenant_id = v_tenant
      AND lower(btrim(coalesce(d.status, ''))) = 'pendente'
      AND EXISTS (
        SELECT 1
        FROM public.iso_pro_documento_itens_planejamento i
        INNER JOIN public.iso_pro_recebimento_itens ri
          ON ri.tenant_id = i.tenant_id
         AND lower(btrim(coalesce(ri.codigo, ''))) = lower(btrim(coalesce(i.codigo, '')))
        INNER JOIN public.iso_pro_recebimentos r
          ON r.tenant_id = ri.tenant_id AND r.id = ri.recebimento_id
        WHERE i.tenant_id = d.tenant_id
          AND i.documento_id = d.id
          AND lower(btrim(coalesce(r.status, ''))) NOT IN ('cancelado', 'rascunho')
          AND (
            lower(btrim(r.modo_recebimento)) = 'direto'
            OR lower(btrim(r.status)) IN ('conferido', 'parcialmente_conferido', 'divergente')
          )
      );

    IF v_ids IS NULL THEN
      CONTINUE;
    END IF;

    v_i := 1;
    WHILE v_i <= cardinality(v_ids) LOOP
      v_batch := v_ids[v_i : least(v_i + 49, cardinality(v_ids))];
      UPDATE public.iso_pro_documentos_planejamento d
      SET
        status = public.iso_pro_documento_status_derivado(v_tenant, d.id, d.status),
        updated_at = now()
      WHERE d.tenant_id = v_tenant
        AND d.id = ANY (v_batch);
      v_i := v_i + 50;
    END LOOP;
  END LOOP;
END $$;

COMMIT;
