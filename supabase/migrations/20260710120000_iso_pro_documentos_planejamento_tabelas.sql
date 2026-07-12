-- Fase B: desenhos de planejamento em tabelas dedicadas (escala 11k+).
-- Mantém fallback para snapshot JSON enquanto as tabelas estiverem vazias.
-- Dual-write: PC/web grava snapshot + tabelas; RPCs preferem tabelas.

BEGIN;

-- ---------- Tabelas ----------
CREATE TABLE IF NOT EXISTS public.iso_pro_documentos_planejamento (
  tenant_id uuid NOT NULL REFERENCES public.iso_pro_tenants(id) ON DELETE CASCADE,
  id text NOT NULL,
  numero text NOT NULL DEFAULT '',
  revisao text NOT NULL DEFAULT 'A',
  data_documento date,
  descricao text,
  responsavel text,
  status text,
  observacao text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS public.iso_pro_documento_itens_planejamento (
  tenant_id uuid NOT NULL REFERENCES public.iso_pro_tenants(id) ON DELETE CASCADE,
  documento_id text NOT NULL,
  id text NOT NULL,
  codigo text,
  descricao text,
  unidade text,
  quantidade numeric NOT NULL DEFAULT 0,
  quantidade_atendida numeric NOT NULL DEFAULT 0,
  localizacao text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT iso_pro_documento_itens_doc_fk
    FOREIGN KEY (tenant_id, documento_id)
    REFERENCES public.iso_pro_documentos_planejamento(tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS iso_pro_documentos_planejamento_tenant_numero_idx
  ON public.iso_pro_documentos_planejamento (tenant_id, lower(btrim(numero)));

CREATE INDEX IF NOT EXISTS iso_pro_documento_itens_tenant_codigo_idx
  ON public.iso_pro_documento_itens_planejamento (tenant_id, lower(btrim(codigo)));

CREATE INDEX IF NOT EXISTS iso_pro_documento_itens_tenant_doc_idx
  ON public.iso_pro_documento_itens_planejamento (tenant_id, documento_id);

ALTER TABLE public.iso_pro_documentos_planejamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iso_pro_documento_itens_planejamento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS iso_pro_documentos_planejamento_anon_rw ON public.iso_pro_documentos_planejamento;
CREATE POLICY iso_pro_documentos_planejamento_anon_rw
  ON public.iso_pro_documentos_planejamento
  FOR ALL TO anon, authenticated
  USING (tenant_id IS NOT NULL)
  WITH CHECK (tenant_id IS NOT NULL);

DROP POLICY IF EXISTS iso_pro_documentos_planejamento_service ON public.iso_pro_documentos_planejamento;
CREATE POLICY iso_pro_documentos_planejamento_service
  ON public.iso_pro_documentos_planejamento
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS iso_pro_documento_itens_planejamento_anon_rw ON public.iso_pro_documento_itens_planejamento;
CREATE POLICY iso_pro_documento_itens_planejamento_anon_rw
  ON public.iso_pro_documento_itens_planejamento
  FOR ALL TO anon, authenticated
  USING (tenant_id IS NOT NULL)
  WITH CHECK (tenant_id IS NOT NULL);

DROP POLICY IF EXISTS iso_pro_documento_itens_planejamento_service ON public.iso_pro_documento_itens_planejamento;
CREATE POLICY iso_pro_documento_itens_planejamento_service
  ON public.iso_pro_documento_itens_planejamento
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------- Helpers ----------
CREATE OR REPLACE FUNCTION public.iso_pro_documentos_tabelas_ativas(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.iso_pro_documentos_planejamento d
    WHERE d.tenant_id = p_tenant_id
    LIMIT 1
  );
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_documento_row_to_jsonb(
  p_tenant_id uuid,
  p_doc_id text,
  p_incluir_itens boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_doc record;
  v_itens jsonb := '[]'::jsonb;
BEGIN
  SELECT *
  INTO v_doc
  FROM public.iso_pro_documentos_planejamento d
  WHERE d.tenant_id = p_tenant_id AND d.id = p_doc_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF p_incluir_itens THEN
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'codigo', i.codigo,
          'descricao', i.descricao,
          'unidade', i.unidade,
          'quantidade', i.quantidade,
          'quantidadeAtendida', i.quantidade_atendida,
          'localizacao', coalesce(i.localizacao, '')
        )
        ORDER BY i.codigo, i.id
      ),
      '[]'::jsonb
    )
    INTO v_itens
    FROM public.iso_pro_documento_itens_planejamento i
    WHERE i.tenant_id = p_tenant_id AND i.documento_id = p_doc_id;
  END IF;

  RETURN jsonb_build_object(
    'id', v_doc.id,
    'numero', v_doc.numero,
    'revisao', v_doc.revisao,
    'data', v_doc.data_documento,
    'descricao', v_doc.descricao,
    'responsavel', v_doc.responsavel,
    'status', v_doc.status,
    'itens', CASE WHEN p_incluir_itens THEN v_itens ELSE '[]'::jsonb END
  );
END;
$$;

-- ---------- Sync snapshot → tabelas ----------
CREATE OR REPLACE FUNCTION public.iso_pro_sync_documentos_planejamento_from_snapshot(
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
  v_doc jsonb;
  v_item jsonb;
  v_doc_id text;
  v_item_id text;
  v_docs int := 0;
  v_itens int := 0;
  v_data date;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tenant_id em falta.');
  END IF;

  SELECT s.payload INTO v_payload
  FROM public.iso_pro_snapshot AS s
  WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;

  IF v_payload IS NULL OR jsonb_typeof(v_payload -> 'documentos') <> 'array' THEN
    RETURN jsonb_build_object('ok', true, 'documentos', 0, 'itens', 0);
  END IF;

  -- Substitui o conjunto do tenant (fonte = snapshot neste sync).
  DELETE FROM public.iso_pro_documento_itens_planejamento WHERE tenant_id = p_tenant_id;
  DELETE FROM public.iso_pro_documentos_planejamento WHERE tenant_id = p_tenant_id;

  FOR v_doc IN SELECT value FROM jsonb_array_elements(v_payload -> 'documentos') LOOP
    v_doc_id := NULLIF(btrim(coalesce(v_doc ->> 'id', '')), '');
    IF v_doc_id IS NULL THEN
      CONTINUE;
    END IF;

    BEGIN
      v_data := NULLIF(btrim(coalesce(v_doc ->> 'data', '')), '')::date;
    EXCEPTION WHEN others THEN
      v_data := NULL;
    END;

    INSERT INTO public.iso_pro_documentos_planejamento (
      tenant_id, id, numero, revisao, data_documento, descricao, responsavel, status, observacao, updated_at
    ) VALUES (
      p_tenant_id,
      v_doc_id,
      coalesce(v_doc ->> 'numero', ''),
      coalesce(NULLIF(btrim(v_doc ->> 'revisao'), ''), 'A'),
      v_data,
      v_doc ->> 'descricao',
      v_doc ->> 'responsavel',
      v_doc ->> 'status',
      v_doc ->> 'observacao',
      now()
    );
    v_docs := v_docs + 1;

    IF jsonb_typeof(v_doc -> 'itens') = 'array' THEN
      FOR v_item IN SELECT value FROM jsonb_array_elements(v_doc -> 'itens') LOOP
        v_item_id := NULLIF(btrim(coalesce(v_item ->> 'id', '')), '');
        IF v_item_id IS NULL THEN
          v_item_id := v_doc_id || ':' || coalesce(v_item ->> 'codigo', 'x') || ':' || v_itens::text;
        END IF;
        INSERT INTO public.iso_pro_documento_itens_planejamento (
          tenant_id, documento_id, id, codigo, descricao, unidade,
          quantidade, quantidade_atendida, localizacao, updated_at
        ) VALUES (
          p_tenant_id,
          v_doc_id,
          v_item_id,
          v_item ->> 'codigo',
          v_item ->> 'descricao',
          v_item ->> 'unidade',
          coalesce(NULLIF(v_item ->> 'quantidade', '')::numeric, 0),
          coalesce(NULLIF(v_item ->> 'quantidadeAtendida', '')::numeric, 0),
          coalesce(v_item ->> 'localizacao', v_item ->> 'localização', ''),
          now()
        )
        ON CONFLICT (tenant_id, id) DO UPDATE SET
          documento_id = EXCLUDED.documento_id,
          codigo = EXCLUDED.codigo,
          descricao = EXCLUDED.descricao,
          unidade = EXCLUDED.unidade,
          quantidade = EXCLUDED.quantidade,
          quantidade_atendida = EXCLUDED.quantidade_atendida,
          localizacao = EXCLUDED.localizacao,
          updated_at = now();
        v_itens := v_itens + 1;
      END LOOP;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'documentos', v_docs, 'itens', v_itens);
END;
$$;

COMMENT ON FUNCTION public.iso_pro_sync_documentos_planejamento_from_snapshot(uuid) IS
  'Copia documentos[] do snapshot para tabelas dedicadas (substitui o conjunto do tenant).';

REVOKE ALL ON FUNCTION public.iso_pro_sync_documentos_planejamento_from_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_sync_documentos_planejamento_from_snapshot(uuid) TO anon, authenticated, service_role;

-- ---------- Upsert em lote (import / dual-write) ----------
CREATE OR REPLACE FUNCTION public.iso_pro_upsert_documentos_planejamento_lote(
  p_tenant_id uuid,
  p_documentos jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_doc jsonb;
  v_item jsonb;
  v_doc_id text;
  v_item_id text;
  v_docs int := 0;
  v_itens int := 0;
  v_data date;
  v_item_ids text[];
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tenant_id em falta.');
  END IF;
  IF p_documentos IS NULL OR jsonb_typeof(p_documentos) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'p_documentos deve ser array JSON.');
  END IF;

  FOR v_doc IN SELECT value FROM jsonb_array_elements(p_documentos) LOOP
    v_doc_id := NULLIF(btrim(coalesce(v_doc ->> 'id', '')), '');
    IF v_doc_id IS NULL THEN
      CONTINUE;
    END IF;

    BEGIN
      v_data := NULLIF(btrim(coalesce(v_doc ->> 'data', '')), '')::date;
    EXCEPTION WHEN others THEN
      v_data := NULL;
    END;

    INSERT INTO public.iso_pro_documentos_planejamento (
      tenant_id, id, numero, revisao, data_documento, descricao, responsavel, status, observacao, updated_at
    ) VALUES (
      p_tenant_id,
      v_doc_id,
      coalesce(v_doc ->> 'numero', ''),
      coalesce(NULLIF(btrim(v_doc ->> 'revisao'), ''), 'A'),
      v_data,
      v_doc ->> 'descricao',
      v_doc ->> 'responsavel',
      v_doc ->> 'status',
      v_doc ->> 'observacao',
      now()
    )
    ON CONFLICT (tenant_id, id) DO UPDATE SET
      numero = EXCLUDED.numero,
      revisao = EXCLUDED.revisao,
      data_documento = EXCLUDED.data_documento,
      descricao = EXCLUDED.descricao,
      responsavel = EXCLUDED.responsavel,
      status = COALESCE(EXCLUDED.status, public.iso_pro_documentos_planejamento.status),
      observacao = COALESCE(EXCLUDED.observacao, public.iso_pro_documentos_planejamento.observacao),
      updated_at = now();
    v_docs := v_docs + 1;

    v_item_ids := ARRAY[]::text[];
    IF jsonb_typeof(v_doc -> 'itens') = 'array' THEN
      FOR v_item IN SELECT value FROM jsonb_array_elements(v_doc -> 'itens') LOOP
        v_item_id := NULLIF(btrim(coalesce(v_item ->> 'id', '')), '');
        IF v_item_id IS NULL THEN
          v_item_id := v_doc_id || ':' || coalesce(v_item ->> 'codigo', 'x') || ':' || v_itens::text;
        END IF;
        v_item_ids := array_append(v_item_ids, v_item_id);

        INSERT INTO public.iso_pro_documento_itens_planejamento (
          tenant_id, documento_id, id, codigo, descricao, unidade,
          quantidade, quantidade_atendida, localizacao, updated_at
        ) VALUES (
          p_tenant_id,
          v_doc_id,
          v_item_id,
          v_item ->> 'codigo',
          v_item ->> 'descricao',
          v_item ->> 'unidade',
          coalesce(NULLIF(v_item ->> 'quantidade', '')::numeric, 0),
          coalesce(NULLIF(v_item ->> 'quantidadeAtendida', '')::numeric, 0),
          coalesce(v_item ->> 'localizacao', v_item ->> 'localização', ''),
          now()
        )
        ON CONFLICT (tenant_id, id) DO UPDATE SET
          documento_id = EXCLUDED.documento_id,
          codigo = EXCLUDED.codigo,
          descricao = EXCLUDED.descricao,
          unidade = EXCLUDED.unidade,
          quantidade = EXCLUDED.quantidade,
          quantidade_atendida = EXCLUDED.quantidade_atendida,
          localizacao = EXCLUDED.localizacao,
          updated_at = now();
        v_itens := v_itens + 1;
      END LOOP;
    END IF;

    -- Remove linhas órfãs deste documento que não vieram no lote.
    IF coalesce(array_length(v_item_ids, 1), 0) > 0 THEN
      DELETE FROM public.iso_pro_documento_itens_planejamento i
      WHERE i.tenant_id = p_tenant_id
        AND i.documento_id = v_doc_id
        AND NOT (i.id = ANY (v_item_ids));
    ELSE
      DELETE FROM public.iso_pro_documento_itens_planejamento i
      WHERE i.tenant_id = p_tenant_id AND i.documento_id = v_doc_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'documentos', v_docs, 'itens', v_itens);
END;
$$;

COMMENT ON FUNCTION public.iso_pro_upsert_documentos_planejamento_lote(uuid, jsonb) IS
  'Upsert de desenhos+itens em lote (import chunked / dual-write).';

REVOKE ALL ON FUNCTION public.iso_pro_upsert_documentos_planejamento_lote(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_upsert_documentos_planejamento_lote(uuid, jsonb) TO anon, authenticated, service_role;

-- Atualiza quantidade_atendida nas tabelas a partir de um doc JSON (pós-atendimento).
CREATE OR REPLACE FUNCTION public.iso_pro_aplicar_progresso_documento_tabelas(
  p_tenant_id uuid,
  p_documento jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_doc_id text;
  v_item jsonb;
  v_item_id text;
BEGIN
  IF p_tenant_id IS NULL OR p_documento IS NULL THEN
    RETURN;
  END IF;
  v_doc_id := NULLIF(btrim(coalesce(p_documento ->> 'id', '')), '');
  IF v_doc_id IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.iso_pro_documentos_planejamento
    WHERE tenant_id = p_tenant_id AND id = v_doc_id
  ) THEN
    -- Se tabelas ativas noutros docs, faz upsert deste também.
    PERFORM public.iso_pro_upsert_documentos_planejamento_lote(
      p_tenant_id,
      jsonb_build_array(p_documento)
    );
    RETURN;
  END IF;

  UPDATE public.iso_pro_documentos_planejamento
  SET updated_at = now()
  WHERE tenant_id = p_tenant_id AND id = v_doc_id;

  IF jsonb_typeof(p_documento -> 'itens') = 'array' THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_documento -> 'itens') LOOP
      v_item_id := NULLIF(btrim(coalesce(v_item ->> 'id', '')), '');
      IF v_item_id IS NULL THEN
        UPDATE public.iso_pro_documento_itens_planejamento
        SET
          quantidade_atendida = coalesce(NULLIF(v_item ->> 'quantidadeAtendida', '')::numeric, quantidade_atendida),
          quantidade = coalesce(NULLIF(v_item ->> 'quantidade', '')::numeric, quantidade),
          updated_at = now()
        WHERE tenant_id = p_tenant_id
          AND documento_id = v_doc_id
          AND lower(btrim(coalesce(codigo, ''))) = lower(btrim(coalesce(v_item ->> 'codigo', '')));
      ELSE
        UPDATE public.iso_pro_documento_itens_planejamento
        SET
          quantidade_atendida = coalesce(NULLIF(v_item ->> 'quantidadeAtendida', '')::numeric, quantidade_atendida),
          quantidade = coalesce(NULLIF(v_item ->> 'quantidade', '')::numeric, quantidade),
          updated_at = now()
        WHERE tenant_id = p_tenant_id AND id = v_item_id;
      END IF;
    END LOOP;
  END IF;
END;
$$;

-- ---------- RPCs de leitura (tabelas primeiro) ----------
CREATE OR REPLACE FUNCTION public.iso_pro_list_documentos_planejamento_resumo(
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
  v_updated timestamptz;
  v_docs jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  SELECT s.updated_at INTO v_updated
  FROM public.iso_pro_snapshot AS s
  WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;

  IF public.iso_pro_documentos_tabelas_ativas(p_tenant_id) THEN
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', d.id,
          'numero', d.numero,
          'revisao', d.revisao,
          'descricao', d.descricao,
          'responsavel', d.responsavel,
          'status', d.status,
          'itens', '[]'::jsonb
        )
        ORDER BY btrim(coalesce(d.numero, ''))
      ),
      '[]'::jsonb
    )
    INTO v_docs
    FROM public.iso_pro_documentos_planejamento d
    WHERE d.tenant_id = p_tenant_id;

    RETURN jsonb_build_object('_updatedAt', v_updated, 'documentos', v_docs, '_source', 'tables');
  END IF;

  SELECT s.payload INTO v_payload
  FROM public.iso_pro_snapshot AS s
  WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;

  IF v_payload IS NULL OR jsonb_typeof(v_payload -> 'documentos') <> 'array' THEN
    RETURN jsonb_build_object('_updatedAt', v_updated, 'documentos', '[]'::jsonb, '_source', 'snapshot');
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', d.value -> 'id',
        'numero', d.value -> 'numero',
        'revisao', d.value -> 'revisao',
        'descricao', d.value -> 'descricao',
        'responsavel', d.value -> 'responsavel',
        'status', d.value -> 'status',
        'itens', '[]'::jsonb
      )
      ORDER BY btrim(coalesce(d.value ->> 'numero', ''))
    ),
    '[]'::jsonb
  )
  INTO v_docs
  FROM jsonb_array_elements(v_payload -> 'documentos') AS d(value);

  RETURN jsonb_build_object('_updatedAt', v_updated, 'documentos', v_docs, '_source', 'snapshot');
END;
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_search_documentos_planejamento(
  p_tenant_id uuid,
  p_texto text,
  p_limit int DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_updated timestamptz;
  v_q text;
  v_lim int;
  v_docs jsonb;
  v_payload jsonb;
  v_row jsonb;
  v_out jsonb := '[]'::jsonb;
  v_n int := 0;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  v_q := lower(btrim(coalesce(p_texto, '')));
  v_lim := LEAST(GREATEST(coalesce(p_limit, 50), 1), 100);

  SELECT s.updated_at INTO v_updated
  FROM public.iso_pro_snapshot AS s
  WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;

  IF v_q = '' THEN
    RETURN jsonb_build_object('_updatedAt', v_updated, 'documentos', '[]'::jsonb);
  END IF;

  IF public.iso_pro_documentos_tabelas_ativas(p_tenant_id) THEN
    SELECT coalesce(jsonb_agg(public.iso_pro_documento_row_to_jsonb(p_tenant_id, x.id, true)), '[]'::jsonb)
    INTO v_docs
    FROM (
      SELECT d.id
      FROM public.iso_pro_documentos_planejamento d
      WHERE d.tenant_id = p_tenant_id
        AND (
          lower(d.numero) LIKE '%' || v_q || '%'
          OR lower(coalesce(d.descricao, '')) LIKE '%' || v_q || '%'
          OR lower(coalesce(d.responsavel, '')) LIKE '%' || v_q || '%'
        )
      ORDER BY d.numero
      LIMIT v_lim
    ) x;

    RETURN jsonb_build_object('_updatedAt', v_updated, 'documentos', v_docs, '_source', 'tables');
  END IF;

  SELECT s.payload INTO v_payload
  FROM public.iso_pro_snapshot AS s
  WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;

  IF v_payload IS NULL OR jsonb_typeof(v_payload -> 'documentos') <> 'array' THEN
    RETURN jsonb_build_object('_updatedAt', v_updated, 'documentos', '[]'::jsonb, '_source', 'snapshot');
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(v_payload -> 'documentos') LOOP
    IF lower(coalesce(v_row ->> 'numero', '')) LIKE '%' || v_q || '%'
      OR lower(coalesce(v_row ->> 'descricao', '')) LIKE '%' || v_q || '%'
      OR lower(coalesce(v_row ->> 'responsavel', '')) LIKE '%' || v_q || '%'
    THEN
      v_out := v_out || jsonb_build_array(v_row);
      v_n := v_n + 1;
      IF v_n >= v_lim THEN
        EXIT;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('_updatedAt', v_updated, 'documentos', v_out, '_source', 'snapshot');
END;
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_read_documento_planejamento(
  p_tenant_id uuid,
  p_documento_id text DEFAULT NULL,
  p_numero text DEFAULT NULL,
  p_revisao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_updated timestamptz;
  v_id text;
  v_num text;
  v_rev text;
  v_doc_id text;
  v_doc jsonb;
  v_payload jsonb;
  v_row jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  SELECT s.updated_at INTO v_updated
  FROM public.iso_pro_snapshot AS s
  WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;

  v_id := NULLIF(btrim(COALESCE(p_documento_id, '')), '');
  v_num := NULLIF(btrim(COALESCE(p_numero, '')), '');
  v_rev := NULLIF(btrim(COALESCE(p_revisao, '')), '');

  IF public.iso_pro_documentos_tabelas_ativas(p_tenant_id) THEN
    IF v_id IS NOT NULL THEN
      v_doc := public.iso_pro_documento_row_to_jsonb(p_tenant_id, v_id, true);
      RETURN jsonb_build_object('_updatedAt', v_updated, 'documento', v_doc, '_source', 'tables');
    END IF;
    IF v_num IS NOT NULL THEN
      SELECT d.id INTO v_doc_id
      FROM public.iso_pro_documentos_planejamento d
      WHERE d.tenant_id = p_tenant_id
        AND lower(btrim(d.numero)) = lower(v_num)
        AND (
          v_rev IS NULL
          OR lower(btrim(d.revisao)) = lower(v_rev)
        )
      ORDER BY CASE WHEN jsonb_array_length(
        coalesce((public.iso_pro_documento_row_to_jsonb(p_tenant_id, d.id, true) -> 'itens'), '[]'::jsonb)
      ) > 0 THEN 0 ELSE 1 END
      LIMIT 1;
      v_doc := public.iso_pro_documento_row_to_jsonb(p_tenant_id, v_doc_id, true);
      RETURN jsonb_build_object('_updatedAt', v_updated, 'documento', v_doc, '_source', 'tables');
    END IF;
    RETURN jsonb_build_object('_updatedAt', v_updated, 'documento', null, '_source', 'tables');
  END IF;

  SELECT s.payload INTO v_payload
  FROM public.iso_pro_snapshot AS s
  WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;

  IF v_payload IS NULL OR jsonb_typeof(v_payload -> 'documentos') <> 'array' THEN
    RETURN jsonb_build_object('_updatedAt', v_updated, 'documento', null, '_source', 'snapshot');
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(v_payload -> 'documentos') LOOP
    IF v_id IS NOT NULL AND btrim(COALESCE(v_row ->> 'id', '')) = v_id THEN
      RETURN jsonb_build_object('_updatedAt', v_updated, 'documento', v_row, '_source', 'snapshot');
    END IF;
    IF v_id IS NULL AND v_num IS NOT NULL
      AND lower(btrim(COALESCE(v_row ->> 'numero', ''))) = lower(v_num)
      AND (
        v_rev IS NULL
        OR lower(btrim(COALESCE(v_row ->> 'revisao', ''))) = lower(v_rev)
      ) THEN
      RETURN jsonb_build_object('_updatedAt', v_updated, 'documento', v_row, '_source', 'snapshot');
    END IF;
  END LOOP;

  RETURN jsonb_build_object('_updatedAt', v_updated, 'documento', null, '_source', 'snapshot');
END;
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_list_documentos_pendencia_material(
  p_tenant_id uuid,
  p_codigo text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_updated timestamptz;
  v_cod text;
  v_docs jsonb;
  v_payload jsonb;
  v_doc jsonb;
  v_item jsonb;
  v_q_proj numeric;
  v_q_at numeric;
  v_cod_linha text;
  v_out jsonb := '[]'::jsonb;
  v_tem boolean;
BEGIN
  IF p_tenant_id IS NULL OR p_codigo IS NULL OR btrim(p_codigo) = '' THEN
    RETURN jsonb_build_object('_error', 'Parametros invalidos.');
  END IF;

  v_cod := lower(btrim(p_codigo));

  SELECT s.updated_at INTO v_updated
  FROM public.iso_pro_snapshot AS s
  WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;

  IF public.iso_pro_documentos_tabelas_ativas(p_tenant_id) THEN
    SELECT coalesce(
      jsonb_agg(public.iso_pro_documento_row_to_jsonb(p_tenant_id, x.documento_id, true) ORDER BY x.numero),
      '[]'::jsonb
    )
    INTO v_docs
    FROM (
      SELECT DISTINCT i.documento_id, d.numero
      FROM public.iso_pro_documento_itens_planejamento i
      JOIN public.iso_pro_documentos_planejamento d
        ON d.tenant_id = i.tenant_id AND d.id = i.documento_id
      WHERE i.tenant_id = p_tenant_id
        AND lower(btrim(coalesce(i.codigo, ''))) = v_cod
        AND (i.quantidade - i.quantidade_atendida) > 1e-9
    ) x;

    RETURN jsonb_build_object('_updatedAt', v_updated, 'documentos', v_docs, '_source', 'tables');
  END IF;

  SELECT s.payload INTO v_payload
  FROM public.iso_pro_snapshot AS s
  WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;

  IF v_payload IS NULL OR jsonb_typeof(v_payload -> 'documentos') <> 'array' THEN
    RETURN jsonb_build_object('_updatedAt', v_updated, 'documentos', '[]'::jsonb, '_source', 'snapshot');
  END IF;

  FOR v_doc IN SELECT value FROM jsonb_array_elements(v_payload -> 'documentos') LOOP
    v_tem := false;
    IF jsonb_typeof(v_doc -> 'itens') = 'array' THEN
      FOR v_item IN SELECT value FROM jsonb_array_elements(v_doc -> 'itens') LOOP
        v_cod_linha := lower(btrim(COALESCE(v_item ->> 'codigo', '')));
        IF v_cod_linha = '' OR v_cod_linha <> v_cod THEN
          CONTINUE;
        END IF;
        v_q_proj := COALESCE(NULLIF(v_item ->> 'quantidade', '')::numeric, 0);
        v_q_at := COALESCE(NULLIF(v_item ->> 'quantidadeAtendida', '')::numeric, 0);
        IF v_q_proj - v_q_at > 1e-9 THEN
          v_tem := true;
          EXIT;
        END IF;
      END LOOP;
    END IF;
    IF v_tem THEN
      v_out := v_out || jsonb_build_array(v_doc);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('_updatedAt', v_updated, 'documentos', v_out, '_source', 'snapshot');
END;
$$;

-- Paginação para web/PC (lista sem carregar 11k de uma vez)
CREATE OR REPLACE FUNCTION public.iso_pro_list_documentos_planejamento_page(
  p_tenant_id uuid,
  p_busca text DEFAULT NULL,
  p_offset int DEFAULT 0,
  p_limit int DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_updated timestamptz;
  v_q text;
  v_off int;
  v_lim int;
  v_total int := 0;
  v_docs jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  v_q := lower(btrim(coalesce(p_busca, '')));
  v_off := GREATEST(coalesce(p_offset, 0), 0);
  v_lim := LEAST(GREATEST(coalesce(p_limit, 50), 1), 200);

  SELECT s.updated_at INTO v_updated
  FROM public.iso_pro_snapshot AS s
  WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;

  IF NOT public.iso_pro_documentos_tabelas_ativas(p_tenant_id) THEN
    RETURN jsonb_build_object(
      '_updatedAt', v_updated,
      'documentos', '[]'::jsonb,
      'total', 0,
      '_source', 'snapshot',
      '_hint', 'Execute iso_pro_sync_documentos_planejamento_from_snapshot para ativar tabelas.'
    );
  END IF;

  SELECT count(*)::int INTO v_total
  FROM public.iso_pro_documentos_planejamento d
  WHERE d.tenant_id = p_tenant_id
    AND (
      v_q = ''
      OR lower(d.numero) LIKE '%' || v_q || '%'
      OR lower(coalesce(d.descricao, '')) LIKE '%' || v_q || '%'
    );

  SELECT coalesce(
    jsonb_agg(public.iso_pro_documento_row_to_jsonb(p_tenant_id, x.id, true) ORDER BY x.numero),
    '[]'::jsonb
  )
  INTO v_docs
  FROM (
    SELECT d.id, d.numero
    FROM public.iso_pro_documentos_planejamento d
    WHERE d.tenant_id = p_tenant_id
      AND (
        v_q = ''
        OR lower(d.numero) LIKE '%' || v_q || '%'
        OR lower(coalesce(d.descricao, '')) LIKE '%' || v_q || '%'
      )
    ORDER BY d.numero
    OFFSET v_off
    LIMIT v_lim
  ) x;

  RETURN jsonb_build_object(
    '_updatedAt', v_updated,
    'documentos', v_docs,
    'total', v_total,
    'offset', v_off,
    'limit', v_lim,
    '_source', 'tables'
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_list_documentos_planejamento_page(uuid, text, int, int) IS
  'Lista paginada de desenhos a partir das tabelas (web/PC escala).';

REVOKE ALL ON FUNCTION public.iso_pro_list_documentos_planejamento_page(uuid, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_list_documentos_planejamento_page(uuid, text, int, int) TO anon, authenticated;

-- Sync automático inicial para todos os tenants com snapshot
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT tenant_id
    FROM public.iso_pro_snapshot
    WHERE tenant_id IS NOT NULL
  LOOP
    PERFORM public.iso_pro_sync_documentos_planejamento_from_snapshot(r.tenant_id);
  END LOOP;
END $$;

COMMIT;
