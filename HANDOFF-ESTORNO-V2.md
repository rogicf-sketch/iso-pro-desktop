# Handoff — Estorno Transacional V2 (iso-pro-desktop)

Cola isto num **chat Agent novo** (Composer) para continuar com contexto leve.

## Estado atual (2026-07-18)

- **Repo:** `iso-pro-desktop` · branch `main`
- **Versão / tag web:** `0.1.116` · `web-v0.1.116` (push feito; deploy deve estar a correr ou verde)
- **SQL produção (Supabase):** migrations V2 aplicadas com Success:
  - `20260719040000_iso_pro_estorno_v2_guardrails.sql`
  - `20260719050000_iso_pro_estornar_atendimento_v2.sql`
  - `20260719060000_iso_pro_estorno_v2_snapshot_projection_only.sql`
- **SoT:** tabelas de planejamento / lotes V2; snapshot + coluna `documentos` = projeção/cache

## O que foi entregue

1. Guardrails: sync não ressuscita `quantidade_atendida`; patch/outbox na coluna; cliente sem `Math.max` quando `_source=tables`
2. RPC `iso_pro_estornar_atendimento_v2` — transação, locks, chave idempotente estável, resultado autoritativo
3. Cliente: `estornoAtendimentoV2.ts`, flag `VITE_ISO_PRO_ESTORNO_V2` (default ON), fallback se RPC faltar
4. UI: cache incremental pós-estorno (sem `load()` bloqueante); retry timeout com mesma chave (confirmação tardia); RTT via `performance.now()`
5. Leituras pós-split: `iso_pro_read_documento_planejamento` / pendência usam coluna via `iso_pro_snapshot_documentos_arr`
6. Fix deploy: `linha.documentoItemId` (não `linha.id`) — partia `tsc` no `web-v0.1.115`

## Commits / tags relevantes

- `1f9327f` feat estorno V2
- `6ce0c37` bump 0.1.115
- `cb4bdc7` fix TS + tag **web-v0.1.116**

## Próximos passos úteis

1. Confirmar Actions **Deploy web #30** (ou o run de `web-v0.1.116`) verde
2. Ctrl+F5 no login → versão **v0.1.116**
3. Testar estorno MULTIPLOS (total/parcial) e retry após “demorou demais”
4. Opt-out se preciso: `VITE_ISO_PRO_ESTORNO_V2=false` ou localStorage `iso-pro-desktop-estorno-v2-opt-in-v1=false`

## Ficheiros-chave

- `src/modules/atendimento/services/estornoAtendimentoV2.ts`
- `src/modules/atendimento/services/atendimento.service.ts` (tenta V2 primeiro)
- `src/modules/atendimento/hooks/useAtendimento.ts` (`confirmarEstornoFinal`)
- `supabase/migrations/2026071904*.sql` … `19060000_*.sql`
- `e2e/estorno.spec.ts` · `scripts/audit-qat-coluna-vs-tabela.mjs`

## Não incluído no git (diag local)

Vários `scripts/diag-*.mjs` ficaram untracked de propósito.
