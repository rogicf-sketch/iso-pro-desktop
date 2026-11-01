# Próximos passos P0→P1 (execução)

Actualizado: **2026-08-06**. Ordem acordada: fechar fiabilidade de campo antes de API/P2.

## Feito nesta sessão (código / staging)

- [x] Atendimento staging &lt;2s (migração `20260807013000` + invariantes CI)
- [x] APK **1.0.114** (timeout + peek ACK)
- [x] Docs alinhados a PC **0.1.239** / mobile **≥1.0.113** (alvo **1.0.114**)
- [x] `jwt:onda2-smoke` contra staging SP (revoke anon writes OK)
- [x] Checklist campo: MFA + PC obra marcados **já feitos** (não repetir)
- [x] Regra Cursor `nao-refazer-ja-feito.mdc`
- [x] SoT configuracoes (`iso_pro_write_configuracoes_sot`) — staging 2026-08-06
- [x] Sentry Electron main (`sentryMain.ts`)
- [x] Remoção ramos `commitIsoProSnapshotPatch` nos services + gate CI
- [x] Runbook cutover prod: `docs/RUNBOOK-CUTOVER-PROD-070-JWT.md`
- [x] P2 rollup `iso_pro_domain_events_daily_counts` + UI strip (mig `20260807030000`)
- [x] Auditoria atendimento `before`/`after` (linhas qAtendida + path local)

## Agora — só o que ainda é novo

1. ~~MFA / reinstalar PC~~ — **não** (já em produção)
2. Janela JWT até **2026-08-13** → seguir `RUNBOOK-CUTOVER-PROD-070-JWT.md` (migs 070 + revoke)
3. Prod: perf atendimento + write configuracoes + daily_counts (já em código; staging push quando aprovares)
4. ~~Limpezas SoT / Sentry / legado / P2 rollup / audit atendimento~~ — **feito**

## Depois (código, sem virar SAP)

| # | Pacote | Nota |
|---|--------|------|
| A | ~~Config alerta stock sem `patch_snapshot`~~ | Feito |
| B | ~~Remover ramos legado mortos nos services~~ | Feito + CI |
| C | ~~Sentry Electron main~~ | Feito |
| D | ~~P2 read model fino a partir de `domain_events`~~ | Feito (daily_counts) |
| E | Webhooks assinados | Só com contrato cliente |

## Não fazer agora

OpenSearch · SSO · Kafka · K8s multi-região · BPM · IA genérica.
