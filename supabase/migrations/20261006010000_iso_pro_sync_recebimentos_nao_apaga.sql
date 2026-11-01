-- A importacao em massa grava as notas nas tabelas.
-- O sync do snapshot apagava a tabela inteira e recriava so o que estava
-- na copia antiga. As notas novas sumiam da lista.

BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_sync_recebimentos_from_snapshot(
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
  v_arr jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tenant_id em falta.');
  END IF;

  SELECT s.payload INTO v_payload
  FROM public.iso_pro_snapshot AS s
  WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;

  v_arr := coalesce(v_payload -> 'recebimentos', '[]'::jsonb);
  IF jsonb_typeof(v_arr) <> 'array' THEN
    v_arr := '[]'::jsonb;
  END IF;

  -- Atualiza o que esta no snapshot. Nao apaga notas que so existem nas tabelas.
  RETURN public.iso_pro_upsert_recebimentos_lote(p_tenant_id, v_arr);
END;
$$;

COMMENT ON FUNCTION public.iso_pro_sync_recebimentos_from_snapshot(uuid) IS
  'Copia o snapshot para as tabelas sem apagar notas gravadas so na importacao.';

COMMIT;
