# Checklist — alertas de infraestrutura Supabase

O **Sentry** cobre erros da app (`iso.*`). Este checklist cobre **limites do projecto** (CPU, disco, pool).

Projecto prod: `huvktaxsosxrfpvdigxq`  
Dashboard: https://supabase.com/dashboard/project/huvktaxsosxrfpvdigxq

Links directos (2026):
- Backups: `/database/backups/scheduled`
- Infra / usage: `/settings/infrastructure`
- Reports DB: `/reports/database`
- Advisors: `/advisors/security` e `/advisors/performance`
- Abrir lote: `npm run ops:abrir-dashboards`

---

## Alertas a activar (painel)

| # | Métrica | Onde olhar | Limiar sugerido | Canal | OK? | Data |
|---|---------|------------|-----------------|-------|-----|------|
| 1 | Disk usage | Settings → Infrastructure | ≥ 80% | email org | [ ] | |
| 2 | CPU | Settings → Infrastructure / Reports | ≥ 80% sustentado | email org | [ ] | |
| 3 | Memory | Settings → Infrastructure | ≥ 80% | email org | [ ] | |
| 4 | Connection pool | Database → Settings (pooling) + Reports | ≥ 80% do limite | email org | [ ] | |
| 5 | Advisors críticos | Advisors → Security / Performance | resolver ou aceitar risco | — | [x] | 2026-07-11: 0 ERROR; triagem em `docs/TRIAGEM-SECURITY-ADVISOR.md` |

Nota: no plano Pro/Team, notificações de organização (Organization → Notifications / Billing alerts) cobrem uso/limites. Confirma email do owner no Settings da org.
---

## Complemento app (já no código)

| Evento Sentry | Quando |
|---------------|--------|
| `iso.snapshot_conflict` | Conflito OCC |
| `iso.dual_write_failure` | Falha escala / outbox flush |
| `iso.offline_flush` | Fila mobile |
| `iso.sentry_smoke_test` | Botão teste em Configurações |

Sem DSN: só console + SLO local 24h no Painel.

---

## Retenção DB (pruning)

Migration: `20260711160000_iso_pro_retencao_outbox_comandos.sql`

```sql
-- Manual (service role / SQL Editor):
SELECT public.iso_pro_prune_retencao_ops(30);
```

Se `pg_cron` estiver activo no projecto, o job diário `iso_pro_prune_retencao_ops_daily` (04:15 UTC) é criado pela migration.

---

## Revisão

| Frequência | Acção |
|------------|--------|
| Semanal | Olhar usage + outbox failed no Painel |
| Mensal | Confirmar alertas ainda activos |
| Trimestral | Restauro formal (`docs/CHECKLIST-RESTAURO-BACKUP.md`) |

Assinatura / data: _________________________
