-- Importacao de recebimentos lia o payload inteiro do snapshot (historico + notas)
-- so para fundir o array recebimentos. Com o planejamento grande isso passava
-- do tecto da API (~60s) e a gravacao era cancelada.
-- A lista ja le as tabelas. A projecao do snapshot passa a sair das tabelas,
-- sem trazer o resto do JSON para a funcao.

BEGIN;

ALTER FUNCTION public.iso_pro_upsert_recebimentos_lote(uuid, jsonb)
  SET statement_timeout = '180s';

CREATE OR REPLACE FUNCTION public.iso_pro_write_recebimentos_sot(
  p_tenant_id uuid,
  p_baseline timestamptz DEFAULT NULL,
  p_upsert jsonb DEFAULT NULL,
  p_remove_ids text[] DEFAULT NULL,
  p_replace_all jsonb DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '180s'
AS $$
DECLARE
  v_new timestamptz := now();
  v_arr jsonb := '[]'::jsonb;
  v_upsert jsonb := '[]'::jsonb;
  v_sync jsonb;
  v_updated int := 0;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'ISO_PRO_TENANT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF p_replace_all IS NOT NULL THEN
    IF jsonb_typeof(p_replace_all) <> 'array' THEN
      RAISE EXCEPTION 'ISO_PRO_RECEBIMENTOS_INVALID' USING ERRCODE = 'P0001';
    END IF;
    DELETE FROM public.iso_pro_recebimento_itens WHERE tenant_id = p_tenant_id;
    DELETE FROM public.iso_pro_recebimentos WHERE tenant_id = p_tenant_id;
    v_sync := public.iso_pro_upsert_recebimentos_lote(p_tenant_id, p_replace_all);
    IF coalesce((v_sync ->> 'ok')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION '%', coalesce(v_sync ->> 'error', 'Falha ao gravar recebimentos (replace).')
        USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF p_remove_ids IS NOT NULL AND coalesce(cardinality(p_remove_ids), 0) > 0 THEN
      v_sync := public.iso_pro_delete_recebimentos(p_tenant_id, p_remove_ids);
      IF coalesce((v_sync ->> 'ok')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION '%', coalesce(v_sync ->> 'error', 'Falha ao apagar recebimentos.')
          USING ERRCODE = 'P0001';
      END IF;
    END IF;

    IF p_upsert IS NOT NULL THEN
      IF jsonb_typeof(p_upsert) <> 'array' THEN
        RAISE EXCEPTION 'ISO_PRO_RECEBIMENTOS_INVALID' USING ERRCODE = 'P0001';
      END IF;
      v_upsert := p_upsert;
      v_sync := public.iso_pro_upsert_recebimentos_lote(p_tenant_id, v_upsert);
      IF coalesce((v_sync ->> 'ok')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION '%', coalesce(v_sync ->> 'error', 'Falha ao gravar recebimentos (upsert).')
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  SELECT coalesce(jsonb_agg(doc ORDER BY ord), '[]'::jsonb)
  INTO v_arr
  FROM (
    SELECT
      r.id AS ord,
      jsonb_build_object(
        'id', r.id,
        'data', to_char(r.data_recebimento, 'YYYY-MM-DD'),
        'fornecedorNome', coalesce(r.fornecedor, ''),
        'nota', coalesce(r.nota_fiscal, ''),
        'romaneio', coalesce(r.romaneio, ''),
        'conferenteNome', coalesce(r.conferente, ''),
        'observacoes', coalesce(r.observacoes, ''),
        'modoRecebimento', coalesce(NULLIF(btrim(r.modo_recebimento), ''), 'direto'),
        'statusConferencia', CASE
          WHEN lower(btrim(coalesce(r.status, ''))) = 'conferido' THEN 'conferido'
          ELSE 'pendente'
        END,
        'dataConferencia', CASE
          WHEN r.data_conferencia IS NULL THEN NULL
          ELSE to_char(r.data_conferencia AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        END,
        'itens', coalesce((
          SELECT jsonb_agg(
            jsonb_build_object(
              'codigo', coalesce(i.codigo, ''),
              'descricao', coalesce(i.descricao, ''),
              'unidade', coalesce(NULLIF(btrim(i.unidade), ''), 'UN'),
              'disciplina', coalesce(i.disciplina, ''),
              'localizacao', coalesce(i.localizacao, ''),
              'certificado', coalesce(i.certificado, ''),
              'quantidade', coalesce(i.quantidade, 0),
              'quantidadeConferida', coalesce(i.quantidade_conferida, 0),
              'pesoUnitario', coalesce(i.peso_unitario, 0),
              'pesoTotal', coalesce(i.peso_total, 0),
              'observacaoItem', coalesce(i.observacao_item, '')
            )
            ORDER BY i.id
          )
          FROM public.iso_pro_recebimento_itens i
          WHERE i.tenant_id = r.tenant_id
            AND i.recebimento_id = r.id
        ), '[]'::jsonb)
      ) AS doc
    FROM public.iso_pro_recebimentos r
    WHERE r.tenant_id = p_tenant_id
  ) q;

  PERFORM set_config('iso_pro.skip_escala_outbox', 'on', true);
  BEGIN
    IF p_baseline IS NULL THEN
      INSERT INTO public.iso_pro_snapshot (id, tenant_id, payload, updated_at)
      VALUES (
        'default',
        p_tenant_id,
        jsonb_build_object('recebimentos', v_arr, 'dataAtualizacao', v_new),
        v_new
      )
      ON CONFLICT (id, tenant_id) DO UPDATE SET
        payload = coalesce(public.iso_pro_snapshot.payload, '{}'::jsonb)
          || jsonb_build_object('recebimentos', v_arr, 'dataAtualizacao', v_new),
        updated_at = v_new;
    ELSE
      UPDATE public.iso_pro_snapshot s
      SET
        payload = coalesce(s.payload, '{}'::jsonb)
          || jsonb_build_object('recebimentos', v_arr, 'dataAtualizacao', v_new),
        updated_at = v_new
      WHERE s.id = 'default' AND s.tenant_id = p_tenant_id AND s.updated_at = p_baseline;
      GET DIAGNOSTICS v_updated = ROW_COUNT;
      IF v_updated = 0 THEN
        RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_CONFLICT' USING ERRCODE = 'P0001';
      END IF;
    END IF;
    PERFORM set_config('iso_pro.skip_escala_outbox', 'off', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('iso_pro.skip_escala_outbox', 'off', true);
    RAISE;
  END;

  BEGIN
    PERFORM public.iso_pro_refresh_qty_recebida_por_codigo(p_tenant_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'iso_pro_refresh_qty_recebida_por_codigo falhou: %', SQLERRM;
  END;

  RETURN v_new;
END;
$$;

COMMENT ON FUNCTION public.iso_pro_write_recebimentos_sot(uuid, timestamptz, jsonb, text[], jsonb) IS
  'SoT recebimentos: tabelas + projecao do array a partir das tabelas + refresh qty. Nao le o payload inteiro.';

REVOKE ALL ON FUNCTION public.iso_pro_write_recebimentos_sot(uuid, timestamptz, jsonb, text[], jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_write_recebimentos_sot(uuid, timestamptz, jsonb, text[], jsonb)
  TO authenticated, service_role;

COMMIT;
