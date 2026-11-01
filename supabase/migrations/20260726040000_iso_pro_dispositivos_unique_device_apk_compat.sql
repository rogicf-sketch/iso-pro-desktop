-- Compatibilidade APK mobile actual: unique global em device_id.
--
-- Apos 20260726030000 (unique por tenant), o APK 1.0.92 ainda faz
-- upsert onConflict='device_id'. Sem unique global o upsert falha → o app
-- fica em «Aguardando autorizacao» mesmo com autorizado=true na Construcap.
--
-- Estrategia: consolidar duplicados (fica a linha mais recente / autorizada)
-- e voltar UNIQUE(device_id) ate o proximo APK usar RPC / (tenant_id, device_id).

BEGIN;

-- Preferir linha autorizada; empate: updated_at mais recente.
WITH ranked AS (
  SELECT
    id,
    device_id,
    ROW_NUMBER() OVER (
      PARTITION BY device_id
      ORDER BY
        CASE WHEN autorizado AND NOT bloqueado THEN 0 WHEN autorizado THEN 1 ELSE 2 END,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST
    ) AS rn
  FROM public.dispositivos_mobile
)
DELETE FROM public.dispositivos_mobile d
USING ranked r
WHERE d.id = r.id AND r.rn > 1;

DROP INDEX IF EXISTS public.dispositivos_mobile_tenant_device_uidx;

-- Remover unique (tenant_id, device_id) se existir como constraint
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'dispositivos_mobile'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) ILIKE '%tenant_id%'
      AND pg_get_constraintdef(c.oid) ILIKE '%device_id%'
  LOOP
    EXECUTE format('ALTER TABLE public.dispositivos_mobile DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS dispositivos_mobile_device_id_uidx
  ON public.dispositivos_mobile (device_id);

-- Garantir que o aparelho do incidente Construcap fica na Construcap e autorizado
-- (se ainda existir so na principal, move; se ja na Construcap, ok).
UPDATE public.dispositivos_mobile
SET
  tenant_id = '0bc5de18-4301-48b5-880a-a35a8e0f0539',
  autorizado = true,
  bloqueado = false,
  updated_at = now()
WHERE device_id = '1784850834311-596836dc64f81';

COMMIT;
