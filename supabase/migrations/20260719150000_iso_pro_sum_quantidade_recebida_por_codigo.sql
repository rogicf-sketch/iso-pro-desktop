-- Saldo recebido por codigo agregado no servidor (a partir do snapshot).
-- Motivo: o Atendimento PC baixava a fatia `recebimentos` (~1 MB nesta obra) a cada
-- bipe do leitor e na gravacao da retirada so para somar quantidades por codigo.
-- Esta RPC devolve o mapa pronto (~KB) com as MESMAS regras do buildSaldoMap do cliente:
--   * recebimento com status 'cancelado' nao conta;
--   * modo 'direto' → soma `quantidade`;
--   * modo 'aguardando_conferencia' → soma `quantidadeConferida` apenas se conferido.

-- Conversao segura de texto jsonb para numeric (payload vem do app; garbage vira 0).
CREATE OR REPLACE FUNCTION public.iso_pro_num_or_zero(p_text text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_text ~ '^\s*-?[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?\s*$' THEN btrim(p_text)::numeric
    ELSE 0
  END;
$$;

REVOKE ALL ON FUNCTION public.iso_pro_num_or_zero(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_num_or_zero(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.iso_pro_sum_quantidade_recebida_por_codigo(
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
  v_map jsonb := '{}'::jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  SELECT s.payload
  INTO v_payload
  FROM public.iso_pro_snapshot AS s
  WHERE s.id = 'default'
    AND s.tenant_id = p_tenant_id;

  IF v_payload IS NULL THEN
    RETURN jsonb_build_object('porCodigo', '{}'::jsonb, '_source', 'empty');
  END IF;

  SELECT coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
  INTO v_map
  FROM (
    SELECT linhas.k, sum(linhas.q)::numeric AS v
    FROM (
      SELECT
        lower(btrim(coalesce(
          item ->> 'codigo',
          item ->> 'codigo_material',
          item ->> 'codigoMaterial',
          ''
        ))) AS k,
        CASE
          WHEN regexp_replace(
                 lower(btrim(coalesce(rec ->> 'modoRecebimento', rec ->> 'modo_recebimento', 'direto'))),
                 '\s+', '_', 'g'
               ) IN ('aguardando_conferencia', 'conferencia', 'aguardando')
          THEN CASE
            WHEN lower(btrim(coalesce(rec ->> 'statusConferencia', rec ->> 'status_conferencia', ''))) = 'conferido'
            THEN public.iso_pro_num_or_zero(coalesce(
                   item ->> 'quantidadeConferida',
                   item ->> 'quantidade_conferida',
                   '0'
                 ))
            ELSE 0
          END
          ELSE public.iso_pro_num_or_zero(coalesce(
                 item ->> 'quantidade',
                 item ->> 'quantidade_recebida',
                 item ->> 'quantidadeRecebida',
                 item ->> 'qtd',
                 '0'
               ))
        END AS q
      FROM jsonb_array_elements(coalesce(v_payload -> 'recebimentos', '[]'::jsonb)) AS rec
      CROSS JOIN LATERAL jsonb_array_elements(coalesce(rec -> 'itens', '[]'::jsonb)) AS item
      WHERE lower(btrim(coalesce(rec ->> 'status', ''))) <> 'cancelado'
    ) AS linhas
    WHERE linhas.k <> ''
    GROUP BY linhas.k
  ) AS s;

  RETURN jsonb_build_object('porCodigo', v_map, '_source', 'snapshot');
END;
$$;

COMMENT ON FUNCTION public.iso_pro_sum_quantidade_recebida_por_codigo(uuid) IS
  'Mapa codigo → quantidade recebida (regras do buildSaldoMap), agregado no servidor para o Atendimento nao baixar recebimentos[].';

REVOKE ALL ON FUNCTION public.iso_pro_sum_quantidade_recebida_por_codigo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_sum_quantidade_recebida_por_codigo(uuid) TO anon, authenticated;
