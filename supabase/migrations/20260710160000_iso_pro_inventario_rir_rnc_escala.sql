-- P2 escala: inventarios (tabelas) + RIR/RNC (colunas + payload jsonb).
-- Corrige contagens: rirRegistros / rncRegistros (antes lia chaves erradas).

BEGIN;

-- ========== INVENTARIOS ==========
CREATE TABLE IF NOT EXISTS public.iso_pro_inventarios (
  tenant_id uuid NOT NULL REFERENCES public.iso_pro_tenants(id) ON DELETE CASCADE,
  id text NOT NULL,
  codigo text NOT NULL DEFAULT '',
  descricao text,
  responsavel text,
  data_inventario date,
  status text NOT NULL DEFAULT 'aberto',
  contagem_mobile_habilitada boolean NOT NULL DEFAULT false,
  observacoes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS public.iso_pro_inventario_itens (
  tenant_id uuid NOT NULL REFERENCES public.iso_pro_tenants(id) ON DELETE CASCADE,
  inventario_id text NOT NULL,
  id text NOT NULL,
  codigo text,
  descricao text,
  unidade text,
  saldo_sistema numeric NOT NULL DEFAULT 0,
  quantidade_contada numeric NOT NULL DEFAULT 0,
  localizacao_contada text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT iso_pro_inventario_itens_fk
    FOREIGN KEY (tenant_id, inventario_id)
    REFERENCES public.iso_pro_inventarios(tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS iso_pro_inventarios_tenant_status_idx
  ON public.iso_pro_inventarios (tenant_id, lower(btrim(status)));
CREATE INDEX IF NOT EXISTS iso_pro_inventarios_tenant_data_idx
  ON public.iso_pro_inventarios (tenant_id, data_inventario DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS iso_pro_inventario_itens_tenant_inv_idx
  ON public.iso_pro_inventario_itens (tenant_id, inventario_id);

ALTER TABLE public.iso_pro_inventarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iso_pro_inventario_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS iso_pro_inventarios_anon_rw ON public.iso_pro_inventarios;
CREATE POLICY iso_pro_inventarios_anon_rw ON public.iso_pro_inventarios
  FOR ALL TO anon, authenticated USING (tenant_id IS NOT NULL) WITH CHECK (tenant_id IS NOT NULL);
DROP POLICY IF EXISTS iso_pro_inventarios_service ON public.iso_pro_inventarios;
CREATE POLICY iso_pro_inventarios_service ON public.iso_pro_inventarios
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS iso_pro_inventario_itens_anon_rw ON public.iso_pro_inventario_itens;
CREATE POLICY iso_pro_inventario_itens_anon_rw ON public.iso_pro_inventario_itens
  FOR ALL TO anon, authenticated USING (tenant_id IS NOT NULL) WITH CHECK (tenant_id IS NOT NULL);
DROP POLICY IF EXISTS iso_pro_inventario_itens_service ON public.iso_pro_inventario_itens;
CREATE POLICY iso_pro_inventario_itens_service ON public.iso_pro_inventario_itens
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.iso_pro_inventarios_tabelas_ativas(p_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.iso_pro_inventarios WHERE tenant_id = p_tenant_id LIMIT 1);
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_upsert_inventarios_lote(p_tenant_id uuid, p_inventarios jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_inv jsonb; v_item jsonb; v_id text; v_item_id text;
  v_n int := 0; v_itens int := 0; v_data date; v_item_ids text[]; v_idx int;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'tenant_id em falta.'); END IF;
  IF p_inventarios IS NULL OR jsonb_typeof(p_inventarios) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'p_inventarios deve ser array JSON.');
  END IF;

  FOR v_inv IN SELECT value FROM jsonb_array_elements(p_inventarios) LOOP
    v_id := NULLIF(btrim(coalesce(v_inv->>'id','')), '');
    IF v_id IS NULL THEN CONTINUE; END IF;
    BEGIN
      v_data := NULLIF(btrim(coalesce(v_inv->>'dataInventario','')), '')::date;
    EXCEPTION WHEN others THEN v_data := NULL; END;

    INSERT INTO public.iso_pro_inventarios (
      tenant_id, id, codigo, descricao, responsavel, data_inventario, status,
      contagem_mobile_habilitada, observacoes, updated_at
    ) VALUES (
      p_tenant_id, v_id,
      coalesce(v_inv->>'codigo',''),
      coalesce(v_inv->>'descricao',''),
      coalesce(v_inv->>'responsavel',''),
      v_data,
      coalesce(NULLIF(btrim(v_inv->>'status'),''), 'aberto'),
      coalesce((v_inv->>'contagemMobileHabilitada')::boolean, false),
      coalesce(v_inv->>'observacoes',''),
      now()
    )
    ON CONFLICT (tenant_id, id) DO UPDATE SET
      codigo = EXCLUDED.codigo,
      descricao = EXCLUDED.descricao,
      responsavel = EXCLUDED.responsavel,
      data_inventario = EXCLUDED.data_inventario,
      status = EXCLUDED.status,
      contagem_mobile_habilitada = EXCLUDED.contagem_mobile_habilitada,
      observacoes = EXCLUDED.observacoes,
      updated_at = now();
    v_n := v_n + 1;
    v_item_ids := ARRAY[]::text[];
    v_idx := 0;

    IF jsonb_typeof(v_inv->'itens') = 'array' THEN
      FOR v_item IN SELECT value FROM jsonb_array_elements(v_inv->'itens') LOOP
        v_idx := v_idx + 1;
        v_item_id := NULLIF(btrim(coalesce(v_item->>'id','')), '');
        IF v_item_id IS NULL THEN
          v_item_id := v_id || ':' || coalesce(v_item->>'codigoMaterial','x') || ':' || v_idx::text;
        END IF;
        v_item_ids := array_append(v_item_ids, v_item_id);
        INSERT INTO public.iso_pro_inventario_itens (
          tenant_id, inventario_id, id, codigo, descricao, unidade,
          saldo_sistema, quantidade_contada, localizacao_contada, updated_at
        ) VALUES (
          p_tenant_id, v_id, v_item_id,
          coalesce(v_item->>'codigoMaterial', v_item->>'codigo'),
          coalesce(v_item->>'descricaoMaterial', v_item->>'descricao'),
          coalesce(v_item->>'unidade','UN'),
          coalesce(NULLIF(v_item->>'saldoSistema','')::numeric, 0),
          coalesce(NULLIF(v_item->>'quantidadeContada','')::numeric, 0),
          coalesce(v_item->>'localizacaoContada',''),
          now()
        )
        ON CONFLICT (tenant_id, id) DO UPDATE SET
          inventario_id = EXCLUDED.inventario_id,
          codigo = EXCLUDED.codigo,
          descricao = EXCLUDED.descricao,
          unidade = EXCLUDED.unidade,
          saldo_sistema = EXCLUDED.saldo_sistema,
          quantidade_contada = EXCLUDED.quantidade_contada,
          localizacao_contada = EXCLUDED.localizacao_contada,
          updated_at = now();
        v_itens := v_itens + 1;
      END LOOP;
      DELETE FROM public.iso_pro_inventario_itens i
      WHERE i.tenant_id = p_tenant_id AND i.inventario_id = v_id
        AND NOT (i.id = ANY (v_item_ids));
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'inventarios', v_n, 'itens', v_itens);
END;
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_sync_inventarios_from_snapshot(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_payload jsonb; v_arr jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'tenant_id em falta.'); END IF;
  SELECT s.payload INTO v_payload FROM public.iso_pro_snapshot s
  WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;
  v_arr := coalesce(v_payload->'inventarios', '[]'::jsonb);
  IF jsonb_typeof(v_arr) <> 'array' THEN v_arr := '[]'::jsonb; END IF;
  DELETE FROM public.iso_pro_inventario_itens WHERE tenant_id = p_tenant_id;
  DELETE FROM public.iso_pro_inventarios WHERE tenant_id = p_tenant_id;
  RETURN public.iso_pro_upsert_inventarios_lote(p_tenant_id, v_arr);
END;
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_list_inventarios_page(
  p_tenant_id uuid, p_busca text DEFAULT NULL, p_offset int DEFAULT 0,
  p_limit int DEFAULT 50, p_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_q text; v_off int; v_lim int; v_status text; v_total int := 0; v_rows jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN jsonb_build_object('_error', 'tenant_id em falta.'); END IF;
  v_q := lower(btrim(coalesce(p_busca,'')));
  v_off := GREATEST(coalesce(p_offset,0),0);
  v_lim := LEAST(GREATEST(coalesce(p_limit,50),1),200);
  v_status := lower(btrim(coalesce(p_status,'')));
  IF v_status IN ('','todos','all') THEN v_status := NULL; END IF;

  IF NOT public.iso_pro_inventarios_tabelas_ativas(p_tenant_id) THEN
    RETURN jsonb_build_object('inventarios','[]'::jsonb,'total',0,'_source','snapshot');
  END IF;

  WITH base AS (
    SELECT
      i.id, i.codigo, i.descricao, i.responsavel, i.data_inventario, i.status,
      i.contagem_mobile_habilitada,
      coalesce(count(it.*),0)::int AS total_itens,
      coalesce(sum(CASE WHEN coalesce(it.saldo_sistema,0) <> coalesce(it.quantidade_contada,0) THEN 1 ELSE 0 END),0)::int AS divergencias
    FROM public.iso_pro_inventarios i
    LEFT JOIN public.iso_pro_inventario_itens it
      ON it.tenant_id = i.tenant_id AND it.inventario_id = i.id
    WHERE i.tenant_id = p_tenant_id
      AND (v_status IS NULL OR lower(btrim(i.status)) = v_status)
      AND (
        v_q = ''
        OR lower(btrim(i.codigo)) LIKE '%'||v_q||'%'
        OR lower(btrim(coalesce(i.descricao,''))) LIKE '%'||v_q||'%'
        OR lower(btrim(coalesce(i.responsavel,''))) LIKE '%'||v_q||'%'
      )
    GROUP BY i.id, i.codigo, i.descricao, i.responsavel, i.data_inventario, i.status, i.contagem_mobile_habilitada
  ),
  counted AS (SELECT count(*)::int AS c FROM base),
  page AS (
    SELECT * FROM base ORDER BY data_inventario DESC NULLS LAST, lower(btrim(codigo))
    OFFSET v_off LIMIT v_lim
  )
  SELECT (SELECT c FROM counted),
    coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'codigo', p.codigo, 'descricao', coalesce(p.descricao,''),
        'responsavel', coalesce(p.responsavel,''),
        'dataInventario', to_char(p.data_inventario,'YYYY-MM-DD'),
        'status', p.status,
        'contagemMobileHabilitada', p.contagem_mobile_habilitada,
        'totalItens', p.total_itens, 'divergencias', p.divergencias
      ) ORDER BY p.data_inventario DESC NULLS LAST, lower(btrim(p.codigo)))
      FROM page p
    ), '[]'::jsonb)
  INTO v_total, v_rows;

  RETURN jsonb_build_object(
    'inventarios', coalesce(v_rows,'[]'::jsonb),
    'total', coalesce(v_total,0), 'offset', v_off, 'limit', v_lim, '_source', 'tables'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_read_inventario(p_tenant_id uuid, p_id text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE v_row public.iso_pro_inventarios%ROWTYPE; v_itens jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN jsonb_build_object('_error', 'tenant_id em falta.'); END IF;
  IF NOT public.iso_pro_inventarios_tabelas_ativas(p_tenant_id) THEN
    RETURN jsonb_build_object('_source','snapshot','inventario', NULL);
  END IF;
  SELECT * INTO v_row FROM public.iso_pro_inventarios
  WHERE tenant_id = p_tenant_id AND id = btrim(coalesce(p_id,''));
  IF NOT FOUND THEN RETURN jsonb_build_object('_source','tables','inventario', NULL); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', it.id, 'codigoMaterial', coalesce(it.codigo,''),
    'descricaoMaterial', coalesce(it.descricao,''), 'unidade', coalesce(it.unidade,'UN'),
    'saldoSistema', it.saldo_sistema, 'quantidadeContada', it.quantidade_contada,
    'localizacaoContada', coalesce(it.localizacao_contada,'')
  ) ORDER BY lower(btrim(coalesce(it.codigo,''))), it.id), '[]'::jsonb)
  INTO v_itens FROM public.iso_pro_inventario_itens it
  WHERE it.tenant_id = p_tenant_id AND it.inventario_id = v_row.id;
  RETURN jsonb_build_object('_source','tables','inventario', jsonb_build_object(
    'id', v_row.id, 'codigo', v_row.codigo, 'descricao', coalesce(v_row.descricao,''),
    'responsavel', coalesce(v_row.responsavel,''),
    'dataInventario', to_char(v_row.data_inventario,'YYYY-MM-DD'),
    'status', v_row.status,
    'contagemMobileHabilitada', v_row.contagem_mobile_habilitada,
    'observacoes', coalesce(v_row.observacoes,''), 'itens', v_itens
  ));
END;
$$;

-- ========== RIR (colunas + payload) ==========
CREATE TABLE IF NOT EXISTS public.iso_pro_rir (
  tenant_id uuid NOT NULL REFERENCES public.iso_pro_tenants(id) ON DELETE CASCADE,
  id text NOT NULL,
  codigo text NOT NULL DEFAULT '',
  data_registro date,
  status text NOT NULL DEFAULT 'aberto',
  recebimento_id text NOT NULL DEFAULT '',
  laudo text,
  responsavel text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS iso_pro_rir_tenant_status_idx ON public.iso_pro_rir (tenant_id, lower(btrim(status)));
CREATE INDEX IF NOT EXISTS iso_pro_rir_tenant_rec_idx ON public.iso_pro_rir (tenant_id, recebimento_id);
CREATE INDEX IF NOT EXISTS iso_pro_rir_tenant_data_idx ON public.iso_pro_rir (tenant_id, data_registro DESC NULLS LAST);

ALTER TABLE public.iso_pro_rir ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS iso_pro_rir_anon_rw ON public.iso_pro_rir;
CREATE POLICY iso_pro_rir_anon_rw ON public.iso_pro_rir
  FOR ALL TO anon, authenticated USING (tenant_id IS NOT NULL) WITH CHECK (tenant_id IS NOT NULL);
DROP POLICY IF EXISTS iso_pro_rir_service ON public.iso_pro_rir;
CREATE POLICY iso_pro_rir_service ON public.iso_pro_rir
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ========== RNC ==========
CREATE TABLE IF NOT EXISTS public.iso_pro_rnc (
  tenant_id uuid NOT NULL REFERENCES public.iso_pro_tenants(id) ON DELETE CASCADE,
  id text NOT NULL,
  codigo text NOT NULL DEFAULT '',
  data_registro date,
  status text NOT NULL DEFAULT 'aberto',
  recebimento_id text NOT NULL DEFAULT '',
  setor text,
  responsavel text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS iso_pro_rnc_tenant_status_idx ON public.iso_pro_rnc (tenant_id, lower(btrim(status)));
CREATE INDEX IF NOT EXISTS iso_pro_rnc_tenant_rec_idx ON public.iso_pro_rnc (tenant_id, recebimento_id);
CREATE INDEX IF NOT EXISTS iso_pro_rnc_tenant_data_idx ON public.iso_pro_rnc (tenant_id, data_registro DESC NULLS LAST);

ALTER TABLE public.iso_pro_rnc ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS iso_pro_rnc_anon_rw ON public.iso_pro_rnc;
CREATE POLICY iso_pro_rnc_anon_rw ON public.iso_pro_rnc
  FOR ALL TO anon, authenticated USING (tenant_id IS NOT NULL) WITH CHECK (tenant_id IS NOT NULL);
DROP POLICY IF EXISTS iso_pro_rnc_service ON public.iso_pro_rnc;
CREATE POLICY iso_pro_rnc_service ON public.iso_pro_rnc
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.iso_pro_rir_tabelas_ativas(p_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.iso_pro_rir WHERE tenant_id = p_tenant_id LIMIT 1);
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_rnc_tabelas_ativas(p_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.iso_pro_rnc WHERE tenant_id = p_tenant_id LIMIT 1);
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_upsert_rir_lote(p_tenant_id uuid, p_registros jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_row jsonb; v_id text; v_n int := 0; v_data date;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'tenant_id em falta.'); END IF;
  IF p_registros IS NULL OR jsonb_typeof(p_registros) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'p_registros deve ser array JSON.');
  END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_registros) LOOP
    v_id := NULLIF(btrim(coalesce(v_row->>'id','')), '');
    IF v_id IS NULL THEN CONTINUE; END IF;
    BEGIN
      v_data := NULLIF(btrim(coalesce(v_row->>'dataRegistro','')), '')::date;
    EXCEPTION WHEN others THEN v_data := NULL; END;
    INSERT INTO public.iso_pro_rir (
      tenant_id, id, codigo, data_registro, status, recebimento_id, laudo, responsavel, payload, updated_at
    ) VALUES (
      p_tenant_id, v_id,
      coalesce(v_row->>'codigo',''), v_data,
      coalesce(NULLIF(btrim(v_row->>'status'),''), 'aberto'),
      coalesce(v_row->>'recebimentoId',''),
      coalesce(v_row->>'laudo',''),
      coalesce(v_row->>'responsavel',''),
      v_row, now()
    )
    ON CONFLICT (tenant_id, id) DO UPDATE SET
      codigo = EXCLUDED.codigo, data_registro = EXCLUDED.data_registro,
      status = EXCLUDED.status, recebimento_id = EXCLUDED.recebimento_id,
      laudo = EXCLUDED.laudo, responsavel = EXCLUDED.responsavel,
      payload = EXCLUDED.payload, updated_at = now();
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'rir', v_n);
END;
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_upsert_rnc_lote(p_tenant_id uuid, p_registros jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_row jsonb; v_id text; v_n int := 0; v_data date;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'tenant_id em falta.'); END IF;
  IF p_registros IS NULL OR jsonb_typeof(p_registros) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'p_registros deve ser array JSON.');
  END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_registros) LOOP
    v_id := NULLIF(btrim(coalesce(v_row->>'id','')), '');
    IF v_id IS NULL THEN CONTINUE; END IF;
    BEGIN
      v_data := NULLIF(btrim(coalesce(v_row->>'dataRegistro','')), '')::date;
    EXCEPTION WHEN others THEN v_data := NULL; END;
    INSERT INTO public.iso_pro_rnc (
      tenant_id, id, codigo, data_registro, status, recebimento_id, setor, responsavel, payload, updated_at
    ) VALUES (
      p_tenant_id, v_id,
      coalesce(v_row->>'codigo',''), v_data,
      coalesce(NULLIF(btrim(v_row->>'status'),''), 'aberto'),
      coalesce(v_row->>'recebimentoId',''),
      coalesce(v_row->>'setor',''),
      coalesce(v_row->>'responsavel',''),
      v_row, now()
    )
    ON CONFLICT (tenant_id, id) DO UPDATE SET
      codigo = EXCLUDED.codigo, data_registro = EXCLUDED.data_registro,
      status = EXCLUDED.status, recebimento_id = EXCLUDED.recebimento_id,
      setor = EXCLUDED.setor, responsavel = EXCLUDED.responsavel,
      payload = EXCLUDED.payload, updated_at = now();
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'rnc', v_n);
END;
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_sync_rir_from_snapshot(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_payload jsonb; v_arr jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'tenant_id em falta.'); END IF;
  SELECT s.payload INTO v_payload FROM public.iso_pro_snapshot s
  WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;
  v_arr := coalesce(v_payload->'rirRegistros', v_payload->'rir', '[]'::jsonb);
  IF jsonb_typeof(v_arr) <> 'array' THEN v_arr := '[]'::jsonb; END IF;
  DELETE FROM public.iso_pro_rir WHERE tenant_id = p_tenant_id;
  RETURN public.iso_pro_upsert_rir_lote(p_tenant_id, v_arr);
END;
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_sync_rnc_from_snapshot(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_payload jsonb; v_arr jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'tenant_id em falta.'); END IF;
  SELECT s.payload INTO v_payload FROM public.iso_pro_snapshot s
  WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;
  v_arr := coalesce(v_payload->'rncRegistros', v_payload->'rnc', '[]'::jsonb);
  IF jsonb_typeof(v_arr) <> 'array' THEN v_arr := '[]'::jsonb; END IF;
  DELETE FROM public.iso_pro_rnc WHERE tenant_id = p_tenant_id;
  RETURN public.iso_pro_upsert_rnc_lote(p_tenant_id, v_arr);
END;
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_delete_rir(p_tenant_id uuid, p_ids text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_n int := 0;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'tenant_id em falta.'); END IF;
  IF p_ids IS NULL OR array_length(p_ids,1) IS NULL THEN RETURN jsonb_build_object('ok', true, 'deleted', 0); END IF;
  DELETE FROM public.iso_pro_rir WHERE tenant_id = p_tenant_id AND id = ANY (p_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'deleted', v_n);
END;
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_list_rir_page(
  p_tenant_id uuid, p_busca text DEFAULT NULL, p_offset int DEFAULT 0,
  p_limit int DEFAULT 50, p_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_q text; v_off int; v_lim int; v_status text; v_total int := 0; v_rows jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN jsonb_build_object('_error', 'tenant_id em falta.'); END IF;
  v_q := lower(btrim(coalesce(p_busca,'')));
  v_off := GREATEST(coalesce(p_offset,0),0);
  v_lim := LEAST(GREATEST(coalesce(p_limit,50),1),200);
  v_status := lower(btrim(coalesce(p_status,'')));
  IF v_status IN ('','todos','all') THEN v_status := NULL; END IF;
  IF NOT public.iso_pro_rir_tabelas_ativas(p_tenant_id) THEN
    RETURN jsonb_build_object('registros','[]'::jsonb,'total',0,'_source','snapshot');
  END IF;

  WITH base AS (
    SELECT r.payload, r.data_registro, r.codigo, r.id
    FROM public.iso_pro_rir r
    WHERE r.tenant_id = p_tenant_id
      AND (v_status IS NULL OR lower(btrim(r.status)) = v_status)
      AND (
        v_q = ''
        OR lower(btrim(r.codigo)) LIKE '%'||v_q||'%'
        OR lower(btrim(coalesce(r.responsavel,''))) LIKE '%'||v_q||'%'
        OR lower(btrim(coalesce(r.recebimento_id,''))) LIKE '%'||v_q||'%'
        OR lower(coalesce(r.payload->>'recebimentoNotaFiscal','')) LIKE '%'||v_q||'%'
        OR lower(coalesce(r.payload->>'descricao','')) LIKE '%'||v_q||'%'
        OR lower(coalesce(r.payload->>'fornecedorNome','')) LIKE '%'||v_q||'%'
      )
  ),
  counted AS (SELECT count(*)::int AS c FROM base),
  page AS (
    SELECT * FROM base ORDER BY data_registro DESC NULLS LAST, lower(btrim(codigo))
    OFFSET v_off LIMIT v_lim
  )
  SELECT (SELECT c FROM counted),
    coalesce((SELECT jsonb_agg(p.payload ORDER BY p.data_registro DESC NULLS LAST, lower(btrim(p.codigo))) FROM page p), '[]'::jsonb)
  INTO v_total, v_rows;

  RETURN jsonb_build_object(
    'registros', coalesce(v_rows,'[]'::jsonb),
    'total', coalesce(v_total,0), '_source', 'tables'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_list_rnc_page(
  p_tenant_id uuid, p_busca text DEFAULT NULL, p_offset int DEFAULT 0,
  p_limit int DEFAULT 50, p_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_q text; v_off int; v_lim int; v_status text; v_total int := 0; v_rows jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN jsonb_build_object('_error', 'tenant_id em falta.'); END IF;
  v_q := lower(btrim(coalesce(p_busca,'')));
  v_off := GREATEST(coalesce(p_offset,0),0);
  v_lim := LEAST(GREATEST(coalesce(p_limit,50),1),200);
  v_status := lower(btrim(coalesce(p_status,'')));
  IF v_status IN ('','todos','all') THEN v_status := NULL; END IF;
  IF NOT public.iso_pro_rnc_tabelas_ativas(p_tenant_id) THEN
    RETURN jsonb_build_object('registros','[]'::jsonb,'total',0,'_source','snapshot');
  END IF;

  WITH base AS (
    SELECT r.payload, r.data_registro, r.codigo, r.id
    FROM public.iso_pro_rnc r
    WHERE r.tenant_id = p_tenant_id
      AND (v_status IS NULL OR lower(btrim(r.status)) = v_status)
      AND (
        v_q = ''
        OR lower(btrim(r.codigo)) LIKE '%'||v_q||'%'
        OR lower(btrim(coalesce(r.responsavel,''))) LIKE '%'||v_q||'%'
        OR lower(btrim(coalesce(r.setor,''))) LIKE '%'||v_q||'%'
        OR lower(btrim(coalesce(r.recebimento_id,''))) LIKE '%'||v_q||'%'
        OR lower(coalesce(r.payload->>'recebimentoNotaFiscal','')) LIKE '%'||v_q||'%'
        OR lower(coalesce(r.payload->>'descricao','')) LIKE '%'||v_q||'%'
        OR lower(coalesce(r.payload->>'materialCodigo','')) LIKE '%'||v_q||'%'
      )
  ),
  counted AS (SELECT count(*)::int AS c FROM base),
  page AS (
    SELECT * FROM base ORDER BY data_registro DESC NULLS LAST, lower(btrim(codigo))
    OFFSET v_off LIMIT v_lim
  )
  SELECT (SELECT c FROM counted),
    coalesce((SELECT jsonb_agg(p.payload ORDER BY p.data_registro DESC NULLS LAST, lower(btrim(p.codigo))) FROM page p), '[]'::jsonb)
  INTO v_total, v_rows;

  RETURN jsonb_build_object(
    'registros', coalesce(v_rows,'[]'::jsonb),
    'total', coalesce(v_total,0), '_source', 'tables'
  );
END;
$$;

-- Grants
REVOKE ALL ON FUNCTION public.iso_pro_inventarios_tabelas_ativas(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_inventarios_tabelas_ativas(uuid) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.iso_pro_upsert_inventarios_lote(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_upsert_inventarios_lote(uuid, jsonb) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.iso_pro_sync_inventarios_from_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_sync_inventarios_from_snapshot(uuid) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.iso_pro_list_inventarios_page(uuid, text, int, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_list_inventarios_page(uuid, text, int, int, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.iso_pro_read_inventario(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_read_inventario(uuid, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.iso_pro_rir_tabelas_ativas(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_rir_tabelas_ativas(uuid) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.iso_pro_rnc_tabelas_ativas(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_rnc_tabelas_ativas(uuid) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.iso_pro_upsert_rir_lote(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_upsert_rir_lote(uuid, jsonb) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.iso_pro_upsert_rnc_lote(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_upsert_rnc_lote(uuid, jsonb) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.iso_pro_sync_rir_from_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_sync_rir_from_snapshot(uuid) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.iso_pro_sync_rnc_from_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_sync_rnc_from_snapshot(uuid) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.iso_pro_delete_rir(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_delete_rir(uuid, text[]) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.iso_pro_list_rir_page(uuid, text, int, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_list_rir_page(uuid, text, int, int, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.iso_pro_list_rnc_page(uuid, text, int, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_list_rnc_page(uuid, text, int, int, text) TO anon, authenticated;

-- Sync inicial
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT s.tenant_id FROM public.iso_pro_snapshot s WHERE s.id = 'default' AND s.tenant_id IS NOT NULL
  LOOP
    PERFORM public.iso_pro_sync_inventarios_from_snapshot(r.tenant_id);
    PERFORM public.iso_pro_sync_rir_from_snapshot(r.tenant_id);
    PERFORM public.iso_pro_sync_rnc_from_snapshot(r.tenant_id);
  END LOOP;
END $$;

-- Contagens: tabelas + chaves correctas rirRegistros/rncRegistros
CREATE OR REPLACE FUNCTION public.iso_pro_operacao_contagens(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_payload jsonb;
  v_docs_pendentes int := 0; v_docs_parciais int := 0; v_docs_total int := 0;
  v_rec_aguardando int := 0; v_rec_conferencia int := 0; v_rec_divergentes int := 0;
  v_inv_abertos int := 0; v_inv_divergencia int := 0; v_inv_dias_mais_antigo int := 0;
  v_rir_abertos int := 0; v_rnc_abertas int := 0; v_rir_reprovado_sem_rnc int := 0;
  v_source_docs text := 'snapshot'; v_source_rec text := 'snapshot';
  v_source_inv text := 'snapshot'; v_source_rir text := 'snapshot'; v_source_rnc text := 'snapshot';
  v_rir_arr jsonb; v_rnc_arr jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN jsonb_build_object('_error', 'tenant_id em falta.'); END IF;
  SELECT s.payload INTO v_payload FROM public.iso_pro_snapshot s
  WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;
  IF v_payload IS NULL THEN v_payload := '{}'::jsonb; END IF;

  IF public.iso_pro_documentos_tabelas_ativas(p_tenant_id) THEN
    v_source_docs := 'tables';
    WITH agg AS (
      SELECT d.id, lower(btrim(coalesce(d.status,''))) AS st,
        coalesce(sum(i.quantidade),0) AS proj, coalesce(sum(i.quantidade_atendida),0) AS atd
      FROM public.iso_pro_documentos_planejamento d
      LEFT JOIN public.iso_pro_documento_itens_planejamento i ON i.tenant_id = d.tenant_id AND i.documento_id = d.id
      WHERE d.tenant_id = p_tenant_id GROUP BY d.id, d.status
    )
    SELECT count(*)::int,
      count(*) FILTER (WHERE st <> 'cancelado' AND NOT (proj > 0 AND atd >= proj - 1e-9) AND atd <= 1e-9)::int,
      count(*) FILTER (WHERE st <> 'cancelado' AND atd > 1e-9 AND NOT (proj > 0 AND atd >= proj - 1e-9))::int
    INTO v_docs_total, v_docs_pendentes, v_docs_parciais FROM agg;
  ELSE
    SELECT count(*)::int,
      count(*) FILTER (WHERE lower(btrim(coalesce(doc->>'status',''))) IN ('pendente','') OR (doc->>'status') IS NULL)::int,
      count(*) FILTER (WHERE lower(btrim(coalesce(doc->>'status',''))) = 'parcial')::int
    INTO v_docs_total, v_docs_pendentes, v_docs_parciais
    FROM jsonb_array_elements(coalesce(v_payload->'documentos','[]'::jsonb)) doc
    WHERE lower(btrim(coalesce(doc->>'status',''))) <> 'cancelado';
  END IF;

  IF public.iso_pro_recebimentos_tabelas_ativas(p_tenant_id) THEN
    v_source_rec := 'tables';
    SELECT
      count(*) FILTER (WHERE lower(btrim(status)) = 'aguardando_conferencia')::int,
      count(*) FILTER (WHERE lower(btrim(modo_recebimento)) = 'aguardando_conferencia'
        AND lower(btrim(status)) IN ('aguardando_conferencia','parcialmente_conferido','divergente'))::int,
      count(*) FILTER (WHERE lower(btrim(status)) = 'divergente')::int
    INTO v_rec_aguardando, v_rec_conferencia, v_rec_divergentes
    FROM public.iso_pro_recebimentos WHERE tenant_id = p_tenant_id AND lower(btrim(status)) <> 'cancelado';
  ELSE
    SELECT
      count(*) FILTER (WHERE lower(btrim(coalesce(r->>'status',''))) = 'aguardando_conferencia')::int,
      count(*) FILTER (WHERE lower(btrim(coalesce(r->>'modoRecebimento', coalesce(r->>'modo_recebimento','')))) = 'aguardando_conferencia'
        AND lower(btrim(coalesce(r->>'status',''))) IN ('aguardando_conferencia','parcialmente_conferido','divergente'))::int,
      count(*) FILTER (WHERE lower(btrim(coalesce(r->>'status',''))) = 'divergente'
        OR coalesce((r->>'conferenciaItensDivergentes')::numeric,0) > 0)::int
    INTO v_rec_aguardando, v_rec_conferencia, v_rec_divergentes
    FROM jsonb_array_elements(coalesce(v_payload->'recebimentos','[]'::jsonb)) r
    WHERE lower(btrim(coalesce(r->>'status',''))) <> 'cancelado';
  END IF;

  IF public.iso_pro_inventarios_tabelas_ativas(p_tenant_id) THEN
    v_source_inv := 'tables';
    SELECT count(*) FILTER (WHERE lower(btrim(status)) = 'aberto')::int,
      coalesce(max(CASE WHEN lower(btrim(status)) = 'aberto' AND data_inventario IS NOT NULL
        THEN GREATEST(0, (CURRENT_DATE - data_inventario)) ELSE NULL END), 0)::int
    INTO v_inv_abertos, v_inv_dias_mais_antigo
    FROM public.iso_pro_inventarios WHERE tenant_id = p_tenant_id;
    SELECT count(DISTINCT i.id)::int INTO v_inv_divergencia
    FROM public.iso_pro_inventarios i
    JOIN public.iso_pro_inventario_itens it ON it.tenant_id = i.tenant_id AND it.inventario_id = i.id
    WHERE i.tenant_id = p_tenant_id AND lower(btrim(i.status)) <> 'cancelado'
      AND coalesce(it.saldo_sistema,0) <> coalesce(it.quantidade_contada,0);
  ELSE
    SELECT
      count(*) FILTER (WHERE lower(btrim(coalesce(i->>'status',''))) = 'aberto')::int,
      count(*) FILTER (WHERE coalesce((i->>'divergencias')::numeric,0) > 0
        AND lower(btrim(coalesce(i->>'status',''))) <> 'cancelado')::int,
      coalesce(max(CASE WHEN lower(btrim(coalesce(i->>'status',''))) = 'aberto'
        AND nullif(btrim(coalesce(i->>'dataInventario', i->>'data','')),'') IS NOT NULL
        THEN GREATEST(0, (CURRENT_DATE - nullif(btrim(coalesce(i->>'dataInventario', i->>'data','')),'')::date))
        ELSE NULL END), 0)::int
    INTO v_inv_abertos, v_inv_divergencia, v_inv_dias_mais_antigo
    FROM jsonb_array_elements(coalesce(v_payload->'inventarios','[]'::jsonb)) i;
  END IF;

  IF public.iso_pro_rir_tabelas_ativas(p_tenant_id) THEN
    v_source_rir := 'tables';
    SELECT count(*)::int INTO v_rir_abertos FROM public.iso_pro_rir
    WHERE tenant_id = p_tenant_id AND lower(btrim(status)) NOT IN ('tratado','cancelado');
  ELSE
    v_rir_arr := coalesce(v_payload->'rirRegistros', v_payload->'rir', '[]'::jsonb);
    SELECT count(*)::int INTO v_rir_abertos FROM jsonb_array_elements(v_rir_arr) r
    WHERE lower(btrim(coalesce(r->>'status',''))) NOT IN ('tratado','cancelado');
  END IF;

  IF public.iso_pro_rnc_tabelas_ativas(p_tenant_id) THEN
    v_source_rnc := 'tables';
    SELECT count(*)::int INTO v_rnc_abertas FROM public.iso_pro_rnc
    WHERE tenant_id = p_tenant_id AND lower(btrim(status)) NOT IN ('concluido','cancelado');
  ELSE
    v_rnc_arr := coalesce(v_payload->'rncRegistros', v_payload->'rnc', '[]'::jsonb);
    SELECT count(*)::int INTO v_rnc_abertas FROM jsonb_array_elements(v_rnc_arr) r
    WHERE lower(btrim(coalesce(r->>'status',''))) NOT IN ('concluido','cancelado');
  END IF;

  IF public.iso_pro_rir_tabelas_ativas(p_tenant_id) AND public.iso_pro_rnc_tabelas_ativas(p_tenant_id) THEN
    SELECT count(*)::int INTO v_rir_reprovado_sem_rnc
    FROM public.iso_pro_rir rr
    WHERE rr.tenant_id = p_tenant_id
      AND lower(btrim(coalesce(rr.laudo,''))) = 'reprovado'
      AND lower(btrim(rr.status)) NOT IN ('tratado','cancelado')
      AND btrim(rr.recebimento_id) <> ''
      AND NOT EXISTS (
        SELECT 1 FROM public.iso_pro_rnc n
        WHERE n.tenant_id = p_tenant_id
          AND btrim(n.recebimento_id) = btrim(rr.recebimento_id)
          AND lower(btrim(n.status)) <> 'cancelado'
      );
  ELSE
    v_rir_arr := coalesce(v_payload->'rirRegistros', v_payload->'rir', '[]'::jsonb);
    v_rnc_arr := coalesce(v_payload->'rncRegistros', v_payload->'rnc', '[]'::jsonb);
    WITH rir_rep AS (
      SELECT btrim(coalesce(r->>'recebimentoId', r->>'recebimento_id','')) AS rid
      FROM jsonb_array_elements(v_rir_arr) r
      WHERE lower(btrim(coalesce(r->>'laudo',''))) = 'reprovado'
        AND lower(btrim(coalesce(r->>'status',''))) NOT IN ('tratado','cancelado')
        AND btrim(coalesce(r->>'recebimentoId', r->>'recebimento_id','')) <> ''
    ),
    rnc_ativa AS (
      SELECT DISTINCT btrim(coalesce(n->>'recebimentoId', n->>'recebimento_id','')) AS rid
      FROM jsonb_array_elements(v_rnc_arr) n
      WHERE lower(btrim(coalesce(n->>'status',''))) <> 'cancelado'
        AND btrim(coalesce(n->>'recebimentoId', n->>'recebimento_id','')) <> ''
    )
    SELECT count(*)::int INTO v_rir_reprovado_sem_rnc
    FROM rir_rep rr WHERE NOT EXISTS (SELECT 1 FROM rnc_ativa ra WHERE ra.rid = rr.rid);
  END IF;

  RETURN jsonb_build_object(
    'docsPendentes', v_docs_pendentes + v_docs_parciais,
    'docsStatusPendente', v_docs_pendentes, 'docsStatusParcial', v_docs_parciais, 'docsTotal', v_docs_total,
    'recebimentosAguardando', v_rec_aguardando, 'conferenciaPendente', v_rec_conferencia,
    'recebimentosDivergentes', v_rec_divergentes,
    'inventariosAbertos', v_inv_abertos, 'inventariosComDivergencia', v_inv_divergencia,
    'inventarioDiasMaisAntigo', v_inv_dias_mais_antigo,
    'rirAbertos', v_rir_abertos, 'rncAbertas', v_rnc_abertas, 'rirReprovadoSemRnc', v_rir_reprovado_sem_rnc,
    '_sourceDocs', v_source_docs, '_sourceRecebimentos', v_source_rec,
    '_sourceInventarios', v_source_inv, '_sourceRir', v_source_rir, '_sourceRnc', v_source_rnc
  );
END;
$$;

COMMIT;
