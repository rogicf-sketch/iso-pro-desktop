# I.S.O PRO — Aplicar melhorias de segurança (pós-código)

## Estado (última execução automática)

- [x] `npx supabase db push` — migrações `20260604150000` (RLS) + `20260604160000` (Auth hook prep)
- [x] `npm run deploy:pdf-supabase` — `pdf_enqueue`, `pdf_status`, `pdf_cleanup` no projecto `huvktaxsosxrfpvdigxq`
- [ ] Validar no SQL Editor (`snippets/validar_pos_melhorias.sql`)
- [x] Instalador Windows `npm run dist:win` — `release/I.S.O PRO Setup 0.1.25.exe` + portable
- [ ] APK Campo 1.0.22 (`eas build --profile preview`) — falhou aqui por certificado SSL na rede; correr no seu PC
- [ ] Dashboard: activar Custom Access Token Hook (fase JWT)

Se precisar repetir no PowerShell:

```powershell
cd "c:\Sistema I.S.O PRO GESTÃO DE MATERIAIS\iso-pro-desktop"
npx supabase link --project-ref huvktaxsosxrfpvdigxq
npx supabase db push
npm run deploy:pdf-supabase
```

## SQL Editor (validação)

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

1. Dashboard → Authentication → Hooks → Custom Access Token → função `custom_access_token_hook`.
2. Associar utilizadores via `iso_pro_auth_membership` / Edge `iso_pro_link_auth_user`.
3. Migrar login desktop/mobile para `signInWithPassword` e políticas com `iso_pro_jwt_tenant_id()`.

## E2E login real (opcional)

```powershell
$env:ISO_PRO_E2E_LOGIN="admin"
$env:ISO_PRO_E2E_SENHA="..."
npm run test:e2e
```
