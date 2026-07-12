# Próximos passos — nível mundial (I.S.O PRO)

Estado actual (2026-07-12 noite): web **0.1.89**, mobile **1.0.61**,
Sentry + HaveIBeenPwned + backups + restauro + Deploy web + **RLS P0–P2 em prod**.

**Ops base (modelo híbrido): 10/10.** Restante intencional: auth RPC anon + `flush` outbox
até onda JWT-only.

---

## Fechado

| Item | Nota |
|------|------|
| Sentry DSN + deploy web | EU ingest |
| HaveIBeenPwned + min password 8 | Auth Email |
| Backups PHYSICAL diários | Confirmados |
| Restauro → new project + smoke | `iso-pro-staging-teste` apagado no mesmo dia |
| Pruning outbox / pg_cron | Migration |
| Security Advisor | 0 ERROR; triagem WARN documentada |

---

## Em aberto (ordem)

| # | Item | Quem | Doc |
|---|------|------|-----|
| 1 | **4 alertas Sentry `iso.*`** | **Feito** (1 alerta issue nova + notify) | `docs/CHECKLIST-ALERTAS-SENTRY.md` |
| 2 | Secrets GitHub smoke diário | **Feito** — run #3 verde | `docs/GUIA-SECRETS-SMOKE-GITHUB.md` |
| 3 | APK com Sentry | **Feito** — `1.0.61` (versionCode 62) + DSN baked | Downloads / `dist/android` |
| 4 | RLS P0 (legacy always-true + revoke ops) | **Feito** — `20260712010000` | `docs/TRIAGEM-SECURITY-ADVISOR.md` |
| 5 | CI/CD deploy web | **Feito** — Deploy web #3 verde | `docs/GUIA-DEPLOY-WEB-GITHUB.md` |
| 6 | RLS P1 (`mobile_logs` + outbox internas) | **Feito** — `20260712020000` | `docs/TRIAGEM-SECURITY-ADVISOR.md` |
| 7 | RLS P2 (enqueue* só service/trigger) | **Feito** — `20260712030000`; Actions checkout/setup-node **v5** | `docs/TRIAGEM-SECURITY-ADVISOR.md` |
| 8 | Alertas infra (disco/CPU) | **Feito** — revisto Compute and Disk (0,33/8 GB); sem toggle; email de quota do plano | `docs/GUIA-ALERTAS-INFRA-CLIQUES.md` |
| 9 | JWT-only (revogar auth RPC anon) | Epic — **PR1 feito**: login prefer JWT + fallback RPC + audit `authPath`; migration `20260712120000` (resolver devolve `user`). Revogar anon só após Auth 100% + staging | `docs/TRIAGEM-SECURITY-ADVISOR.md` |
| 10 | **Leitura SWR** (cache já + nuvem fundo) | **Feito** — prefer 450ms; inventário/materiais + withLocalFallback; Deploy `web-v0.1.90` | UX campo |
| 11 | Concorrência inventário/materiais offline | **Feito** — mergeKeys + merge itens (max) + keep-cloud saldo | Estoque obra grande |
| 12 | Stress 2× offline mesmo SKU | **Feito** — suite `offlineConcurrency.stress.test.ts` | Teste / checklist |

Performance Advisor: 72× `multiple_permissive_policies` — esperado; não bloquear.

---

## Comandos úteis

```powershell
npm run sentry:smoke-test
npm run ops:smoke-diario
npm run ops:abrir-dashboards
```
