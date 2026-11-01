# JWT — endurecimento enterprise (pós-cutover)

**Estado prod (2026-07-24):** cutover principal **já feito**.

| Verificação | Resultado |
|-------------|-----------|
| `node scripts/verify-jwt-cutover.mjs` | OK — anon bloqueado em `iso_pro_autenticar_usuario` |
| `npm run jwt:auditar-link` | 2026-07-24: 2 activos, 2 `jwt_ready`, 0 `rpc_only` |
| Checklist go-live cutover | 2026-07-21 |
| MFA admin TOTP | **Confirmado 2026-07-24** — `admin@isopro.local` tem factor TOTP verificado (`npm run jwt:verificar-mfa-admin`). `ceci@isopro.local` sem MFA (opcional: Configurações → MFA). |
| Edge `iso_pro_admin_user` | 2026-07-24 — provisiona Auth no create |
| Release | Web+EXE **0.1.182**; mobile APK **1.0.91** (versionCode 92) |
| Checklist pós-cutover | `CHECKLIST-ATIVACAO-JWT.md` secção «Pós-cutover / enterprise» |

## Política anon vs authenticated

### MANTER (bootstrap)

| Função | Motivo |
|--------|--------|
| `iso_pro_resolver_auth_email_sessao` | Login: anon valida login/senha ISO PRO e devolve email Auth → `signInWithPassword` |
| (eventual) helpers de resolução Auth | Só se forem pré-requisito do login |

Sem estas RPCs com `EXECUTE` para `anon`, o browser não consegue iniciar o JWT.

### REVOGADO (cutover)

| Função | Estado |
|--------|--------|
| `iso_pro_autenticar_usuario` | `REVOKE EXECUTE … FROM anon` — não usar como login |

Rollback: [`jwt_cutover_rollback_anon.sql`](../supabase/snippets/jwt_cutover_rollback_anon.sql) — **só emergência**.

### CANDIDATOS a revogar (onda 2 — staging primeiro)

Escrita/leitura operacional ainda com `GRANT … TO anon` nas migrations (ex.: `iso_pro_patch_snapshot`, `iso_pro_submit_atendimento_comando`, listas). Com sessão JWT activa, o cliente usa role `authenticated`; o grant a `anon` é rede de segurança legada.

**Snippet staging:** [`jwt_onda2_revoke_anon_ops_staging.sql`](../supabase/snippets/jwt_onda2_revoke_anon_ops_staging.sql)  
**Rollback:** [`jwt_onda2_rollback_anon_ops.sql`](../supabase/snippets/jwt_onda2_rollback_anon_ops.sql)  
**Ops:** [`RUNBOOK-P0-OPS-TOP-MUNDIAL.md`](./RUNBOOK-P0-OPS-TOP-MUNDIAL.md) · checklist [`CHECKLIST-JWT-ONDA2-STAGING.md`](./CHECKLIST-JWT-ONDA2-STAGING.md)

**Staging (2026-08-06):** revoke anon em writes aplicado; peek ACK mantém anon. Janela 7 dias até **2026-08-13** antes de prod.

**Só revogar em massa em prod** quando:

1. Sentry `iso.auth_path` ≈ 100% `jwt` durante ≥7 dias  
2. Mobile e todos os PCs em versões com fail-closed  
3. Ensaio em staging com revoke alargado

Snippet de inventário: [`auditar_anon_execute_iso_pro.sql`](../supabase/snippets/auditar_anon_execute_iso_pro.sql).

## Comportamento da app (esta onda)

1. Utilizador **jwt_ready** + falha JWT → **login recusado** (sem `rpc_fallback` silencioso).
2. Utilizador **sem** `auth_user_id` → login recusado com mensagem para ligar Auth (modo strict; opt-out só com `VITE_ISO_PRO_JWT_AUTH=false` ou flag local).
3. Novos utilizadores: fluxo pede ligação Auth / aviso na UI se activo sem link.
4. MFA admin: activar via Configurações / script piloto; ver secção recuperação abaixo.

## MFA admin — activar agora

```powershell
cd iso-pro-desktop
$env:ISO_PRO_PILOTO_SENHA = "<senha do admin>"
# opcional: $env:ISO_PRO_PILOTO_EMAIL = "admin@isopro.local"
npm run jwt:ativar-mfa-piloto
```

O script grava o segredo TOTP em `release/` (gitignored) para importar no authenticator. Depois do enroll, login pede código MFA.

### Checklist P1 MFA (código)

| Item | Estado |
|------|--------|
| Gate enroll: login `admin`, perfil com `admin`, ou `administrar` em config/usuarios | OK |
| Fail-closed se `listFactors` falhar (admin nao entra sem MFA) | OK |
| Audit: `mfa_challenge_*`, `mfa_enroll_*`, `mfa_unenroll_blocked` | OK |
| Bloqueio remover ultimo factor verificado | OK |
| Mobile: admin sem TOTP → mensagem a pedir enroll no PC/web | OK |
| `npm run jwt:verificar-mfa-admin` | Ops (service role) |

### Recuperação (TI)

1. Dashboard → Authentication → Users → factor MFA → remover **ou**  
2. Outro admin com MFA restaura acesso  
3. **Não** reabrir `EXECUTE` anon em `iso_pro_autenticar_usuario`

## Comandos

```powershell
cd iso-pro-desktop
npm run jwt:auditar-link
npm run jwt:verificar-mfa-admin
node scripts/verify-jwt-cutover.mjs
# SQL Editor: snippets/auditar_anon_execute_iso_pro.sql
```
