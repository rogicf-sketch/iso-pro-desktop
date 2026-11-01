-- Backfill: um lote por (tenant, numero) — evita choque UNIQUE numero com 2 sessões mobile no mesmo ATD.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    WITH cmds AS (
      SELECT tenant_id, payload, created_at
      FROM public.iso_pro_atendimento_comandos
      WHERE created_at > now() - interval '7 days'
        AND payload ? 'atendimentoLotes'
        AND jsonb_typeof(payload->'atendimentoLotes') = 'array'
        AND jsonb_array_length(payload->'atendimentoLotes') > 0
    ),
    lotes_src AS (
      SELECT DISTINCT ON (tenant_id, numero)
        c.tenant_id,
        coalesce(l.elem->>'id', '') AS lote_id,
        coalesce(nullif(btrim(l.elem->>'numero'), ''), coalesce(l.elem->>'id', '')) AS numero,
        coalesce(nullif(btrim(l.elem->>'atendente'), ''), '') AS atendente,
        coalesce(nullif(btrim(l.elem->>'matricula'), ''), '') AS atendente_matricula,
        coalesce(nullif(btrim(l.elem->>'atendenteFuncao'), ''), '') AS atendente_funcao,
        coalesce(nullif(btrim(l.elem->>'recebedor'), ''), '') AS recebedor,
        coalesce(nullif(btrim(l.elem->>'recebedorMatricula'), ''), '') AS recebedor_matricula,
        coalesce(nullif(btrim(l.elem->>'recebedorFuncao'), ''), '') AS recebedor_funcao,
        coalesce(nullif(btrim(l.elem->>'data'), ''), c.created_at::text) AS data_atendimento,
        coalesce(nullif(btrim(l.elem->>'documento'), ''), 'MULTIPLOS') AS documento_numero
      FROM cmds c
      CROSS JOIN LATERAL jsonb_array_elements(c.payload->'atendimentoLotes') AS l(elem)
      WHERE coalesce(l.elem->>'id', '') <> ''
        AND coalesce(nullif(btrim(l.elem->>'numero'), ''), '') <> ''
      ORDER BY tenant_id, numero, c.created_at DESC
    ),
    hist_agg AS (
      SELECT
        c.tenant_id,
        coalesce(nullif(btrim(h.elem->>'loteNumero'), ''), '') AS numero,
        jsonb_agg(
          jsonb_build_object(
            'id', c.tenant_id::text || '-h-' || coalesce(h.elem->>'id', gen_random_uuid()::text),
            'documentoItemId', coalesce(h.elem->>'documentoItemId', h.elem->>'id', ''),
            'codigoMaterial', coalesce(h.elem->>'codigo', ''),
            'descricaoMaterial', coalesce(h.elem->>'descricao', ''),
            'unidade', coalesce(h.elem->>'unidade', 'UN'),
            'quantidadeAtendida', coalesce((h.elem->>'quantidade')::numeric, 0),
            'documentoNumero', coalesce(h.elem->>'documento', '')
          )
          ORDER BY h.elem->>'id'
        ) AS itens,
        max(coalesce(h.elem->>'documento', ''))
          FILTER (WHERE coalesce(h.elem->>'documento', '') <> '') AS um_doc
      FROM public.iso_pro_atendimento_comandos c
      CROSS JOIN LATERAL jsonb_array_elements(
        coalesce(c.payload->'atendimentoHistorico', '[]'::jsonb)
      ) AS h(elem)
      WHERE c.created_at > now() - interval '7 days'
        AND coalesce(nullif(btrim(h.elem->>'loteNumero'), ''), '') <> ''
      GROUP BY 1, 2
    ),
    atend_json AS (
      SELECT
        ls.tenant_id,
        jsonb_agg(
          jsonb_build_object(
            'id', ls.lote_id,
            'numero', ls.numero,
            'documentoId', '',
            'documentoNumero',
              CASE
                WHEN ls.documento_numero IN ('', 'MULTIPLOS') THEN coalesce(ha.um_doc, 'MULTIPLOS')
                ELSE ls.documento_numero
              END,
            'atendente', ls.atendente,
            'atendenteMatricula', ls.atendente_matricula,
            'atendenteFuncao', ls.atendente_funcao,
            'recebedorTipo', 'interno',
            'recebedor', ls.recebedor,
            'recebedorMatricula', ls.recebedor_matricula,
            'recebedorFuncao', ls.recebedor_funcao,
            'origem', 'mobile',
            'status', 'concluido',
            'dataAtendimento', ls.data_atendimento,
            'itens', coalesce(ha.itens, '[]'::jsonb)
          )
        ) AS arr,
        count(*)::int AS n
      FROM lotes_src ls
      LEFT JOIN hist_agg ha
        ON ha.tenant_id = ls.tenant_id AND ha.numero = ls.numero
      GROUP BY ls.tenant_id
    )
    SELECT tenant_id, arr, n FROM atend_json
  LOOP
    PERFORM public.iso_pro_upsert_atendimento_lotes_from_json(r.tenant_id, r.arr);
    RAISE NOTICE 'backfill tenant % → % lotes', r.tenant_id, r.n;
  END LOOP;
END $$;

SELECT numero, origem, left(recebedor, 40) AS recebedor, data_atendimento
FROM public.iso_pro_atendimento_lotes
WHERE data_atendimento::date = current_date
  AND origem = 'mobile'
ORDER BY data_atendimento DESC
LIMIT 20;
