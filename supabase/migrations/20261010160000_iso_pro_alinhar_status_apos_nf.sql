-- Depois da NF, a lista lia a coluna status (ainda Pendente) e o Excel lia
-- o cache de quantidade. Codigo novo fora do cache virava Pendente, enquanto
-- o detalhe (estoque ao vivo) ja mostrava Recebido.

BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_alinhar_status_documentos_por_codigos(
  p_tenant_id uuid,
  p_codigos text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '120s'
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

  WITH alvo AS (
    SELECT d.id
    FROM public.iso_pro_documentos_planejamento d
    WHERE d.tenant_id = p_tenant_id
      AND lower(btrim(coalesce(d.status, ''))) IS DISTINCT FROM 'cancelado'
      AND EXISTS (
        SELECT 1
        FROM public.iso_pro_documento_itens_planejamento i
        WHERE i.tenant_id = d.tenant_id
          AND i.documento_id = d.id
          AND lower(btrim(coalesce(i.codigo, ''))) = ANY (v_codes)
      )
  ),
  prevista_cod AS (
    SELECT
      lower(btrim(coalesce(di.codigo, ''))) AS codigo,
      sum(di.quantidade) AS prevista
    FROM public.iso_pro_documento_itens_planejamento di
    INNER JOIN public.iso_pro_documentos_planejamento d
      ON d.tenant_id = di.tenant_id AND d.id = di.documento_id
    WHERE di.tenant_id = p_tenant_id
      AND lower(btrim(coalesce(d.status, ''))) IS DISTINCT FROM 'cancelado'
      AND lower(btrim(coalesce(di.codigo, ''))) = ANY (v_codes)
    GROUP BY 1
  ),
  recebido_cod AS (
    SELECT
      lower(btrim(coalesce(ri.codigo, ''))) AS codigo,
      sum(
        CASE
          WHEN lower(btrim(coalesce(r.modo_recebimento, 'direto'))) = 'direto'
            THEN greatest(coalesce(ri.quantidade, 0), 0)
          WHEN ri.quantidade_conferida IS NOT NULL
            THEN greatest(coalesce(ri.quantidade_conferida, 0), 0)
          ELSE greatest(coalesce(ri.quantidade, 0), 0)
        END
      ) AS recebido
    FROM public.iso_pro_recebimento_itens ri
    INNER JOIN public.iso_pro_recebimentos r
      ON r.tenant_id = ri.tenant_id AND r.id = ri.recebimento_id
    WHERE ri.tenant_id = p_tenant_id
      AND lower(btrim(coalesce(ri.codigo, ''))) = ANY (v_codes)
      AND lower(btrim(coalesce(r.status, ''))) NOT IN ('cancelado', 'rascunho')
      AND (
        lower(btrim(coalesce(r.modo_recebimento, 'direto'))) = 'direto'
        OR lower(btrim(coalesce(r.status, ''))) IN (
          'conferido', 'parcialmente_conferido', 'divergente'
        )
      )
    GROUP BY 1
  ),
  linha_st AS (
    SELECT
      i.documento_id,
      CASE
        WHEN coalesce(i.quantidade, 0) > 0
          AND coalesce(i.quantidade_atendida, 0) + 1e-9 >= coalesce(i.quantidade, 0)
          THEN 'atendido'
        WHEN coalesce(rc.recebido, 0) <= 1e-9 THEN 'pendente'
        WHEN coalesce(rc.recebido, 0) + 1e-9 < coalesce(pc.prevista, 0) THEN 'parcial'
        ELSE 'recebido'
      END AS st
    FROM public.iso_pro_documento_itens_planejamento i
    LEFT JOIN prevista_cod pc
      ON pc.codigo = lower(btrim(coalesce(i.codigo, '')))
    LEFT JOIN recebido_cod rc
      ON rc.codigo = lower(btrim(coalesce(i.codigo, '')))
    WHERE i.tenant_id = p_tenant_id
      AND i.documento_id IN (SELECT id FROM alvo)
  ),
  doc_novo AS (
    SELECT
      documento_id,
      CASE
        WHEN count(*) FILTER (WHERE st = 'atendido') = count(*) THEN 'atendido'
        WHEN count(*) FILTER (WHERE st IN ('recebido', 'atendido')) = count(*) THEN 'recebido'
        WHEN count(*) FILTER (WHERE st = 'pendente') = count(*) THEN 'pendente'
        ELSE 'parcial'
      END AS novo
    FROM linha_st
    GROUP BY documento_id
  ),
  upd AS (
    UPDATE public.iso_pro_documentos_planejamento d
    SET
      status = n.novo,
      updated_at = now()
    FROM doc_novo n
    WHERE d.tenant_id = p_tenant_id
      AND d.id = n.documento_id
      AND lower(btrim(coalesce(d.status, ''))) IS DISTINCT FROM n.novo
    RETURNING d.id
  )
  SELECT count(*)::int INTO v_atualizados FROM upd;

  RETURN jsonb_build_object(
    'ok', true,
    'atualizados', v_atualizados,
    'codigos', cardinality(v_codes)
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_alinhar_status_documentos_por_codigos(uuid, text[]) IS
  'Apos NF: coluna status do desenho segue a linha (Pendente/Parcial/Recebido/Atendido) pelo estoque ao vivo.';

REVOKE ALL ON FUNCTION public.iso_pro_alinhar_status_documentos_por_codigos(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_alinhar_status_documentos_por_codigos(uuid, text[])
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
