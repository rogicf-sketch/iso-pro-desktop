# Guia rápido — alertas infra Supabase (cliques)

Complementa `docs/CHECKLIST-ALERTAS-INFRA-SUPABASE.md`.  
Objectivo: email quando disco/CPU/pool se aproximam do limite.

Projecto: https://supabase.com/dashboard/project/huvktaxsosxrfpvdigxq

---

## 1) Confirmar email da org

1. Abre a **organização** (não só o projecto)
2. **Organization Settings → Members / Notifications** (ou Billing alerts)
3. Confirma que o email do owner recebe notificações da org

## 2) Usage / Infrastructure

1. Projecto → **Settings → Infrastructure**  
   https://supabase.com/dashboard/project/huvktaxsosxrfpvdigxq/settings/infrastructure
2. Anota % de **Disk**, **CPU**, **Memory**, **Connections**
3. Se o plano mostrar toggles de alert (≥ 80%), activa para email

## 3) Reports (tendência)

1. **Reports → Database**  
   https://supabase.com/dashboard/project/huvktaxsosxrfpvdigxq/reports/database
2. Olha picos de conexões e tamanho da BD (semanal)

## 4) Advisors (já tratado no código)

- Security: **0 ERROR** após P0–P2; WARN restantes = auth RPC + flush (intencional)
- Performance: `multiple_permissive_policies` — aceite até onda JWT

## Checklist rápido

| # | Feito? |
|---|--------|
| Email org recebe alertas | [x] 2026-07-12 — Pro envia email perto dos limites do plano |
| Infrastructure / Compute and Disk revisto | [x] 2026-07-12 — disco 0,33/8 GB; sem toggle dedicado |
| Reports / Observability DB olhado | [x] 2026-07-12 |

Assinatura / data: ops fecho 2026-07-12
