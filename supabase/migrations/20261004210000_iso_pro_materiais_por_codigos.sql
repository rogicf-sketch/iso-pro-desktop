-- Consulta dos materiais da importacao numa passagem, pelo indice
-- (tenant_id, lower(codigo)). O filtro ilike em ondas levava dezenas de segundos.

BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_materiais_por_codigos(
  p_tenant_id uuid,
  p_codigos text[]
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'codigo', m.codigo,
        'codigo_barras', m.codigo_barras,
        'descricao', m.descricao,
        'diametro', m.diametro,
        'disciplina', m.disciplina,
        'unidade', m.unidade,
        'peso', m.peso,
        'estoque_minimo', m.estoque_minimo,
        'ativo', m.ativo
      )
    ),
    '[]'::jsonb
  )
  FROM public.materiais m
  WHERE m.tenant_id = p_tenant_id
    AND lower(btrim(m.codigo)) IN (
      SELECT lower(btrim(c))
      FROM unnest(coalesce(p_codigos, ARRAY[]::text[])) AS c
      WHERE btrim(coalesce(c, '')) <> ''
    );
$$;

REVOKE ALL ON FUNCTION public.iso_pro_materiais_por_codigos(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_materiais_por_codigos(uuid, text[]) TO authenticated, service_role;

COMMIT;
