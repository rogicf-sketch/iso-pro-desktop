# Checklist — JWT onda 2 em LIVE (migration)

**Objectivo:** congelar em migration o REVOKE de `anon` nas writes, para `db push` não reabrir buraco.

**LIVE:** `ofeogtjydjdjrmrekebh` (`iso-pro-prod-sp`)  
**Rollback US:** `huvktaxsosxrfpvdigxq`  
**Migration:** `supabase/migrations/20260825100000_iso_pro_jwt_onda2_revoke_anon_writes.sql`  
**Rollback emergência:** `supabase/snippets/jwt_onda2_rollback_anon_ops.sql`  
**Peek:** continua `anon` (onda 2b depois)

## Pré-voo

| Item | Estado |
|------|--------|
| Web ≥ 0.1.247 / Setup PC ≥ 0.1.247 | Web **0.1.255** · Setup **0.1.255** (`release/installers/atuais/`) |
| Mobile campo ≥ 1.0.114 | APK **1.0.125** em `dist/android` + `C:\IPB\mob\dist\android` |
| Gateway Confirmar JWT-only | Feito 2026-08-12 |
| Snippet staging aplicado + smoke 42501 | Feito Ago/2026; reconfirmar com `jwt:onda2-smoke` |
| Janela ≥7d após revoke operacional | Cumprida (alvo era 2026-08-13; hoje ≥ 2026-08-25) |

## Aplicar

```powershell
cd iso-pro-desktop
npm run jwt:onda2-smoke
# Esperado: writes anon → 42501; peek anon OK

npx supabase link --project-ref ofeogtjydjdjrmrekebh --yes
npx supabase db push --yes
```

Ou colar o SQL da migration no SQL Editor do Dashboard LIVE.

## Verificar

```sql
SELECT proname, has_function_privilege('anon', oid, 'EXECUTE') AS anon_x
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN (
    'iso_pro_patch_snapshot',
    'iso_pro_submit_atendimento_comando',
    'iso_pro_peek_atendimento_comando',
    'iso_pro_write_documentos_sot',
    'iso_pro_write_materiais_sot',
    'iso_pro_submit_escala_domain_patch'
  );
-- Esperado: writes = false; peek = true
```

```powershell
npm run jwt:onda2-smoke
```

## Pós-aplicação

- [x] `db push` LIVE **2026-08-25** — migs `20260809010000` + `20260825100000` aplicadas
- [x] `jwt:onda2-smoke` LIVE OK (writes anon 42501 · peek anon ok) — pré e pós push
- [ ] Smoke login JWT + 1 write SoT (materiais ou RNC) no PC/web (humano)
- [ ] Smoke mobile: 1 atendimento ou conferência com sessão JWT (humano)
- [ ] **Não** REVOKE peek anon ainda (onda 2b)

## Não fazer

- Não aplicar rollback sem incidente real
- Não REVOKE `iso_pro_peek_atendimento_comando` de `anon` nesta onda
- Não `db push` com CLI linkado ao projecto US por engano
