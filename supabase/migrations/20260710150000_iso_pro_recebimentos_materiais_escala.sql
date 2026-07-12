-- P1 escala: recebimentos em tabelas + lista paginada de materiais no servidor.
-- Dual-write: PC/web grava snapshot + tabelas; lista/leitura preferem tabelas.

BEGIN;

-- ========== RECEBIMENTOS ==========
CREATE TABLE IF NOT EXISTS public.iso_pro_recebimentos (
  tenant_id uuid NOT NULL REFERENCES public.iso_pro_tenants(id) ON DELETE CASCADE,
  id text NOT NULL,
  fornecedor text NOT NULL DEFAULT '',
  data_recebimento date,
  nota_fiscal text NOT NULL DEFAULT '',
  romaneio text NOT NULL DEFAULT '',
  conferente text NOT NULL DEFAULT '',
  modo_recebimento text NOT NULL DEFAULT 'direto',
  status text NOT NULL DEFAULT 'aguardando_conferencia',
  observacoes text,
  data_conferencia timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS public.iso_pro_recebimento_itens (
  tenant_id uuid NOT NULL REFERENCES public.iso_pro_tenants(id) ON DELETE CASCADE,
  recebimento_id text NOT NULL,
  id text NOT NULL,
  codigo text,
  descricao text,
  unidade text,
  disciplina text,
  localizacao text,
  quantidade numeric NOT NULL DEFAULT 0,
  quantidade_conferida numeric NOT NULL DEFAULT 0,
  peso_unitario numeric NOT NULL DEFAULT 0,
  peso_total numeric NOT NULL DEFAULT 0,
  certificado text,
  observacao_item text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT iso_pro_recebimento_itens_fk
    FOREIGN KEY (tenant_id, recebimento_id)
    REFERENCES public.iso_pro_recebimentos(tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS iso_pro_recebimentos_tenant_data_idx
  ON public.iso_pro_recebimentos (tenant_id, data_recebimento DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS iso_pro_recebimentos_tenant_status_idx
  ON public.iso_pro_recebimentos (tenant_id, lower(btrim(status)));

CREATE INDEX IF NOT EXISTS iso_pro_recebimentos_tenant_modo_idx
  ON public.iso_pro_recebimentos (tenant_id, lower(btrim(modo_recebimento)));

CREATE INDEX IF NOT EXISTS iso_pro_recebimentos_tenant_nota_idx
  ON public.iso_pro_recebimentos (tenant_id, lower(btrim(nota_fiscal)));

CREATE INDEX IF NOT EXISTS iso_pro_recebimento_itens_tenant_rec_idx
  ON public.iso_pro_recebimento_itens (tenant_id, recebimento_id);

CREATE INDEX IF NOT EXISTS iso_pro_recebimento_itens_tenant_codigo_idx
  ON public.iso_pro_recebimento_itens (tenant_id, lower(btrim(codigo)));

ALTER TABLE public.iso_pro_recebimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iso_pro_recebimento_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS iso_pro_recebimentos_anon_rw ON public.iso_pro_recebimentos;
CREATE POLICY iso_pro_recebimentos_anon_rw
  ON public.iso_pro_recebimentos
  FOR ALL TO anon, authenticated
  USING (tenant_id IS NOT NULL)
  WITH CHECK (tenant_id IS NOT NULL);

DROP POLICY IF EXISTS iso_pro_recebimentos_service ON public.iso_pro_recebimentos;
CREATE POLICY iso_pro_recebimentos_service
  ON public.iso_pro_recebimentos
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS iso_pro_recebimento_itens_anon_rw ON public.iso_pro_recebimento_itens;
CREATE POLICY iso_pro_recebimento_itens_anon_rw
  ON public.iso_pro_recebimento_itens
  FOR ALL TO anon, authenticated
  USING (tenant_id IS NOT NULL)
  WITH CHECK (tenant_id IS NOT NULL);

DROP POLICY IF EXISTS iso_pro_recebimento_itens_service ON public.iso_pro_recebimento_itens;
CREATE POLICY iso_pro_recebimento_itens_service
  ON public.iso_pro_recebimento_itens
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.iso_pro_recebimentos_tabelas_ativas(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.iso_pro_recebimentos r
    WHERE r.tenant_id = p_tenant_id
    LIMIT 1
  );
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_recebimento_status_from_snapshot(
  p_modo text,
  p_status_conf text,
  p_status_app text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_app text;
  v_conf text;
  v_modo text;
BEGIN
  v_app := lower(btrim(coalesce(p_status_app, '')));
  IF v_app IN (
    'rascunho', 'aguardando_conferencia', 'conferido',
    'parcialmente_conferido', 'divergente', 'cancelado'
  ) THEN
    RETURN v_app;
  END IF;

  v_conf := lower(btrim(coalesce(p_status_conf, '')));
  v_modo := lower(btrim(coalesce(p_modo, 'direto')));
  IF v_conf = 'conferido' THEN
    RETURN 'conferido';
  END IF;
  IF v_modo = 'aguardando_conferencia' THEN
    RETURN 'aguardando_conferencia';
  END IF;
  RETURN 'conferido';
END;
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_recebimento_row_to_jsonb(
  p_tenant_id uuid,
  p_rec_id text,
  p_incluir_itens boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_row public.iso_pro_recebimentos%ROWTYPE;
  v_itens jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_row
  FROM public.iso_pro_recebimentos r
  WHERE r.tenant_id = p_tenant_id AND r.id = p_rec_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF p_incluir_itens THEN
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'codigoMaterial', coalesce(i.codigo, ''),
          'descricaoMaterial', coalesce(i.descricao, ''),
          'unidade', coalesce(i.unidade, 'UN'),
          'disciplina', coalesce(i.disciplina, ''),
          'localizacao', coalesce(i.localizacao, ''),
          'quantidadeRecebida', i.quantidade,
          'quantidadeConferida', i.quantidade_conferida,
          'pesoUnitario', i.peso_unitario,
          'pesoTotal', i.peso_total,
          'certificado', coalesce(i.certificado, ''),
          'observacaoItem', coalesce(i.observacao_item, '')
        )
        ORDER BY lower(btrim(coalesce(i.codigo, ''))), i.id
      ),
      '[]'::jsonb
    )
    INTO v_itens
    FROM public.iso_pro_recebimento_itens i
    WHERE i.tenant_id = p_tenant_id AND i.recebimento_id = p_rec_id;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'fornecedor', v_row.fornecedor,
    'dataRecebimento', to_char(v_row.data_recebimento, 'YYYY-MM-DD'),
    'notaFiscal', v_row.nota_fiscal,
    'romaneio', v_row.romaneio,
    'conferente', v_row.conferente,
    'modoRecebimento', v_row.modo_recebimento,
    'status', v_row.status,
    'observacoes', coalesce(v_row.observacoes, ''),
    'dataConferencia', CASE
      WHEN v_row.data_conferencia IS NULL THEN NULL
      ELSE to_char(v_row.data_conferencia AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    END,
    'itens', v_itens
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_upsert_recebimentos_lote(
  p_tenant_id uuid,
  p_recebimentos jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_rec jsonb;
  v_item jsonb;
  v_rec_id text;
  v_item_id text;
  v_recs int := 0;
  v_itens int := 0;
  v_data date;
  v_data_conf timestamptz;
  v_modo text;
  v_status text;
  v_item_ids text[];
  v_idx int;
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
    v_idx := 0;

    IF jsonb_typeof(v_rec -> 'itens') = 'array' THEN
      FOR v_item IN SELECT value FROM jsonb_array_elements(v_rec -> 'itens') LOOP
        v_idx := v_idx + 1;
        v_item_id := NULLIF(btrim(coalesce(v_item ->> 'id', '')), '');
        IF v_item_id IS NULL THEN
          v_item_id := v_rec_id || ':' || coalesce(
            v_item ->> 'codigoMaterial',
            v_item ->> 'codigo',
            'x'
          ) || ':' || v_idx::text;
        END IF;
        v_item_ids := array_append(v_item_ids, v_item_id);

        INSERT INTO public.iso_pro_recebimento_itens (
          tenant_id, recebimento_id, id, codigo, descricao, unidade, disciplina,
          localizacao, quantidade, quantidade_conferida, peso_unitario, peso_total,
          certificado, observacao_item, updated_at
        ) VALUES (
          p_tenant_id,
          v_rec_id,
          v_item_id,
          coalesce(v_item ->> 'codigoMaterial', v_item ->> 'codigo'),
          coalesce(v_item ->> 'descricaoMaterial', v_item ->> 'descricao'),
          coalesce(v_item ->> 'unidade', 'UN'),
          coalesce(v_item ->> 'disciplina', ''),
          coalesce(v_item ->> 'localizacao', ''),
          coalesce(NULLIF(v_item ->> 'quantidadeRecebida', '')::numeric,
                   NULLIF(v_item ->> 'quantidade', '')::numeric, 0),
          coalesce(NULLIF(v_item ->> 'quantidadeConferida', '')::numeric, 0),
          coalesce(NULLIF(v_item ->> 'pesoUnitario', '')::numeric, 0),
          coalesce(NULLIF(v_item ->> 'pesoTotal', '')::numeric, 0),
          coalesce(v_item ->> 'certificado', ''),
          coalesce(v_item ->> 'observacaoItem', ''),
          now()
        )
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
          updated_at = now();
        v_itens := v_itens + 1;
      END LOOP;

      DELETE FROM public.iso_pro_recebimento_itens i
      WHERE i.tenant_id = p_tenant_id
        AND i.recebimento_id = v_rec_id
        AND NOT (i.id = ANY (v_item_ids));
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'recebimentos', v_recs, 'itens', v_itens);
END;
$$;

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
  v_result jsonb;
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

  DELETE FROM public.iso_pro_recebimento_itens WHERE tenant_id = p_tenant_id;
  DELETE FROM public.iso_pro_recebimentos WHERE tenant_id = p_tenant_id;

  v_result := public.iso_pro_upsert_recebimentos_lote(p_tenant_id, v_arr);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_delete_recebimentos(
  p_tenant_id uuid,
  p_ids text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_n int := 0;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tenant_id em falta.');
  END IF;
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'deleted', 0);
  END IF;

  DELETE FROM public.iso_pro_recebimentos r
  WHERE r.tenant_id = p_tenant_id AND r.id = ANY (p_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'deleted', v_n);
END;
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_list_recebimentos_page(
  p_tenant_id uuid,
  p_busca text DEFAULT NULL,
  p_offset int DEFAULT 0,
  p_limit int DEFAULT 50,
  p_status text DEFAULT NULL,
  p_modo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_q text;
  v_off int;
  v_lim int;
  v_status text;
  v_modo text;
  v_total int := 0;
  v_rows jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  v_q := lower(btrim(coalesce(p_busca, '')));
  v_off := GREATEST(coalesce(p_offset, 0), 0);
  v_lim := LEAST(GREATEST(coalesce(p_limit, 50), 1), 200);
  v_status := lower(btrim(coalesce(p_status, '')));
  v_modo := lower(btrim(coalesce(p_modo, '')));
  IF v_status IN ('', 'todos', 'all') THEN v_status := NULL; END IF;
  IF v_modo IN ('', 'todos', 'all') THEN v_modo := NULL; END IF;

  IF NOT public.iso_pro_recebimentos_tabelas_ativas(p_tenant_id) THEN
    RETURN jsonb_build_object(
      'recebimentos', '[]'::jsonb,
      'total', 0,
      'offset', v_off,
      'limit', v_lim,
      '_source', 'snapshot',
      '_hint', 'Execute iso_pro_sync_recebimentos_from_snapshot para activar tabelas.'
    );
  END IF;

  WITH base AS (
    SELECT
      r.id,
      r.fornecedor,
      r.data_recebimento,
      r.nota_fiscal,
      r.romaneio,
      r.conferente,
      r.modo_recebimento,
      r.status,
      r.data_conferencia,
      coalesce(count(i.*), 0)::int AS total_itens,
      coalesce(sum(i.quantidade), 0) AS qtd_recebida,
      coalesce(sum(i.quantidade_conferida), 0) AS qtd_conferida,
      coalesce(sum(
        CASE
          WHEN coalesce(i.quantidade, 0) > 0
            AND coalesce(i.quantidade_conferida, 0) < coalesce(i.quantidade, 0)
          THEN 1 ELSE 0
        END
      ), 0)::int AS divergentes
    FROM public.iso_pro_recebimentos r
    LEFT JOIN public.iso_pro_recebimento_itens i
      ON i.tenant_id = r.tenant_id AND i.recebimento_id = r.id
    WHERE r.tenant_id = p_tenant_id
      AND (v_status IS NULL OR lower(btrim(r.status)) = v_status)
      AND (v_modo IS NULL OR lower(btrim(r.modo_recebimento)) = v_modo)
      AND (
        v_q = ''
        OR lower(btrim(r.fornecedor)) LIKE '%' || v_q || '%'
        OR lower(btrim(r.nota_fiscal)) LIKE '%' || v_q || '%'
        OR lower(btrim(r.romaneio)) LIKE '%' || v_q || '%'
        OR lower(btrim(r.conferente)) LIKE '%' || v_q || '%'
        OR EXISTS (
          SELECT 1 FROM public.iso_pro_recebimento_itens ix
          WHERE ix.tenant_id = r.tenant_id
            AND ix.recebimento_id = r.id
            AND (
              lower(btrim(coalesce(ix.codigo, ''))) LIKE '%' || v_q || '%'
              OR lower(btrim(coalesce(ix.descricao, ''))) LIKE '%' || v_q || '%'
            )
        )
      )
    GROUP BY r.id, r.fornecedor, r.data_recebimento, r.nota_fiscal, r.romaneio,
             r.conferente, r.modo_recebimento, r.status, r.data_conferencia
  ),
  counted AS (SELECT count(*)::int AS c FROM base),
  page AS (
    SELECT * FROM base
    ORDER BY data_recebimento DESC NULLS LAST, lower(btrim(nota_fiscal)), id
    OFFSET v_off LIMIT v_lim
  )
  SELECT
    (SELECT c FROM counted),
    coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'fornecedor', p.fornecedor,
            'dataRecebimento', to_char(p.data_recebimento, 'YYYY-MM-DD'),
            'notaFiscal', p.nota_fiscal,
            'romaneio', p.romaneio,
            'conferente', p.conferente,
            'modoRecebimento', p.modo_recebimento,
            'status', p.status,
            'dataConferencia', CASE
              WHEN p.data_conferencia IS NULL THEN NULL
              ELSE to_char(p.data_conferencia AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
            END,
            'totalItens', p.total_itens,
            'quantidadeRecebidaTotal', p.qtd_recebida,
            'quantidadeConferidaTotal', p.qtd_conferida,
            'conferenciaItensDivergentes',
              CASE
                WHEN p.modo_recebimento = 'direto' AND p.data_conferencia IS NULL THEN 0
                ELSE p.divergentes
              END
          )
          ORDER BY p.data_recebimento DESC NULLS LAST, lower(btrim(p.nota_fiscal)), p.id
        )
        FROM page p
      ),
      '[]'::jsonb
    )
  INTO v_total, v_rows;

  RETURN jsonb_build_object(
    'recebimentos', coalesce(v_rows, '[]'::jsonb),
    'total', coalesce(v_total, 0),
    'offset', v_off,
    'limit', v_lim,
    '_source', 'tables'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_list_recebimentos_ids(
  p_tenant_id uuid,
  p_busca text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_modo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_q text;
  v_status text;
  v_modo text;
  v_ids jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;
  IF NOT public.iso_pro_recebimentos_tabelas_ativas(p_tenant_id) THEN
    RETURN jsonb_build_object('ids', '[]'::jsonb, '_source', 'snapshot');
  END IF;

  v_q := lower(btrim(coalesce(p_busca, '')));
  v_status := lower(btrim(coalesce(p_status, '')));
  v_modo := lower(btrim(coalesce(p_modo, '')));
  IF v_status IN ('', 'todos', 'all') THEN v_status := NULL; END IF;
  IF v_modo IN ('', 'todos', 'all') THEN v_modo := NULL; END IF;

  SELECT coalesce(jsonb_agg(r.id ORDER BY r.data_recebimento DESC NULLS LAST, r.id), '[]'::jsonb)
  INTO v_ids
  FROM public.iso_pro_recebimentos r
  WHERE r.tenant_id = p_tenant_id
    AND (v_status IS NULL OR lower(btrim(r.status)) = v_status)
    AND (v_modo IS NULL OR lower(btrim(r.modo_recebimento)) = v_modo)
    AND (
      v_q = ''
      OR lower(btrim(r.fornecedor)) LIKE '%' || v_q || '%'
      OR lower(btrim(r.nota_fiscal)) LIKE '%' || v_q || '%'
      OR lower(btrim(r.romaneio)) LIKE '%' || v_q || '%'
      OR lower(btrim(r.conferente)) LIKE '%' || v_q || '%'
    );

  RETURN jsonb_build_object('ids', coalesce(v_ids, '[]'::jsonb), '_source', 'tables');
END;
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_read_recebimento(
  p_tenant_id uuid,
  p_recebimento_id text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_doc jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;
  IF NOT public.iso_pro_recebimentos_tabelas_ativas(p_tenant_id) THEN
    RETURN jsonb_build_object('_source', 'snapshot', 'recebimento', NULL);
  END IF;
  v_doc := public.iso_pro_recebimento_row_to_jsonb(p_tenant_id, btrim(coalesce(p_recebimento_id, '')), true);
  RETURN jsonb_build_object('_source', 'tables', 'recebimento', v_doc);
END;
$$;

REVOKE ALL ON FUNCTION public.iso_pro_recebimentos_tabelas_ativas(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_recebimentos_tabelas_ativas(uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.iso_pro_upsert_recebimentos_lote(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_upsert_recebimentos_lote(uuid, jsonb) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.iso_pro_sync_recebimentos_from_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_sync_recebimentos_from_snapshot(uuid) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.iso_pro_delete_recebimentos(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_delete_recebimentos(uuid, text[]) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.iso_pro_list_recebimentos_page(uuid, text, int, int, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_list_recebimentos_page(uuid, text, int, int, text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.iso_pro_list_recebimentos_ids(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_list_recebimentos_ids(uuid, text, text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.iso_pro_read_recebimento(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_read_recebimento(uuid, text) TO anon, authenticated;

-- Sync inicial para todos os tenants com snapshot
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT s.tenant_id
    FROM public.iso_pro_snapshot s
    WHERE s.id = 'default' AND s.tenant_id IS NOT NULL
  LOOP
    PERFORM public.iso_pro_sync_recebimentos_from_snapshot(r.tenant_id);
  END LOOP;
END $$;

-- ========== MATERIAIS: lista paginada no servidor ==========
CREATE OR REPLACE FUNCTION public.iso_pro_list_materiais_page(
  p_tenant_id uuid,
  p_busca text DEFAULT NULL,
  p_offset int DEFAULT 0,
  p_limit int DEFAULT 50,
  p_disciplina text DEFAULT NULL,
  p_ativo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_q text;
  v_off int;
  v_lim int;
  v_disc text;
  v_ativo text;
  v_total int := 0;
  v_rows jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  v_q := lower(btrim(coalesce(p_busca, '')));
  v_off := GREATEST(coalesce(p_offset, 0), 0);
  v_lim := LEAST(GREATEST(coalesce(p_limit, 50), 1), 200);
  v_disc := NULLIF(btrim(coalesce(p_disciplina, '')), '');
  v_ativo := lower(btrim(coalesce(p_ativo, '')));
  IF v_ativo IN ('', 'todos', 'all') THEN v_ativo := NULL; END IF;

  WITH base AS (
    SELECT
      m.id,
      m.codigo,
      m.codigo_barras,
      m.descricao,
      m.diametro,
      m.disciplina,
      m.unidade,
      m.peso,
      m.estoque_minimo,
      coalesce(m.ativo, true) AS ativo
    FROM public.materiais m
    WHERE m.tenant_id = p_tenant_id
      AND (v_disc IS NULL OR btrim(coalesce(m.disciplina, '')) = v_disc)
      AND (
        v_ativo IS NULL
        OR (v_ativo IN ('ativos', 'ativo', 'true', '1') AND coalesce(m.ativo, true) = true)
        OR (v_ativo IN ('inativos', 'inativo', 'false', '0') AND coalesce(m.ativo, true) = false)
      )
      AND (
        v_q = ''
        OR lower(btrim(coalesce(m.codigo, ''))) LIKE '%' || v_q || '%'
        OR lower(btrim(coalesce(m.codigo_barras, ''))) LIKE '%' || v_q || '%'
        OR lower(btrim(coalesce(m.descricao, ''))) LIKE '%' || v_q || '%'
        OR lower(btrim(coalesce(m.disciplina, ''))) LIKE '%' || v_q || '%'
      )
  ),
  counted AS (SELECT count(*)::int AS c FROM base),
  page AS (
    SELECT * FROM base
    ORDER BY lower(btrim(codigo)), id
    OFFSET v_off LIMIT v_lim
  )
  SELECT
    (SELECT c FROM counted),
    coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'codigo', p.codigo,
            'codigoBarras', coalesce(p.codigo_barras, ''),
            'descricao', coalesce(p.descricao, ''),
            'diametro', coalesce(p.diametro, ''),
            'disciplina', coalesce(p.disciplina, ''),
            'unidade', coalesce(p.unidade, 'UN'),
            'peso', coalesce(p.peso, 0),
            'estoqueMinimo', coalesce(p.estoque_minimo, 0),
            'ativo', p.ativo,
            'saldoAtual', 0,
            'observacao', ''
          )
          ORDER BY lower(btrim(p.codigo)), p.id
        )
        FROM page p
      ),
      '[]'::jsonb
    )
  INTO v_total, v_rows;

  RETURN jsonb_build_object(
    'materiais', coalesce(v_rows, '[]'::jsonb),
    'total', coalesce(v_total, 0),
    'offset', v_off,
    'limit', v_lim,
    '_source', 'tables'
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_list_materiais_page(uuid, text, int, int, text, text) IS
  'Lista paginada de materiais com busca/disciplina/ativo no servidor.';

REVOKE ALL ON FUNCTION public.iso_pro_list_materiais_page(uuid, text, int, int, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_list_materiais_page(uuid, text, int, int, text, text) TO anon, authenticated;

-- Contagens de recebimentos passam a preferir tabelas quando activas
CREATE OR REPLACE FUNCTION public.iso_pro_operacao_contagens(
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
  v_docs_pendentes int := 0;
  v_docs_parciais int := 0;
  v_docs_total int := 0;
  v_rec_aguardando int := 0;
  v_rec_conferencia int := 0;
  v_rec_divergentes int := 0;
  v_inv_abertos int := 0;
  v_inv_divergencia int := 0;
  v_inv_dias_mais_antigo int := 0;
  v_rir_abertos int := 0;
  v_rnc_abertas int := 0;
  v_rir_reprovado_sem_rnc int := 0;
  v_source_docs text := 'snapshot';
  v_source_rec text := 'snapshot';
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  SELECT s.payload INTO v_payload
  FROM public.iso_pro_snapshot AS s
  WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;

  IF v_payload IS NULL THEN
    v_payload := '{}'::jsonb;
  END IF;

  IF public.iso_pro_documentos_tabelas_ativas(p_tenant_id) THEN
    v_source_docs := 'tables';
    WITH agg AS (
      SELECT
        d.id,
        lower(btrim(coalesce(d.status, ''))) AS st,
        coalesce(sum(i.quantidade), 0) AS proj,
        coalesce(sum(i.quantidade_atendida), 0) AS atd
      FROM public.iso_pro_documentos_planejamento d
      LEFT JOIN public.iso_pro_documento_itens_planejamento i
        ON i.tenant_id = d.tenant_id AND i.documento_id = d.id
      WHERE d.tenant_id = p_tenant_id
      GROUP BY d.id, d.status
    )
    SELECT
      count(*)::int,
      count(*) FILTER (
        WHERE st <> 'cancelado'
          AND NOT (proj > 0 AND atd >= proj - 1e-9)
          AND atd <= 1e-9
      )::int,
      count(*) FILTER (
        WHERE st <> 'cancelado'
          AND atd > 1e-9
          AND NOT (proj > 0 AND atd >= proj - 1e-9)
      )::int
    INTO v_docs_total, v_docs_pendentes, v_docs_parciais
    FROM agg;
  ELSE
    SELECT
      count(*)::int,
      count(*) FILTER (
        WHERE lower(btrim(coalesce(doc->>'status', ''))) IN ('pendente', '')
          OR (doc->>'status') IS NULL
      )::int,
      count(*) FILTER (
        WHERE lower(btrim(coalesce(doc->>'status', ''))) = 'parcial'
      )::int
    INTO v_docs_total, v_docs_pendentes, v_docs_parciais
    FROM jsonb_array_elements(coalesce(v_payload->'documentos', '[]'::jsonb)) AS doc
    WHERE lower(btrim(coalesce(doc->>'status', ''))) <> 'cancelado';
  END IF;

  IF public.iso_pro_recebimentos_tabelas_ativas(p_tenant_id) THEN
    v_source_rec := 'tables';
    SELECT
      count(*) FILTER (WHERE lower(btrim(status)) = 'aguardando_conferencia')::int,
      count(*) FILTER (
        WHERE lower(btrim(modo_recebimento)) = 'aguardando_conferencia'
          AND lower(btrim(status)) IN (
            'aguardando_conferencia', 'parcialmente_conferido', 'divergente'
          )
      )::int,
      count(*) FILTER (
        WHERE lower(btrim(status)) = 'divergente'
      )::int
    INTO v_rec_aguardando, v_rec_conferencia, v_rec_divergentes
    FROM public.iso_pro_recebimentos
    WHERE tenant_id = p_tenant_id
      AND lower(btrim(status)) <> 'cancelado';
  ELSE
    SELECT
      count(*) FILTER (
        WHERE lower(btrim(coalesce(r->>'status', ''))) = 'aguardando_conferencia'
      )::int,
      count(*) FILTER (
        WHERE lower(btrim(coalesce(r->>'modoRecebimento', coalesce(r->>'modo_recebimento', '')))) = 'aguardando_conferencia'
          AND lower(btrim(coalesce(r->>'status', ''))) IN (
            'aguardando_conferencia', 'parcialmente_conferido', 'divergente'
          )
      )::int,
      count(*) FILTER (
        WHERE lower(btrim(coalesce(r->>'status', ''))) = 'divergente'
          OR coalesce((r->>'conferenciaItensDivergentes')::numeric, 0) > 0
      )::int
    INTO v_rec_aguardando, v_rec_conferencia, v_rec_divergentes
    FROM jsonb_array_elements(coalesce(v_payload->'recebimentos', '[]'::jsonb)) AS r
    WHERE lower(btrim(coalesce(r->>'status', ''))) <> 'cancelado';
  END IF;

  SELECT
    count(*) FILTER (
      WHERE lower(btrim(coalesce(i->>'status', ''))) = 'aberto'
    )::int,
    count(*) FILTER (
      WHERE coalesce((i->>'divergencias')::numeric, 0) > 0
        AND lower(btrim(coalesce(i->>'status', ''))) <> 'cancelado'
    )::int,
    coalesce(
      max(
        CASE
          WHEN lower(btrim(coalesce(i->>'status', ''))) = 'aberto'
            AND nullif(btrim(coalesce(i->>'dataInventario', i->>'data', '')), '') IS NOT NULL
          THEN GREATEST(
            0,
            (CURRENT_DATE - nullif(btrim(coalesce(i->>'dataInventario', i->>'data', '')), '')::date)
          )
          ELSE NULL
        END
      ),
      0
    )::int
  INTO v_inv_abertos, v_inv_divergencia, v_inv_dias_mais_antigo
  FROM jsonb_array_elements(coalesce(v_payload->'inventarios', '[]'::jsonb)) AS i;

  SELECT count(*)::int INTO v_rir_abertos
  FROM jsonb_array_elements(coalesce(v_payload->'rir', '[]'::jsonb)) AS r
  WHERE lower(btrim(coalesce(r->>'status', ''))) NOT IN ('tratado', 'cancelado');

  SELECT count(*)::int INTO v_rnc_abertas
  FROM jsonb_array_elements(coalesce(v_payload->'rnc', '[]'::jsonb)) AS r
  WHERE lower(btrim(coalesce(r->>'status', ''))) NOT IN ('concluido', 'cancelado');

  WITH rir_rep AS (
    SELECT
      btrim(coalesce(r->>'recebimentoId', r->>'recebimento_id', '')) AS rid
    FROM jsonb_array_elements(coalesce(v_payload->'rir', '[]'::jsonb)) AS r
    WHERE lower(btrim(coalesce(r->>'laudo', ''))) = 'reprovado'
      AND lower(btrim(coalesce(r->>'status', ''))) NOT IN ('tratado', 'cancelado')
      AND btrim(coalesce(r->>'recebimentoId', r->>'recebimento_id', '')) <> ''
  ),
  rnc_ativa AS (
    SELECT DISTINCT btrim(coalesce(n->>'recebimentoId', n->>'recebimento_id', '')) AS rid
    FROM jsonb_array_elements(coalesce(v_payload->'rnc', '[]'::jsonb)) AS n
    WHERE lower(btrim(coalesce(n->>'status', ''))) <> 'cancelado'
      AND btrim(coalesce(n->>'recebimentoId', n->>'recebimento_id', '')) <> ''
  )
  SELECT count(*)::int INTO v_rir_reprovado_sem_rnc
  FROM rir_rep rr
  WHERE NOT EXISTS (SELECT 1 FROM rnc_ativa ra WHERE ra.rid = rr.rid);

  RETURN jsonb_build_object(
    'docsPendentes', v_docs_pendentes + v_docs_parciais,
    'docsStatusPendente', v_docs_pendentes,
    'docsStatusParcial', v_docs_parciais,
    'docsTotal', v_docs_total,
    'recebimentosAguardando', v_rec_aguardando,
    'conferenciaPendente', v_rec_conferencia,
    'recebimentosDivergentes', v_rec_divergentes,
    'inventariosAbertos', v_inv_abertos,
    'inventariosComDivergencia', v_inv_divergencia,
    'inventarioDiasMaisAntigo', v_inv_dias_mais_antigo,
    'rirAbertos', v_rir_abertos,
    'rncAbertas', v_rnc_abertas,
    'rirReprovadoSemRnc', v_rir_reprovado_sem_rnc,
    '_sourceDocs', v_source_docs,
    '_sourceRecebimentos', v_source_rec
  );
END;
$$;

COMMIT;
