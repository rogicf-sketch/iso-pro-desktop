-- Remove indice legado UNIQUE(lower(codigo)) sem tenant_id.
-- Impedia o mesmo codigo de material em empresas diferentes (multi-tenant).
-- A unicidade correcta e materiais_tenant_id_codigo_lower_uidx.

DROP INDEX IF EXISTS public.materiais_codigo_lower_idx;

-- Garantir indice por tenant (idempotente).
CREATE UNIQUE INDEX IF NOT EXISTS materiais_tenant_id_codigo_lower_uidx
  ON public.materiais (tenant_id, lower(trim(codigo)));
