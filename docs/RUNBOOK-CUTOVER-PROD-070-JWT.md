# Cutover produção — migrações 070 + JWT onda 2

**Quando:** após janela staging ≥7 dias (alvo **2026-08-13**) e smoke campo OK.  
**Project prod:** `huvktaxsosxrfpvdigxq`  
**Não fazer:** push cego, revoke sem EXE/APK mínimos, revoke de `peek` (fica onda 2b).

## Pré-requisitos (já feitos — não repetir)

- [x] MFA TOTP em campo
- [x] PC obra ≥ **0.1.239** (instalador)
- [x] Mobile ≥ **1.0.113** (alvo **1.0.114**)
- [x] Staging: JWT onda 2 revoke + `jwt:onda2-smoke`
- [x] Staging: `20260807013000` (atendimento &lt;2s) + `20260807020000` (config SoT)

## Ordem no dia do cutover

### 1. Confirmar link CLI

```powershell
cd iso-pro-desktop
Get-Content supabase\.temp\project-ref
# deve ser huvktaxsosxrfpvdigxq antes de qualquer db push
npx supabase link --project-ref huvktaxsosxrfpvdigxq
```

### 2. Aplicar migrações (aprovação humana)

Só com OK explícito:

```powershell
npx supabase db push
```

Esperado incluir (se ainda não estiverem em prod):

- `20260807013000_iso_pro_atendimento_status_derivado_fast.sql`
- `20260807020000_iso_pro_write_configuracoes_sot.sql`
- `20260807030000_iso_pro_domain_events_daily_counts.sql`

### 3. Smoke pós-migração (antes do revoke)

- Login PC + 1 write SoT (ex.: material ou config alerta)
- Mobile: 1 baixa atendimento — latência &lt;2s típico (sem timeout 18s)
- Confirmar `_server_ms` / telemetria se disponível

### 4. JWT onda 2 em prod

Adaptar / colar o snippet staging (já inclui `iso_pro_write_configuracoes_sot`):

`supabase/snippets/jwt_onda2_revoke_anon_ops_staging.sql`

Manter:

- `iso_pro_peek_atendimento_comando` → **anon + authenticated**
- bootstrap login (`iso_pro_resolver_auth_email*`) intacto

Rollback: `jwt_onda2_rollback_anon_ops.sql`

### 5. Verificação SQL

```sql
SELECT proname, has_function_privilege('anon', oid, 'EXECUTE') AS anon_x
FROM pg_proc
WHERE proname IN (
  'iso_pro_patch_snapshot',
  'iso_pro_submit_atendimento_comando',
  'iso_pro_write_configuracoes_sot',
  'iso_pro_write_documentos_sot',
  'iso_pro_peek_atendimento_comando'
);
-- Esperado: writes/patch/submit = false; peek = true
```

```powershell
# .env apontando para prod (cuidado)
npm run jwt:onda2-smoke
```

### 6. Smoke campo pós-revoke

- PC: login + write + atendimento se aplicável
- Mobile: login JWT + 1 baixa + Finalizar
- Sem `permission denied` em writes autenticados

## Fora deste cutover

- Revoke peek anon (onda 2b) — só após telemetria sem fallback
- Authenticode / pen-test / DR drill — trilhas separadas
- Não pedir reinstalação MFA/PC se já estável em obra
