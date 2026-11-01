-- Promover (ou remover) super-admin de plataforma no tenant default.
-- Correr no SQL Editor do projecto Supabase se a migração não tiver apanhado o teu login.

-- Ver quem já tem a flag:
-- select login, ativo, plataforma_super_admin
-- from public.usuarios_sistema
-- where tenant_id = '00000000-0000-0000-0000-000000000001';

update public.usuarios_sistema
set plataforma_super_admin = true
where tenant_id = '00000000-0000-0000-0000-000000000001'
  and lower(login) = lower('administrador')  -- <-- altera para o teu login
  and ativo is true;
