# P2 — eventos de domínio (embrionário)

Status (2026-08-05): **não é Kafka/CQRS**. É um log append-only para futuros read models / webhooks com contrato.

## O que existe

| Peça | Onde |
|------|------|
| Tabela `iso_pro_domain_events` | migração `20260806010000` |
| RPC `iso_pro_append_domain_event` | mesma migração |
| RPC `iso_pro_list_domain_events` | migração `20260806020000` |
| RPC `iso_pro_domain_events_daily_counts` | migração `20260807030000` (rollup 30d) |
| Catálogo TypeScript | `src/lib/domainEvents.ts` |
| Espelho a partir da auditoria P1 | `appendDomainEventFromAuditBestEffort` em `authAudit.service` |
| Leitura cliente | `listDomainEvents` + `listDomainEventsDailyCounts` |
| Smoke ops | `npm run domain-events:smoke` |
| UI Usuários | aba **Eventos de dominio** (lista + rollup totais 30d) |

Eventos iniciais: recebimento/documento/inventário/material/atendimento/rir (os que já têm audit before/after).

## Smoke

```powershell
cd iso-pro-desktop
npm run domain-events:smoke
```

Exit 0 = RPC OK. Se `_count=0`, gera 1 write na app (ex. editar material) e re-corre.  
Tenant: default `00000000-0000-0000-0000-000000000001` ou `ISO_PRO_SMOKE_TENANT_ID` / `ISO_PRO_E2E_TENANT_ID`.

Migração `list`/`append` aplicada em **prod** e **staging SP**.  
`daily_counts` (`20260807030000`) — aplicar com `db push` (staging primeiro; prod no cutover 070).

## O que **não** fazer ainda

- Kafka, K8s, OpenSearch, BPM
- API pública / webhooks outbound (precisa contrato comercial com o cliente)
- Reprocessamento completo tipo EventStore

## Próximos passos P2

1. ~~Read model / contagens a partir de `iso_pro_domain_events`~~ **feito** (RPC daily_counts + UI strip)
2. Webhook assinado por evento (só com contrato)
3. Projecções por tenant mais finas (se BI pedir)