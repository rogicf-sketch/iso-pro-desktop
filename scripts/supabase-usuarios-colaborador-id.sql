-- Vinculo opcional entre usuarios_sistema e colaborador (mesmo id do array `colaboradores` no snapshot ISO PRO).
-- Migração oficial: `supabase/migrations/20260503120000_iso_pro_usuarios_colaborador_id.sql` (preferir `supabase db push` / CI).
-- Este ficheiro mantém-se como referência rápida para SQL Editor manual.

ALTER TABLE usuarios_sistema ADD COLUMN IF NOT EXISTS colaborador_id text NULL;

COMMENT ON COLUMN usuarios_sistema.colaborador_id IS 'Id opcional do registo em colaboradores (snapshot); null para contas tecnicas ou externas.';

CREATE INDEX IF NOT EXISTS idx_usuarios_sistema_colaborador_id ON usuarios_sistema(colaborador_id) WHERE colaborador_id IS NOT NULL;
