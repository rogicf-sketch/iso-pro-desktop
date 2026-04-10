-- =============================================================================
-- I.S.O PRO — Coluna obrigatoria para cadastro de materiais na nuvem
-- =============================================================================
-- Se a importacao ou o salvamento falhar com:
--   Could not find the 'ativo' column of 'materiais' in the schema cache
-- execute este script no Supabase: SQL Editor → New query → Run.
--
-- A aplicacao desktop envia o campo "ativo" (boolean) em insert/update/select.
-- =============================================================================

ALTER TABLE public.materiais
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.materiais.ativo IS 'Material ativo no cadastro (filtros, atendimento, importacao CSV).';
