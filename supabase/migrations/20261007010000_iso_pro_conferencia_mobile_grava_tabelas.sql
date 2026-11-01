-- Conferencia no telemovel gravava so no snapshot e falhava se a copia
-- estava desatualizada. A nota voltava para «aguardando conferencia».
-- Se a copia mudou, o merge por id repete com a data atual.
-- O recebimento do patch entra tambem nas tabelas, que sao a lista do telemovel.

BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_submit_escala_domain_patch(
  p_tenant_id uuid,
  p_baseline timestamptz,
  p_patch jsonb,
  p_merge_keys text[] DEFAULT NULL,
  p_domain text DEFAULT 'recebimentos'
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  v_domain text;
  v_key text;
  v_allowed text[];
  v_new timestamptz;
  v_base timestamptz;
  v_try integer := 0;
  v_recs jsonb;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  v_domain := lower(btrim(coalesce(p_domain, 'recebimentos')));

  IF v_domain = 'recebimentos' THEN
    v_allowed := ARRAY['recebimentos', 'materiais', 'dataAtualizacao'];
  ELSIF v_domain IN ('inventarios', 'inventario') THEN
    v_allowed := ARRAY['inventarios', 'materiais', 'estoqueAjustes', 'dataAtualizacao'];
  ELSE
    RAISE EXCEPTION 'ISO_PRO_ESCALA_DOMAIN_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF p_patch IS NULL OR p_patch = '{}'::jsonb THEN
    RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_patch)
  LOOP
    IF NOT (v_key = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'ISO_PRO_ESCALA_DOMAIN_KEY_FORBIDDEN:%', v_key USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  LOOP
    v_try := v_try + 1;
    BEGIN
      IF v_try = 1 THEN
        v_base := p_baseline;
      ELSE
        SELECT s.updated_at INTO v_base
        FROM public.iso_pro_snapshot AS s
        WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;
      END IF;

      v_new := public.iso_pro_patch_snapshot(p_tenant_id, v_base, p_patch, p_merge_keys);
      EXIT;
    EXCEPTION
      WHEN SQLSTATE 'P0001' THEN
        IF SQLERRM NOT LIKE '%ISO_PRO_SNAPSHOT_CONFLICT%' OR v_try >= 5 THEN
          RAISE;
        END IF;
    END;
  END LOOP;

  IF v_domain = 'recebimentos' AND jsonb_typeof(p_patch -> 'recebimentos') = 'array' THEN
    v_recs := p_patch -> 'recebimentos';
    IF jsonb_array_length(v_recs) > 0 THEN
      PERFORM public.iso_pro_upsert_recebimentos_lote(p_tenant_id, v_recs);
    END IF;
  END IF;

  RETURN v_new;
END;
$$;

COMMENT ON FUNCTION public.iso_pro_submit_escala_domain_patch(uuid, timestamptz, jsonb, text[], text) IS
  'Conferencia/inventario: merge mesmo com copia desatualizada e grava o recebimento nas tabelas.';

REVOKE ALL ON FUNCTION public.iso_pro_submit_escala_domain_patch(uuid, timestamptz, jsonb, text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_submit_escala_domain_patch(uuid, timestamptz, jsonb, text[], text)
  TO authenticated, service_role;

COMMIT;
