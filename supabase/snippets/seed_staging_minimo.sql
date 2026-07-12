-- Seed mínimo para projecto STAGING (não correr em produção).
-- Pré-requisito: `npm run staging:link` + `npx supabase db push`.
--
-- Tenant UUID alinhado ao default das apps:
--   00000000-0000-0000-0000-000000000001

insert into public.iso_pro_tenants (id, slug, name)
values (
  '00000000-0000-0000-0000-000000000001',
  'staging',
  'Staging I.S.O PRO'
)
on conflict (id) do update
set slug = excluded.slug,
    name = excluded.name;

-- Snapshot vazio (se a linha default ainda não existir):
-- insert into public.iso_pro_snapshot (id, tenant_id, payload, updated_at)
-- values (
--   'default',
--   '00000000-0000-0000-0000-000000000001',
--   '{}'::jsonb,
--   now()
-- )
-- on conflict (id) do nothing;

-- Depois no Dashboard:
-- 1) Authentication → criar user admin@isopro.local
-- 2) Seguir CHECKLIST-ATIVACAO-JWT.md (membership + piloto)
-- 3) MFA enroll no PC com .env.staging
;
