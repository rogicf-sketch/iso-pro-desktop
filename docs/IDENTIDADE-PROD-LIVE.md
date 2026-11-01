# Identidade operacional — Source of Truth (2026-08-31)

| Papel | Ref | Notas |
|---|---|---|
| **LIVE (producao)** | `ofeogtjydjdjrmrekebh` | Nome Dashboard: **iso-pro-prod-sp**. Site, gateway, pdf-worker, `.env` |
| **Rollback US** | `huvktaxsosxrfpvdigxq` | So emergencia; nao escrever / nao load-test |
| **Staging load** | `sacaiokhqhegvtpzlpkf` | `iso-pro-staging-load` · sa-east-1 · ensaio / write stress |
| **Staging legado** | `vghbcwkvmmihakunvwqw` | **Removido** (API 400) — nao usar |

Travas no codigo:

- `scripts/iso-pro-project-identity.mjs` — deploy/build exige LIVE
- `scripts/load-test-staging-guard.mjs` — load-test **recusa** LIVE e rollback; permite staging load (+ legado se voltar)
- `scripts/purge-load-test-atendimentos.mjs` — limpa ATD-LOAD da LIVE
- `.env.staging` / `.env.production` gitignored
