-- A lista antiga espera este RPC antes de mostrar os documentos.
-- O corpo anterior somava estoque de todo o tenant (média 18s, teto 60s).
-- A coluna status já está alinhada; aqui só a devolve.

BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_status_documentos_planejamento_lote(
  p_tenant_id uuid,
  p_ids text[],
  p_persist boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '5s'
AS $$
DECLARE
  v_ids text[];
  v_por_id jsonb := '{}'::jsonb;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::text[])
  INTO v_ids
  FROM (
    SELECT btrim(u) AS x
    FROM unnest(coalesce(p_ids, ARRAY[]::text[])) AS u
    WHERE btrim(coalesce(u, '')) <> ''
    LIMIT 100
  ) s;

  IF coalesce(array_length(v_ids, 1), 0) = 0 THEN
    RETURN jsonb_build_object('porId', '{}'::jsonb, 'atualizados', 0, '_source', 'empty');
  END IF;

  SELECT coalesce(jsonb_object_agg(d.id, lower(btrim(coalesce(nullif(d.status, ''), 'pendente')))), '{}'::jsonb)
  INTO v_por_id
  FROM public.iso_pro_documentos_planejamento d
  WHERE d.tenant_id = p_tenant_id
    AND d.id = ANY (v_ids);

  RETURN jsonb_build_object(
    'porId', coalesce(v_por_id, '{}'::jsonb),
    'atualizados', 0,
    '_source', 'coluna'
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_status_documentos_planejamento_lote(uuid, text[], boolean) IS
  'Devolve a coluna status dos IDs pedidos. Sem varrer estoque.';

COMMIT;
