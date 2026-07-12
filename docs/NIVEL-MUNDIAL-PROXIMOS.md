# Próximos passos — nível mundial (I.S.O PRO)

Estado actual (2026-07-11 noite): web **0.1.89**, mobile **1.0.60**,
Sentry DSN + HaveIBeenPwned + backups + **restauro formal OK** (staging apagado),
search_path hardening, smoke prod/staging OK.

Maturidade estimada: **~9,7/10** (fecho 10/10 ops: APK Sentry → CD web → RLS cirúrgico).

Ordem activa: **1 APK+Sentry** → 2 CI/CD web → 3 RLS.

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
| 4 | Apertar RLS/RPC anon | Onda futura + staging pago ou teste curto | `docs/TRIAGEM-SECURITY-ADVISOR.md` |
| 5 | CI/CD deploy auto | **Parcial** — workflow `Deploy web` no GitHub; falta secrets SSH + Sentry DSN | `docs/GUIA-DEPLOY-WEB-GITHUB.md` |

Performance Advisor: 72× `multiple_permissive_policies` — esperado; não bloquear.

---

## Comandos úteis

```powershell
npm run sentry:smoke-test
npm run ops:smoke-diario
npm run ops:abrir-dashboards
```
