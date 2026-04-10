-- =============================================================================
-- I.S.O PRO — RPC opcional: referencias de materiais no Postgres (Supabase)
-- =============================================================================
-- Objetivo: complementar a analise feita no cliente (snapshot + localStorage) com
-- uma consulta direta ao banco, quando existirem tabelas relacionais ou regras
-- que nao aparecem no payload do app.
--
-- Nome da funcao (sugestao):
--   public.iso_pro_materiais_uso_nos_modulos
--
-- Parametros (PostgREST / supabase-js):
--   p_material_ids  bigint[]   -- IDs em public.materiais (mesma PK usada pelo app)
--
-- Retorno (JSONB), formato unico:
--   {
--     "items": [
--       {
--         "material_id": 12,
--         "codigo": "TB-0001",
--         "recebimentos": false,
--         "documentos": false,
--         "atendimento": false
--       }
--     ]
--   }
--
-- Regras:
--   - Um material so aparece em "items" se existir linha em public.materiais para o id.
--   - Flags devem ser true se houver QUALQUER referencia no modulo (conforme schema real).
--   - Normalizacao de codigo no banco: usar a mesma regra do app (trim + lower) ao comparar
--     por texto, se nao houver FK por id.
--
-- Seguranca:
--   - Preferir SECURITY INVOKER (padrao) + RLS nas tabelas consultadas.
--   - Evitar SECURITY DEFINER salvo necessidade e revisao de search_path / grants.
--
-- Cliente (TypeScript), apos criar a funcao no projeto Supabase:
--   const { data, error } = await supabase.rpc('iso_pro_materiais_uso_nos_modulos', {
--     p_material_ids: [1, 2, 3],
--   });
--   // data: { items: [...] } conforme contrato acima
--
-- Implementacao abaixo: CORPO MINIMO (todas as flags false). Substituir os blocos
-- marcados por EXISTS / joins reais quando as tabelas e colunas estiverem definidas.
-- Exemplos comentados de onde costuma haver FK:
--   - recebimentos / itens de NF: material_id ou codigo_material
--   - documentos / itens de projeto: material_id ou codigo alfanumerico
--   - atendimentos / linhas de lote: material_id ou codigo
-- =============================================================================

CREATE OR REPLACE FUNCTION public.iso_pro_materiais_uso_nos_modulos(p_material_ids bigint[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_items jsonb := '[]'::jsonb;
  r record;
  v_rec boolean;
  v_doc boolean;
  v_atd boolean;
BEGIN
  IF p_material_ids IS NULL OR array_length(p_material_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('items', '[]'::jsonb);
  END IF;

  FOR r IN
    SELECT m.id AS material_id, trim(both from coalesce(m.codigo, '')) AS codigo
    FROM public.materiais AS m
    WHERE m.id = ANY (p_material_ids)
  LOOP
    v_rec := false;
    v_doc := false;
    v_atd := false;

    -- TODO: substituir por consultas reais. Exemplos (ajustar nomes de tabela/coluna):
    --
    -- v_rec := EXISTS (
    --   SELECT 1 FROM public.recebimento_itens ri
    --   WHERE ri.material_id = r.material_id
    -- );
    --
    -- v_doc := EXISTS (
    --   SELECT 1 FROM public.documento_itens di
    --   WHERE di.material_id = r.material_id
    -- );
    --
    -- v_atd := EXISTS (
    --   SELECT 1 FROM public.atendimento_itens ai
    --   WHERE ai.material_id = r.material_id
    -- );

    v_items := v_items || jsonb_build_array(
      jsonb_build_object(
        'material_id', r.material_id,
        'codigo', r.codigo,
        'recebimentos', v_rec,
        'documentos', v_doc,
        'atendimento', v_atd
      )
    );
  END LOOP;

  RETURN jsonb_build_object('items', coalesce(v_items, '[]'::jsonb));
END;
$$;

COMMENT ON FUNCTION public.iso_pro_materiais_uso_nos_modulos(bigint[]) IS
  'I.S.O PRO: indica se materiais (ids) aparecem em recebimentos/documentacao/atendimento no Postgres.';

-- Ajustar papel conforme politica do projeto (authenticated / service_role).
GRANT EXECUTE ON FUNCTION public.iso_pro_materiais_uso_nos_modulos(bigint[]) TO authenticated;
