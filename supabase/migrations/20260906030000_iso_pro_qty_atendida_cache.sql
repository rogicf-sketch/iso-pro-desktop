-- Cache qty atendida (espelho do cache recebida) — boot Atendimento mobile ~15s → <1s.

BEGIN;

CREATE TABLE IF NOT EXISTS public.iso_pro_qty_atendida_por_codigo (
  tenant_id uuid NOT NULL,
  codigo text NOT NULL,
  quantidade numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, codigo)
);

CREATE INDEX IF NOT EXISTS iso_pro_qty_atendida_por_codigo_tenant_idx
  ON public.iso_pro_qty_atendida_por_codigo (tenant_id);

ALTER TABLE public.iso_pro_qty_atendida_por_codigo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS iso_pro_qty_atendida_tenant ON public.iso_pro_qty_atendida_por_codigo;
CREATE POLICY iso_pro_qty_atendida_tenant ON public.iso_pro_qty_atendida_por_codigo
  FOR SELECT TO authenticated
  USING (public.iso_pro_rls_tenant_row_allowed(tenant_id));

DROP POLICY IF EXISTS iso_pro_qty_atendida_service ON public.iso_pro_qty_atendida_por_codigo;
CREATE POLICY iso_pro_qty_atendida_service ON public.iso_pro_qty_atendida_por_codigo
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.iso_pro_qty_atendida_por_codigo FROM PUBLIC;
GRANT SELECT ON TABLE public.iso_pro_qty_atendida_por_codigo TO authenticated;
GRANT ALL ON TABLE public.iso_pro_qty_atendida_por_codigo TO service_role;

CREATE OR REPLACE FUNCTION public.iso_pro_refresh_qty_atendida_por_codigo(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '180s'
AS $$
DECLARE
  v_n int := 0;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tenant_id em falta');
  END IF;

  DELETE FROM public.iso_pro_qty_atendida_por_codigo WHERE tenant_id = p_tenant_id;

  INSERT INTO public.iso_pro_qty_atendida_por_codigo (tenant_id, codigo, quantidade)
  SELECT
    p_tenant_id,
    lower(btrim(coalesce(i.codigo, ''))),
    sum(greatest(coalesce(i.quantidade_atendida, 0), 0))::numeric
  FROM public.iso_pro_documento_itens_planejamento i
  INNER JOIN public.iso_pro_documentos_planejamento d
    ON d.tenant_id = i.tenant_id AND d.id = i.documento_id
  WHERE i.tenant_id = p_tenant_id
    AND lower(btrim(coalesce(d.status, ''))) <> 'cancelado'
    AND lower(btrim(coalesce(i.codigo, ''))) <> ''
  GROUP BY 1, 2;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'codigos', v_n);
END;
$$;

REVOKE ALL ON FUNCTION public.iso_pro_refresh_qty_atendida_por_codigo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_refresh_qty_atendida_por_codigo(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.iso_pro_sum_quantidade_atendida_por_codigo(
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  v_map jsonb := '{}'::jsonb;
  v_cached int := 0;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  SELECT count(*)::int INTO v_cached
  FROM public.iso_pro_qty_atendida_por_codigo c
  WHERE c.tenant_id = p_tenant_id;

  IF coalesce(v_cached, 0) > 0 THEN
    SELECT coalesce(jsonb_object_agg(c.codigo, c.quantidade), '{}'::jsonb)
    INTO v_map
    FROM public.iso_pro_qty_atendida_por_codigo c
    WHERE c.tenant_id = p_tenant_id;
    RETURN jsonb_build_object('porCodigo', coalesce(v_map, '{}'::jsonb), '_source', 'cache');
  END IF;

  -- Cache frio: leitura directa (sem DELETE) — ops faz refresh.
  SELECT coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
  INTO v_map
  FROM (
    SELECT
      lower(btrim(coalesce(i.codigo, ''))) AS k,
      sum(greatest(coalesce(i.quantidade_atendida, 0), 0))::numeric AS v
    FROM public.iso_pro_documento_itens_planejamento i
    INNER JOIN public.iso_pro_documentos_planejamento d
      ON d.tenant_id = i.tenant_id AND d.id = i.documento_id
    WHERE i.tenant_id = p_tenant_id
      AND lower(btrim(coalesce(d.status, ''))) <> 'cancelado'
      AND lower(btrim(coalesce(i.codigo, ''))) <> ''
    GROUP BY 1
  ) s;

  RETURN jsonb_build_object('porCodigo', coalesce(v_map, '{}'::jsonb), '_source', 'tables');
END;
$$;

REVOKE ALL ON FUNCTION public.iso_pro_sum_quantidade_atendida_por_codigo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_sum_quantidade_atendida_por_codigo(uuid)
  TO anon, authenticated, service_role;

COMMIT;
