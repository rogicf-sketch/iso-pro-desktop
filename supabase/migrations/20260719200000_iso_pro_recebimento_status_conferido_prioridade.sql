-- Preferir statusConferencia='conferido' do snapshot ao sincronizar para tabelas.
-- Antes: se o campo `status` ainda era 'aguardando_conferencia', o sync ignorava
-- statusConferencia e a NF continuava na lista pendente do mobile após finalizar.

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
  -- Conferência finalizada no app (mobile/PC) vence o status legado do payload.
  v_conf := lower(btrim(coalesce(p_status_conf, '')));
  IF v_conf = 'conferido' THEN
    RETURN 'conferido';
  END IF;

  v_app := lower(btrim(coalesce(p_status_app, '')));
  IF v_app IN (
    'rascunho', 'aguardando_conferencia', 'conferido',
    'parcialmente_conferido', 'divergente', 'cancelado'
  ) THEN
    RETURN v_app;
  END IF;

  v_modo := lower(btrim(coalesce(p_modo, 'direto')));
  IF v_modo = 'aguardando_conferencia' THEN
    RETURN 'aguardando_conferencia';
  END IF;
  RETURN 'conferido';
END;
$$;

COMMENT ON FUNCTION public.iso_pro_recebimento_status_from_snapshot(text, text, text) IS
  'Deriva status da tabela a partir do snapshot; statusConferencia=conferido tem prioridade.';
