# Cutover JWT-only (staging → produção)

**Nunca** aplicar o revoke em produção antes de staging verde.

## Pré-requisitos

1. Staging vivo (Restore to new project + `npm run staging:bootstrap` / `scripts/bootstrap-staging.ps1`)
2. `rpc_only = 0` activos (`npm run jwt:auditar-link` ou snippet `auditar_auth_link_cobertura.sql`)
3. Login JWT OK (web + mobile piloto) com `authPath=jwt`
4. Backup recente de produção

## Staging

1. SQL Editor do **staging** → executar [`jwt_cutover_revoke_anon_staging.sql`](../supabase/snippets/jwt_cutover_revoke_anon_staging.sql)
2. Confirmar `anon_execute = false`
3. Smoke login: conta JWT-ready entra; conta só RPC **deve falhar**
4. Se algo partir: [`jwt_cutover_rollback_anon.sql`](../supabase/snippets/jwt_cutover_rollback_anon.sql)

## Produção (só após staging OK)

1. Repetir o mesmo SQL no projecto **produção**
2. Monitorizar Sentry `iso.auth_path` e tickets de login 48–72h
3. Rollback imediato com o snippet de rollback se necessário

## Comandos úteis

```powershell
cd iso-pro-desktop
npm run jwt:auditar-link
npm run ops:smoke-diario
# Staging (apos Ref + anon key):
powershell -File scripts/bootstrap-staging.ps1 -ProjectRef <REF> -AnonKey "<key>"
```
