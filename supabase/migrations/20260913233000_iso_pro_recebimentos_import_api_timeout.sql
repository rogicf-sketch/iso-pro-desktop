-- Causa real do «continua a mesma coisa» no browser:
-- role authenticated (API PostgREST) tem statement_timeout=8s.
-- Testes via `supabase db query` usam postgres (2min) — por isso a NF gravava no SQL
-- e falhava no site (aviso vermelho = timeout de GRAVACAO traduzido como consulta).
--
-- 1) Sobe timeout da API para 60s (tecto do PostgREST na plataforma).
-- 2) Upsert de itens em lote (set-based) — NF ~100 itens deixa de fazer 100 INSERTs.
-- 3) Mantem SET statement_timeout na write SoT (hoist PostgREST 12.2+).

BEGIN;

ALTER ROLE authenticated SET statement_timeout = '60s';
NOTIFY pgrst, 'reload config';

CREATE OR REPLACE FUNCTION public.iso_pro_upsert_recebimentos_lote(
  p_tenant_id uuid,
  p_recebimentos jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '60s'
AS $$
DECLARE
  v_rec jsonb;
  v_rec_id text;
  v_recs int := 0;
  v_itens int := 0;
  v_data date;
  v_data_conf timestamptz;
  v_modo text;
  v_status text;
  v_item_ids text[];
  v_n int;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tenant_id em falta.');
  END IF;
  IF p_recebimentos IS NULL OR jsonb_typeof(p_recebimentos) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'p_recebimentos deve ser array JSON.');
  END IF;

  FOR v_rec IN SELECT value FROM jsonb_array_elements(p_recebimentos) LOOP
    v_rec_id := NULLIF(btrim(coalesce(v_rec ->> 'id', '')), '');
    IF v_rec_id IS NULL THEN
      CONTINUE;
    END IF;

    BEGIN
      v_data := NULLIF(btrim(coalesce(
        v_rec ->> 'dataRecebimento',
        v_rec ->> 'data',
        ''
      )), '')::date;
    EXCEPTION WHEN others THEN
      v_data := NULL;
    END;

    BEGIN
      v_data_conf := NULLIF(btrim(coalesce(
        v_rec ->> 'dataConferencia',
        v_rec ->> 'data_conferencia',
        ''
      )), '')::timestamptz;
    EXCEPTION WHEN others THEN
      v_data_conf := NULL;
    END;

    v_modo := coalesce(
      NULLIF(btrim(v_rec ->> 'modoRecebimento'), ''),
      NULLIF(btrim(v_rec ->> 'modo_recebimento'), ''),
      'direto'
    );
    v_status := public.iso_pro_recebimento_status_from_snapshot(
      v_modo,
      coalesce(v_rec ->> 'statusConferencia', v_rec ->> 'status_conferencia'),
      v_rec ->> 'status'
    );

    INSERT INTO public.iso_pro_recebimentos (
      tenant_id, id, fornecedor, data_recebimento, nota_fiscal, romaneio,
      conferente, modo_recebimento, status, observacoes, data_conferencia, updated_at
    ) VALUES (
      p_tenant_id,
      v_rec_id,
      coalesce(v_rec ->> 'fornecedor', v_rec ->> 'fornecedorNome', ''),
      v_data,
      coalesce(v_rec ->> 'notaFiscal', v_rec ->> 'nota', ''),
      coalesce(v_rec ->> 'romaneio', ''),
      coalesce(v_rec ->> 'conferente', v_rec ->> 'conferenteNome', ''),
      v_modo,
      v_status,
      coalesce(v_rec ->> 'observacoes', ''),
      v_data_conf,
      now()
    )
    ON CONFLICT (tenant_id, id) DO UPDATE SET
      fornecedor = EXCLUDED.fornecedor,
      data_recebimento = EXCLUDED.data_recebimento,
      nota_fiscal = EXCLUDED.nota_fiscal,
      romaneio = EXCLUDED.romaneio,
      conferente = EXCLUDED.conferente,
      modo_recebimento = EXCLUDED.modo_recebimento,
      status = EXCLUDED.status,
      observacoes = EXCLUDED.observacoes,
      data_conferencia = EXCLUDED.data_conferencia,
      updated_at = now();

    v_recs := v_recs + 1;
    v_item_ids := ARRAY[]::text[];

    IF jsonb_typeof(v_rec -> 'itens') = 'array' AND jsonb_array_length(v_rec -> 'itens') > 0 THEN
      WITH raw AS (
        SELECT
          ordinality AS ord,
          value AS item
        FROM jsonb_array_elements(v_rec -> 'itens') WITH ORDINALITY AS t(value, ordinality)
      ),
      norm AS (
        SELECT
          coalesce(
            NULLIF(btrim(coalesce(item ->> 'id', '')), ''),
            v_rec_id || ':' || coalesce(
              NULLIF(btrim(coalesce(item ->> 'codigoMaterial', item ->> 'codigo', '')), ''),
              'x'
            ) || ':' || ord::text
          ) AS id,
          coalesce(item ->> 'codigoMaterial', item ->> 'codigo') AS codigo,
          coalesce(item ->> 'descricaoMaterial', item ->> 'descricao') AS descricao,
          coalesce(NULLIF(btrim(item ->> 'unidade'), ''), 'UN') AS unidade,
          coalesce(item ->> 'disciplina', '') AS disciplina,
          coalesce(item ->> 'localizacao', '') AS localizacao,
          coalesce(
            NULLIF(item ->> 'quantidadeRecebida', '')::numeric,
            NULLIF(item ->> 'quantidade', '')::numeric,
            0
          ) AS quantidade,
          coalesce(NULLIF(item ->> 'quantidadeConferida', '')::numeric, 0) AS quantidade_conferida,
          coalesce(NULLIF(item ->> 'pesoUnitario', '')::numeric, 0) AS peso_unitario,
          coalesce(NULLIF(item ->> 'pesoTotal', '')::numeric, 0) AS peso_total,
          coalesce(item ->> 'certificado', '') AS certificado,
          coalesce(item ->> 'observacaoItem', '') AS observacao_item
        FROM raw
      ),
      upserted AS (
        INSERT INTO public.iso_pro_recebimento_itens (
          tenant_id, recebimento_id, id, codigo, descricao, unidade, disciplina,
          localizacao, quantidade, quantidade_conferida, peso_unitario, peso_total,
          certificado, observacao_item, updated_at
        )
        SELECT
          p_tenant_id,
          v_rec_id,
          n.id,
          n.codigo,
          n.descricao,
          n.unidade,
          n.disciplina,
          n.localizacao,
          n.quantidade,
          n.quantidade_conferida,
          n.peso_unitario,
          n.peso_total,
          n.certificado,
          n.observacao_item,
          now()
        FROM norm n
        ON CONFLICT (tenant_id, id) DO UPDATE SET
          recebimento_id = EXCLUDED.recebimento_id,
          codigo = EXCLUDED.codigo,
          descricao = EXCLUDED.descricao,
          unidade = EXCLUDED.unidade,
          disciplina = EXCLUDED.disciplina,
          localizacao = EXCLUDED.localizacao,
          quantidade = EXCLUDED.quantidade,
          quantidade_conferida = EXCLUDED.quantidade_conferida,
          peso_unitario = EXCLUDED.peso_unitario,
          peso_total = EXCLUDED.peso_total,
          certificado = EXCLUDED.certificado,
          observacao_item = EXCLUDED.observacao_item,
          updated_at = now()
        RETURNING id
      )
      SELECT coalesce(array_agg(id), ARRAY[]::text[]), count(*)::int
      INTO v_item_ids, v_n
      FROM upserted;

      v_itens := v_itens + coalesce(v_n, 0);

      DELETE FROM public.iso_pro_recebimento_itens i
      WHERE i.tenant_id = p_tenant_id
        AND i.recebimento_id = v_rec_id
        AND NOT (i.id = ANY (v_item_ids));
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'recebimentos', v_recs, 'itens', v_itens);
END;
$$;

COMMENT ON FUNCTION public.iso_pro_upsert_recebimentos_lote(uuid, jsonb) IS
  'Upsert recebimentos+itens (itens set-based). statement_timeout 60s.';

-- Garante hoist na write SoT (ja existia 180s; reafirma grants).
ALTER FUNCTION public.iso_pro_write_recebimentos_sot(uuid, timestamptz, jsonb, text[], jsonb)
  SET statement_timeout = '180s';

COMMIT;
