-- P0 escala: contagens leves (Painel/badges) + lista de pendentes para Atendimento PC
-- sem hidratar documentos[] completo do snapshot.

BEGIN;

-- ---------- Contagens operacionais (1 round-trip) ----------
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
    '_sourceDocs', v_source_docs
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_operacao_contagens(uuid) IS
  'Contagens leves para Painel e badges — sem devolver arrays completos.';

REVOKE ALL ON FUNCTION public.iso_pro_operacao_contagens(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_operacao_contagens(uuid) TO anon, authenticated;

-- ---------- Soma atendida por codigo (saldo sem documentos[]) ----------
CREATE OR REPLACE FUNCTION public.iso_pro_sum_quantidade_atendida_por_codigo(
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_map jsonb := '{}'::jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  IF NOT public.iso_pro_documentos_tabelas_ativas(p_tenant_id) THEN
    RETURN jsonb_build_object('porCodigo', '{}'::jsonb, '_source', 'empty');
  END IF;

  SELECT coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
  INTO v_map
  FROM (
    SELECT
      lower(btrim(coalesce(i.codigo, ''))) AS k,
      sum(coalesce(i.quantidade_atendida, 0))::numeric AS v
    FROM public.iso_pro_documento_itens_planejamento i
    WHERE i.tenant_id = p_tenant_id
      AND btrim(coalesce(i.codigo, '')) <> ''
    GROUP BY 1
  ) s;

  RETURN jsonb_build_object('porCodigo', v_map, '_source', 'tables');
END;
$$;

REVOKE ALL ON FUNCTION public.iso_pro_sum_quantidade_atendida_por_codigo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_sum_quantidade_atendida_por_codigo(uuid) TO anon, authenticated;

-- ---------- Pendentes para Atendimento PC (so linhas com saldo) ----------
CREATE OR REPLACE FUNCTION public.iso_pro_list_documentos_pendentes_atendimento(
  p_tenant_id uuid,
  p_busca text DEFAULT NULL,
  p_limit int DEFAULT 2000
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_q text;
  v_lim int;
  v_docs jsonb;
  v_total int := 0;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  v_q := lower(btrim(coalesce(p_busca, '')));
  v_lim := LEAST(GREATEST(coalesce(p_limit, 2000), 1), 5000);

  IF NOT public.iso_pro_documentos_tabelas_ativas(p_tenant_id) THEN
    RETURN jsonb_build_object(
      'documentos', '[]'::jsonb,
      'total', 0,
      '_source', 'snapshot',
      '_hint', 'Tabelas de documentos inactivas.'
    );
  END IF;

  WITH pend_itens AS (
    SELECT
      i.documento_id,
      i.id,
      i.codigo,
      i.descricao,
      i.unidade,
      i.quantidade,
      i.quantidade_atendida,
      (i.quantidade - i.quantidade_atendida) AS pendente
    FROM public.iso_pro_documento_itens_planejamento i
    WHERE i.tenant_id = p_tenant_id
      AND coalesce(i.quantidade, 0) > coalesce(i.quantidade_atendida, 0) + 1e-9
  ),
  docs_base AS (
    SELECT d.*
    FROM public.iso_pro_documentos_planejamento d
    WHERE d.tenant_id = p_tenant_id
      AND lower(btrim(coalesce(d.status, ''))) <> 'cancelado'
      AND EXISTS (SELECT 1 FROM pend_itens p WHERE p.documento_id = d.id)
      AND (
        v_q = ''
        OR lower(btrim(d.numero)) LIKE '%' || v_q || '%'
        OR lower(btrim(coalesce(d.descricao, ''))) LIKE '%' || v_q || '%'
        OR lower(btrim(coalesce(d.revisao, ''))) LIKE '%' || v_q || '%'
      )
  ),
  counted AS (
    SELECT count(*)::int AS c FROM docs_base
  ),
  page AS (
    SELECT d.*
    FROM docs_base d
    ORDER BY lower(btrim(d.numero)), lower(btrim(d.revisao))
    LIMIT v_lim
  )
  SELECT
    (SELECT c FROM counted),
    coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', d.id,
            'numero', d.numero,
            'revisao', d.revisao,
            'descricao', coalesce(d.descricao, ''),
            'responsavel', coalesce(d.responsavel, ''),
            'status', public.iso_pro_documento_status_derivado(p_tenant_id, d.id, d.status),
            'itens', coalesce(
              (
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'id', p.id,
                    'codigo', coalesce(p.codigo, ''),
                    'descricao', coalesce(p.descricao, ''),
                    'unidade', coalesce(p.unidade, 'UN'),
                    'quantidade', p.quantidade,
                    'quantidadeAtendida', p.quantidade_atendida
                  )
                  ORDER BY lower(btrim(coalesce(p.codigo, ''))), p.id
                )
                FROM pend_itens p
                WHERE p.documento_id = d.id
              ),
              '[]'::jsonb
            )
          )
          ORDER BY lower(btrim(d.numero)), lower(btrim(d.revisao))
        )
        FROM page d
      ),
      '[]'::jsonb
    )
  INTO v_total, v_docs;

  RETURN jsonb_build_object(
    'documentos', coalesce(v_docs, '[]'::jsonb),
    'total', coalesce(v_total, 0),
    'limit', v_lim,
    'truncated', coalesce(v_total, 0) > v_lim,
    '_source', 'tables'
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_list_documentos_pendentes_atendimento(uuid, text, int) IS
  'Documentos com linhas pendentes para Atendimento PC — sem snapshot documentos[].';

REVOKE ALL ON FUNCTION public.iso_pro_list_documentos_pendentes_atendimento(uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_list_documentos_pendentes_atendimento(uuid, text, int) TO anon, authenticated;

COMMIT;
