-- Sync snapshot -> tabelas deixa de apagar o status dos desenhos.
--
-- Causa raiz (18/07/2026): iso_pro_sync_documentos_planejamento_from_snapshot faz
-- DELETE + INSERT a partir do snapshot, e o snapshot nao guarda status. Cada vez que o
-- sync corria (botao em Configuracoes ou auto-reparacao na entrada quando uma leitura
-- transitoria devolvia 0), a coluna status voltava a NULL e a lista mostrava tudo "Pendente".
--
-- Correcao:
--   1) O sync captura os status actuais antes do DELETE e restaura-os apos o INSERT;
--   2) Docs ainda sem status (novos) sao derivados na hora (ate 500 por chamada;
--      o resto fica para iso_pro_recalcular_status_documentos_planejamento).

BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_sync_documentos_planejamento_from_snapshot(
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '120s'
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

  -- Preserva os status actuais: o snapshot nao os guarda e o DELETE abaixo apaga-os.
  CREATE TEMP TABLE _iso_pro_status_antigos (id text PRIMARY KEY, status text)
    ON COMMIT DROP;
  INSERT INTO _iso_pro_status_antigos (id, status)
  SELECT d.id, d.status
  FROM public.iso_pro_documentos_planejamento d
  WHERE d.tenant_id = p_tenant_id
    AND NULLIF(btrim(coalesce(d.status, '')), '') IS NOT NULL;

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
    )
    ON CONFLICT (tenant_id, id) DO NOTHING;
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
        ON CONFLICT (tenant_id, id) DO NOTHING;
        v_itens := v_itens + 1;
      END LOOP;
    END IF;
  END LOOP;

  -- Restaura os status preservados (o JSON do snapshot nao os traz).
  UPDATE public.iso_pro_documentos_planejamento d
  SET status = a.status
  FROM _iso_pro_status_antigos a
  WHERE d.tenant_id = p_tenant_id
    AND d.id = a.id
    AND NULLIF(btrim(coalesce(d.status, '')), '') IS NULL;

  -- Docs novos (sem status preservado): deriva ja ate 500; o resto fica para o
  -- iso_pro_recalcular_status_documentos_planejamento chamado pelo cliente.
  UPDATE public.iso_pro_documentos_planejamento d
  SET status = public.iso_pro_documento_status_derivado(p_tenant_id, d.id, d.status)
  WHERE d.tenant_id = p_tenant_id
    AND d.id IN (
      SELECT x.id FROM public.iso_pro_documentos_planejamento x
      WHERE x.tenant_id = p_tenant_id
        AND NULLIF(btrim(coalesce(x.status, '')), '') IS NULL
      ORDER BY x.numero
      LIMIT 500
    );

  RETURN jsonb_build_object('ok', true, 'documentos', v_docs, 'itens', v_itens);
END;
$$;

COMMENT ON FUNCTION public.iso_pro_sync_documentos_planejamento_from_snapshot(uuid) IS
  'Sync snapshot -> tabelas de planejamento preservando a coluna status (que o snapshot nao guarda).';

REVOKE ALL ON FUNCTION public.iso_pro_sync_documentos_planejamento_from_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_sync_documentos_planejamento_from_snapshot(uuid) TO anon, authenticated, service_role;

COMMIT;
