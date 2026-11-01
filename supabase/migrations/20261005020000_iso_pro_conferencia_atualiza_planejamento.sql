-- Conferencia gravava o recebimento e o cache de quantidade ficava 0.
-- O planejamento continuava Pendente mesmo com a NF conferida.
-- O cache dos codigos tocados passa a ser recalculado na hora, e o status
-- do documento pendente sobe para Recebido/Parcial com o estoque real.

BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_sync_planejamento_por_codigos(
  p_tenant_id uuid,
  p_codigos text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '20s'
AS $$
DECLARE
  v_codes text[];
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN;
  END IF;

  SELECT coalesce(array_agg(DISTINCT lower(btrim(c))), ARRAY[]::text[])
  INTO v_codes
  FROM unnest(coalesce(p_codigos, ARRAY[]::text[])) AS c
  WHERE btrim(coalesce(c, '')) <> '';

  IF coalesce(cardinality(v_codes), 0) = 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.iso_pro_qty_recebida_por_codigo (tenant_id, codigo, quantidade)
  SELECT
    p_tenant_id,
    a.codigo,
    coalesce(s.qtd, 0)
  FROM unnest(v_codes) AS a(codigo)
  LEFT JOIN (
    SELECT
      lower(btrim(coalesce(ri.codigo, ''))) AS codigo,
      sum(
        CASE
          WHEN regexp_replace(
                 lower(btrim(coalesce(r.modo_recebimento, 'direto'))),
                 '\s+', '_', 'g'
               ) IN ('aguardando_conferencia', 'conferencia', 'aguardando')
          THEN CASE
            WHEN lower(btrim(coalesce(r.status, ''))) = 'conferido'
            THEN greatest(coalesce(ri.quantidade_conferida, 0), 0)
            ELSE 0
          END
          ELSE greatest(coalesce(ri.quantidade, 0), 0)
        END
      )::numeric AS qtd
    FROM public.iso_pro_recebimento_itens ri
    INNER JOIN public.iso_pro_recebimentos r
      ON r.tenant_id = ri.tenant_id AND r.id = ri.recebimento_id
    WHERE ri.tenant_id = p_tenant_id
      AND lower(btrim(coalesce(r.status, ''))) <> 'cancelado'
      AND lower(btrim(coalesce(ri.codigo, ''))) = ANY (v_codes)
    GROUP BY 1
  ) s ON s.codigo = a.codigo
  ON CONFLICT (tenant_id, codigo) DO UPDATE
    SET quantidade = EXCLUDED.quantidade;

  WITH plan AS (
    SELECT
      lower(btrim(coalesce(i.codigo, ''))) AS codigo,
      sum(coalesce(i.quantidade, 0)) AS prevista
    FROM public.iso_pro_documento_itens_planejamento i
    INNER JOIN public.iso_pro_documentos_planejamento d
      ON d.tenant_id = i.tenant_id AND d.id = i.documento_id
    WHERE i.tenant_id = p_tenant_id
      AND lower(btrim(coalesce(d.status, ''))) IS DISTINCT FROM 'cancelado'
      AND lower(btrim(coalesce(i.codigo, ''))) = ANY (v_codes)
    GROUP BY 1
  ),
  doc_agg AS (
    SELECT
      d.id,
      coalesce(sum(i.quantidade), 0) AS q_proj,
      coalesce(sum(i.quantidade_atendida), 0) AS q_at,
      bool_or(coalesce(c.quantidade, 0) > 1e-9) AS has_rec,
      bool_and(
        coalesce(p.prevista, 0) <= 1e-9
        OR coalesce(c.quantidade, 0) + 1e-9 >= coalesce(p.prevista, 0)
      ) AS all_cobertos,
      bool_or(
        coalesce(c.quantidade, 0) > 1e-9
        AND coalesce(p.prevista, 0) > 1e-9
        AND coalesce(c.quantidade, 0) + 1e-9 < coalesce(p.prevista, 0)
      ) AS algum_parcial
    FROM public.iso_pro_documentos_planejamento d
    INNER JOIN public.iso_pro_documento_itens_planejamento i
      ON i.tenant_id = d.tenant_id AND i.documento_id = d.id
    LEFT JOIN public.iso_pro_qty_recebida_por_codigo c
      ON c.tenant_id = d.tenant_id
     AND c.codigo = lower(btrim(coalesce(i.codigo, '')))
    LEFT JOIN plan p
      ON p.codigo = lower(btrim(coalesce(i.codigo, '')))
    WHERE d.tenant_id = p_tenant_id
      AND lower(btrim(coalesce(d.status, ''))) = 'pendente'
      AND EXISTS (
        SELECT 1
        FROM public.iso_pro_documento_itens_planejamento ix
        WHERE ix.tenant_id = d.tenant_id
          AND ix.documento_id = d.id
          AND lower(btrim(coalesce(ix.codigo, ''))) = ANY (v_codes)
      )
    GROUP BY d.id
  ),
  novo AS (
    SELECT
      id,
      CASE
        WHEN q_proj > 0 AND q_at + 1e-9 >= q_proj THEN 'atendido'
        WHEN q_at > 1e-9 THEN 'parcial'
        WHEN NOT has_rec THEN 'pendente'
        WHEN all_cobertos AND NOT algum_parcial THEN 'recebido'
        ELSE 'parcial'
      END AS status_novo
    FROM doc_agg
  )
  UPDATE public.iso_pro_documentos_planejamento d
  SET status = n.status_novo,
      updated_at = now()
  FROM novo n
  WHERE d.id = n.id
    AND d.tenant_id = p_tenant_id
    AND n.status_novo IS DISTINCT FROM 'pendente';
END;
$$;

REVOKE ALL ON FUNCTION public.iso_pro_sync_planejamento_por_codigos(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_sync_planejamento_por_codigos(uuid, text[])
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.iso_pro_trg_qty_item_recebimento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_codigo text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_tenant := OLD.tenant_id;
    v_codigo := OLD.codigo;
  ELSE
    v_tenant := NEW.tenant_id;
    v_codigo := NEW.codigo;
  END IF;

  PERFORM public.iso_pro_sync_planejamento_por_codigos(v_tenant, ARRAY[v_codigo]);

  IF TG_OP = 'UPDATE'
     AND lower(btrim(coalesce(OLD.codigo, ''))) IS DISTINCT FROM lower(btrim(coalesce(NEW.codigo, ''))) THEN
    PERFORM public.iso_pro_sync_planejamento_por_codigos(OLD.tenant_id, ARRAY[OLD.codigo]);
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_trg_qty_cabecalho_recebimento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_codes text[];
BEGIN
  SELECT coalesce(array_agg(DISTINCT lower(btrim(ri.codigo))), ARRAY[]::text[])
  INTO v_codes
  FROM public.iso_pro_recebimento_itens ri
  WHERE ri.tenant_id = NEW.tenant_id
    AND ri.recebimento_id = NEW.id
    AND btrim(coalesce(ri.codigo, '')) <> '';

  PERFORM public.iso_pro_sync_planejamento_por_codigos(NEW.tenant_id, v_codes);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS iso_pro_trg_qty_item_recebimento ON public.iso_pro_recebimento_itens;
CREATE TRIGGER iso_pro_trg_qty_item_recebimento
AFTER INSERT OR DELETE OR UPDATE OF quantidade, quantidade_conferida, codigo
ON public.iso_pro_recebimento_itens
FOR EACH ROW
EXECUTE FUNCTION public.iso_pro_trg_qty_item_recebimento();

DROP TRIGGER IF EXISTS iso_pro_trg_qty_cabecalho_recebimento ON public.iso_pro_recebimentos;
CREATE TRIGGER iso_pro_trg_qty_cabecalho_recebimento
AFTER INSERT OR UPDATE OF status, modo_recebimento
ON public.iso_pro_recebimentos
FOR EACH ROW
EXECUTE FUNCTION public.iso_pro_trg_qty_cabecalho_recebimento();

COMMIT;
