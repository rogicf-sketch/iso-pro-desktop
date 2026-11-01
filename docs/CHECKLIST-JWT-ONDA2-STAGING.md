# Checklist — JWT onda 2 (revoke anon em writes)

**Objectivo:** `anon` deixa de executar RPCs de escrita operacional; login bootstrap e peek ACK mantêm-se.

**NÃO aplicar em prod** sem esta checklist verde ≥7 dias em staging.

## Pré-requisitos

- [x] Cutover JWT login OK (`iso_pro_autenticar_usuario` sem anon)
- [x] Versões campo: PC ≥ 0.1.239 · mobile ≥ **1.0.113** (fail-closed JWT + outbox; APK alvo **1.0.114**)
- [x] Snippet: `supabase/snippets/jwt_onda2_revoke_anon_ops_staging.sql`
- [x] Rollback pronto: `jwt_onda2_rollback_anon_ops.sql`
- [x] Peek ACK **mantém** EXECUTE anon (fallback canteiro)
- [x] Clientes preferem JWT no peek; fallback anon se JWT falhar (PC + mobile)
- [x] **2026-08-12:** Gateway Confirmar **JWT-only** (fecha bypass Origin+anon → service_role). Peek Supabase continua anon até onda 2b. Projecto live renomeado `iso-pro-prod-sp`.

## Staging (`ofeogtjydjdjrmrekebh`)

| Passo | OK? | Data | Notas |
|-------|-----|------|-------|
| `supabase link --project-ref ofeogtjydjdjrmrekebh` | [x] | 2026-08-06 | |
| Aplicar snippet revoke (SQL Editor ou `db query`) | [x] | 2026-08-06 | peek mantido anon |
| Verificar `anon_x=false` em patch/submit/write_* | [x] | 2026-08-06 | patch, submit, escala, docs, rec, materiais |
| Verificar `anon_x=true` em `iso_pro_peek_atendimento_comando` | [x] | 2026-08-06 | |
| `npm run jwt:onda2-smoke` (anon bloqueado em writes) | [x] | 2026-08-06 | staging SP · reconfirmado noite · 42501 em writes · peek ok |
| Smoke: login JWT PC/web + 1 write SoT | [ ] | | apontar `.env` staging |
| Smoke: mobile login JWT + 1 atendimento ou conferência | [ ] | | |
| Monitorar 7 dias: `permission denied` / 401 em RPCs | [ ] | início: **2026-08-06** | janela até **2026-08-13** |

## Produção (`huvktaxsosxrfpvdigxq`) — só após staging OK

Runbook completo: **`docs/RUNBOOK-CUTOVER-PROD-070-JWT.md`** (migs `07013000`/`07020000` + revoke).

| Passo | OK? | Data | Notas |
|-------|-----|------|-------|
| Janela com rollback aberto | | | alvo ≥ **2026-08-13** |
| `db push` migrações 070 (se faltarem) | | | confirmar `project-ref` = prod |
| Aplicar mesmo revoke (incl. `write_configuracoes_sot`) | | | |
| Smoke prod login + write | | | |
| Re-link CLI para prod | | | |

## Comandos úteis

```powershell
cd iso-pro-desktop
# Smoke revoke (anon vs writes) — preferir URL staging no .env
npm run jwt:onda2-smoke

npx supabase link --project-ref ofeogtjydjdjrmrekebh
# Colar SQL do snippet no SQL Editor OU:
# npx supabase db query --linked -f supabase/snippets/jwt_onda2_revoke_anon_ops_staging.sql
npx supabase link --project-ref huvktaxsosxrfpvdigxq
```

### Peek JWT (pré-requisito para revoke anon no peek)

PC e mobile: `peekAtendimentoComandoConfirmado` tenta JWT primeiro; só cai em anon se a chamada JWT falhar.
Após telemetria estável (≥7d sem fallback), pode-se REVOKE peek de `anon` (onda 2b).

Verificação:

```sql
SELECT proname, has_function_privilege('anon', oid, 'EXECUTE') AS anon_x
FROM pg_proc
WHERE proname IN (
  'iso_pro_patch_snapshot',
  'iso_pro_submit_atendimento_comando',
  'iso_pro_peek_atendimento_comando',
  'iso_pro_write_documentos_sot',
  'iso_pro_write_recebimentos_sot',
  'iso_pro_submit_escala_domain_patch'
);
```
