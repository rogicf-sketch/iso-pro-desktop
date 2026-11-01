-- PostgREST nao resolve overload (uuid) vs (uuid, text[] DEFAULT).
-- Fica so a assinatura com p_codigos opcional.

BEGIN;

DROP FUNCTION IF EXISTS public.iso_pro_sum_metricas_planejamento_por_codigo(uuid);
DROP FUNCTION IF EXISTS public.iso_pro_sum_metricas_planejamento_por_codigo(uuid, text[]);

CREATE OR REPLACE FUNCTION public.iso_pro_sum_metricas_planejamento_por_codigo(
  p_tenant_id uuid,
  p_codigos text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '90s'
AS $$
DECLARE
  v_prev jsonb := '{}'::jsonb;
  v_at jsonb := '{}'::jsonb;
  v_rec jsonb := '{}'::jsonb;
  v_out jsonb := '{}'::jsonb;
  v_codes text[];
  r record;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  IF NOT public.iso_pro_documentos_tabelas_ativas(p_tenant_id) THEN
    RETURN jsonb_build_object('porCodigo', '{}'::jsonb, '_source', 'empty');
  END IF;

  SELECT coalesce(array_agg(DISTINCT lower(btrim(c))), ARRAY[]::text[])
  INTO v_codes
  FROM unnest(coalesce(p_codigos, ARRAY[]::text[])) AS c
  WHERE btrim(coalesce(c, '')) <> '';

  SELECT
    coalesce(jsonb_object_agg(k, prevista), '{}'::jsonb),
    coalesce(jsonb_object_agg(k, atendido), '{}'::jsonb)
  INTO v_prev, v_at
  FROM (
    SELECT
      lower(btrim(coalesce(i.codigo, ''))) AS k,
      sum(greatest(coalesce(i.quantidade, 0), 0))::numeric AS prevista,
      sum(greatest(coalesce(i.quantidade_atendida, 0), 0))::numeric AS atendido
    FROM public.iso_pro_documento_itens_planejamento i
    INNER JOIN public.iso_pro_documentos_planejamento d
      ON d.tenant_id = i.tenant_id AND d.id = i.documento_id
    WHERE i.tenant_id = p_tenant_id
      AND lower(btrim(coalesce(d.status, ''))) IS DISTINCT FROM 'cancelado'
      AND lower(btrim(coalesce(i.codigo, ''))) <> ''
      AND (
        coalesce(cardinality(v_codes), 0) = 0
        OR lower(btrim(i.codigo)) = ANY (v_codes)
      )
    GROUP BY 1
  ) s;

  IF public.iso_pro_recebimentos_tabelas_ativas(p_tenant_id) THEN
    SELECT coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
    INTO v_rec
    FROM (
      SELECT
        lower(btrim(coalesce(ri.codigo, ''))) AS k,
        sum(
          CASE
            WHEN regexp_replace(
                   lower(btrim(coalesce(r.modo_recebimento, 'direto'))),
                   '\s+', '_', 'g'
                 ) IN ('aguardando_conferencia', 'conferencia', 'aguardando')
            THEN CASE
              WHEN lower(btrim(coalesce(r.status, ''))) IN (
                'conferido', 'parcialmente_conferido', 'divergente'
              )
              THEN greatest(coalesce(ri.quantidade_conferida, 0), 0)
              ELSE 0
            END
            ELSE greatest(coalesce(ri.quantidade, 0), 0)
          END
        )::numeric AS v
      FROM public.iso_pro_recebimento_itens ri
      INNER JOIN public.iso_pro_recebimentos r
        ON r.tenant_id = ri.tenant_id AND r.id = ri.recebimento_id
      WHERE ri.tenant_id = p_tenant_id
        AND lower(btrim(coalesce(r.status, ''))) NOT IN ('cancelado', 'rascunho')
        AND lower(btrim(coalesce(ri.codigo, ''))) <> ''
        AND (
          coalesce(cardinality(v_codes), 0) = 0
          OR lower(btrim(ri.codigo)) = ANY (v_codes)
        )
        AND (
          lower(btrim(coalesce(r.modo_recebimento, 'direto'))) = 'direto'
          OR lower(btrim(coalesce(r.status, ''))) IN (
            'conferido', 'parcialmente_conferido', 'divergente'
          )
        )
      GROUP BY 1
    ) s;
  END IF;

  FOR r IN
    SELECT DISTINCT k FROM (
      SELECT jsonb_object_keys(v_prev) AS k
      UNION
      SELECT jsonb_object_keys(v_at)
      UNION
      SELECT jsonb_object_keys(v_rec)
    ) u
  LOOP
    v_out := v_out || jsonb_build_object(
      r.k,
      jsonb_build_object(
        'prevista', coalesce((v_prev ->> r.k)::numeric, 0),
        'recebido', coalesce((v_rec ->> r.k)::numeric, 0),
        'atendido', coalesce((v_at ->> r.k)::numeric, 0)
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'porCodigo', coalesce(v_out, '{}'::jsonb),
    '_source', 'tables',
    '_filtered', coalesce(cardinality(v_codes), 0) > 0
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_sum_metricas_planejamento_por_codigo(uuid, text[]) IS
  'Metricas por codigo (1 scan docs). p_codigos opcional; unica assinatura para PostgREST.';

REVOKE ALL ON FUNCTION public.iso_pro_sum_metricas_planejamento_por_codigo(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_sum_metricas_planejamento_por_codigo(uuid, text[])
  TO authenticated, service_role;

COMMIT;
