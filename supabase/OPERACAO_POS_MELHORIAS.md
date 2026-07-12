# I.S.O PRO — Aplicar melhorias de segurança (pós-código)

## Estado (última execução automática)

- [x] `npx supabase db push` — migrações `20260604150000` (RLS) + `20260604160000` (Auth hook prep) + `20260607120000` (snapshot slices + RLS JWT híbrido)
- [x] `npm run deploy:pdf-supabase` — `pdf_enqueue`, `pdf_status`, `pdf_cleanup` no projecto `huvktaxsosxrfpvdigxq`
- [x] Validar no SQL Editor (`snippets/validar_pos_melhorias.sql`) — **2026-06-07 via CLI**: 10 funções OK; RLS `iso_pro_snapshot` ligado (6 policies); 0 memberships (esperado antes de ligar Auth)
- [x] Instalador Windows `npm run dist:win` — `release/I.S.O PRO Setup 0.1.25.exe` + portable
- [ ] APK Campo 1.0.22 (`eas build --profile preview`) — falhou aqui por certificado SSL na rede; correr no seu PC
- [x] Custom Access Token Hook — `npx supabase config push` (`custom_access_token_hook` activo em `huvktaxsosxrfpvdigxq`)

Se precisar repetir no PowerShell:

```powershell
cd "c:\Sistema I.S.O PRO GESTÃO DE MATERIAIS\iso-pro-desktop"
npx supabase link --project-ref huvktaxsosxrfpvdigxq
npx supabase db push
npx supabase config push --yes
npm run deploy:pdf-supabase
```

## SQL Editor (validação)

0. Descobrir tenant e utilizadores (substituir valores nos testes abaixo):
   ```sql
   SELECT id, slug, name
   FROM public.iso_pro_tenants
   ORDER BY created_at;

   SELECT
     u.tenant_id,
     u.id::text AS usuario_id,
     u.login,
     u.nome,
     u.ativo,
     pa.codigo AS perfil
   FROM public.usuarios_sistema AS u
   LEFT JOIN public.perfis_acesso AS pa
     ON pa.tenant_id = u.tenant_id
    AND pa.id::text = u.perfil_id::text
   WHERE coalesce(u.ativo, false) = true
   ORDER BY u.tenant_id, u.login;
   ```

1. Correr `supabase/snippets/auditar_rls_iso_pro.sql` — secção 4 deve mostrar **OK: tem policies** em `iso_pro_snapshot`.
2. Testar login:
   ```sql
   SELECT public.iso_pro_autenticar_usuario(
     '00000000-0000-0000-0000-000000000001'::uuid,
     'admin',
     'SUA_SENHA',
     'mobile'
   );
   ```
3. Testar refresh sem senha:
   ```sql
   SELECT public.iso_pro_refresh_usuario_sessao(
     '00000000-0000-0000-0000-000000000001'::uuid,
     'ID_DO_UTILIZADOR'
   );
   ```

## Mobile multi-empresa

- Por omissão: tenant `00000000-0000-0000-0000-000000000001`.
- Outra empresa no APK: EAS secret `EXPO_PUBLIC_ISO_PRO_TENANT_ID=<uuid>`.
- Várias empresas no mesmo build: lista no login (quando há mais de um registo em `iso_pro_tenants`).

## Supabase Auth (fase seguinte)

1. ~~Dashboard → Authentication → Hooks → Custom Access Token → função `custom_access_token_hook`.~~ **Feito** via `supabase/config.toml` + `npx supabase config push`.
2. Associar utilizadores via `iso_pro_auth_membership` / Edge `iso_pro_link_auth_user` (obrigatório antes de `signInWithPassword` — sem membership o hook devolve 403).
3. Migrar login desktop/mobile para `signInWithPassword` e políticas com `iso_pro_jwt_tenant_id()`.

**Nota:** O login actual (anon + RPC `iso_pro_autenticar_usuario`) **não é afectado** pelo hook; só entra em jogo quando existir sessão Supabase Auth.

### Estado actual (projecto `huvktaxsosxrfpvdigxq`)

| Item | Valor |
|------|-------|
| Tenants | 2 (`default` + `nova-empresa`) |
| Utilizadores activos | 3 (0 com `auth_user_id`) |
| `auth.users` | 0 |
| `iso_pro_auth_membership` | 0 |
| Edge `iso_pro_link_auth_user` | ACTIVE (v6) |

### Checklist — ligar um utilizador (quando migrar login)

1. **Dashboard → Edge Functions → Secrets** — confirmar `ISO_PRO_LINK_AUTH_SECRET` (valor longo aleatório).
2. **Configurações → Supabase e nuvem** — colar o mesmo segredo em «Segredo ligação Auth» e gravar.
3. **Dashboard → Authentication → Users → Add user** — criar conta (e-mail + senha); copiar o **UUID** do utilizador.
4. **Utilizadores** — editar o utilizador ISO PRO correspondente; painel «Supabase Auth (JWT / tenant)» → colar UUID → **Ligar**.
5. Confirmar na BD:
   ```sql
   SELECT auth_user_id FROM public.usuarios_sistema WHERE login = 'admin';
   SELECT * FROM public.iso_pro_auth_membership;
   ```
6. Só depois: testar `signInWithPassword` e verificar claim `tenant_id` no JWT (Authentication → Users → user → JWT ou logs do hook).

## E2E login real (opcional)

```powershell
$env:ISO_PRO_E2E_LOGIN="admin"
$env:ISO_PRO_E2E_SENHA="..."
npm run test:e2e
```
