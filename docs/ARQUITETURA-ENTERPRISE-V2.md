# Arquitetura Enterprise V2 — I.S.O PRO

**Data:** 2026-08-31  
**Versões referência:** PC/web **0.1.260** · Mobile **1.0.125** · LIVE `ofeogtjydjdjrmrekebh`  
**Staging load:** `sacaiokhqhegvtpzlpkf` (`iso-pro-staging-load`) — ensaio / write stress  
**Propósito:** contrato de maturidade — **não** é reescrita do sistema.

---

## 1. North Star

**O que somos:** plataforma de gestão de materiais para **obra/construção com ISO**, offline-first, multi-tenant, SoT na nuvem (Supabase sa-east-1).

**O que não somos:** ERP genérico, WMS global Fortune 500, hub de microserviços, produto multi-região.

**Princípio V2:** mesma arquitetura técnica; **fechar provas operacionais** (rollout, DR, segurança auditável).

**Veredicto (2026-08-31):** código e arquitectura prontos para obra séria; operação enterprise quase — falta provar no campo e fechar auditoria/ops. Não acrescentar Kafka/K8s “para parecer grande”.

---

## 2. Arquitetura as-is (alvo congelado)

```
┌─────────────────────────────────────────────────────────────┐
│  Clientes                                                    │
│  • PC Electron 0.1.260+  • Web (mesmo bundle)  • Mobile 1.0.125+ │
└───────────────┬─────────────────────┬───────────────────────┘
                │                     │
         iso-pro-shared (Zod, validators, snapshot contract)
                │                     │
    ┌───────────▼──────────┐   ┌──────▼──────────────────────┐
    │  atendimento-gateway │   │  Supabase LIVE (Postgres)      │
    │  JWT-only · OCI BR   │   │  RLS · 110 migrations · RPC SoT │
    └───────────┬──────────┘   │  Realtime · Storage · Auth     │
                │              └──────┬─────────────────────────┘
                └──────────────────►│
                                    │
              ┌─────────────────────┼─────────────────────┐
              │  11 Edge Functions  │  pdf-worker (VM)    │
              └─────────────────────┴─────────────────────┘
              Observabilidade: Sentry · smoke diário · domain_events
```

**Non-goals explícitos (não fazer sem trigger comercial):**

- Kafka / message bus  
- Kubernetes / microserviços  
- Multi-região activa  
- OpenSearch / data lake  
- Reescrita SoT ou atendimento  
- API pública / SSO / webhooks  

---

## 3. Maturidade actual (notas honestas)

| Dimensão | Nota | Estado |
|----------|------|--------|
| Arquitetura / desenho | 9/10 | Coerente; sem over-engineering |
| Robustez transaccional (idempotência, OCC, comando) | 9/10 | Atendimento + SoT maduros |
| Offline (mobile) | 9/10 | SQLite WAL + fila + política 48h |
| Segurança técnica (JWT, RLS, gateway) | 8,5/10 | Onda 2 LIVE; smoke automatizado OK; falta smoke humano + pen-test |
| Produto funcional (obra/ISO) | 9/10 | Módulos completos; PDFs qualidade v6 |
| Performance / carga | 8,5/10 | Aceite load ≥95% em staging-load (10–25 ops); tecto OCC ~50 ops |
| Observabilidade | 7/10 | Sentry + smoke; falta SLO formal + DR log |
| Maturidade ops enterprise | 6–7/10 | Rollout, DR, Authenticode, EULA pendentes |
| **Enterprise-ready (segmento obra)** | **~8–8,5/10** | Código pronto; ops a fechar |

---

## 4. Gaps — P0 / P1 / P2

### P0 — Bloqueia “enterprise-ready” (fazer já)

| # | Gap | Critério de aceite | Estado |
|---|-----|-------------------|--------|
| 1 | Rollout PC | 100% posts ≥ **0.1.261** | [ ] artefactos prontos; instalar nos posts |
| 2 | Rollout mobile | 100% telemóveis ≥ **1.0.125** | [ ] |
| 3 | Smoke JWT PC | Login MFA + 1 write SoT (materiais/RNC) — data/post | [ ] |
| 4 | Smoke JWT mobile | 1 atendimento ou conferência com sessão JWT | [ ] |
| 5 | JWT onda 2 LIVE | Migration + `jwt:onda2-smoke` OK | [x] 2026-08-25 (+ reconfirm 2026-08-30) |
| 6 | Feed updater alinhado | `latest.yml` LIVE = **0.1.261** | [x] 2026-08-31 |
| 6b | Load-test staging | Aceite ≥95% comandos/hotspot/canteiro | [x] 2026-08-31 · `sacaiokhqhegvtpzlpkf` |

**Artefactos prontos:** Web LIVE **0.1.261** · Setup/feed **0.1.261** · Mobile APK **1.0.125**.

### P1 — Confiança enterprise (próximas semanas)

| # | Gap | Critério de aceite | Estado |
|---|-----|-------------------|--------|
| 7 | DR drill | RTO &lt; 2h medido em `DR-DRILL-LOG.md` | [ ] pendente |
| 8 | Pen-test externo | Relatório sem finding crítico aberto | [ ] |
| 9 | Authenticode | EXE assinado; `dist:win:signed` + verify-release | [ ] pipeline existe |
| 10 | EULA jurídico | `legal/EULA.txt` aprovado por advogado | [ ] modelo |
| 11 | Docs runbooks | P1 reconciliação/updater sem refs 0.1.239 | [x] 2026-08-27 |
| 12 | CI blindagem | `check:blindagem` no GitHub Actions desktop | [x] 2026-08-27 |

### P2 — Só se doer ou cliente pagar

| # | Gap | Trigger | Estado |
|---|-----|---------|--------|
| 13 | JWT onda 2b (REVOKE peek anon) | 7d telemetria sem fallback anon | adiado |
| 14 | iOS / push notifications | Contrato | não construído |
| 15 | API pública / webhooks | Cliente enterprise | adiado |
| 16 | SSO SAML/OIDC | Cliente enterprise | adiado |
| 17 | OpenSearch / BI externo | Volume/analytics | adiado |
| 18 | Multi-região | Escala internacional | adiado |

---

## 5. O que já está FEITO (não reabrir)

### Produto / código
- 18 módulos desktop; 5 tabs mobile; **863** testes Vitest desktop + mobile/shared  
- SoT table-first (10 RPCs `write_*_sot`) + atendimento comando + hard-fail `sot_require_rpc`  
- Offline mobile (atendimento, conferência, inventário)  
- MFA login; force-update gates  
- Relatórios rápidos (RPC contagens, 0.1.255+)  
- **PDFs qualidade v6 premium fechados:** RNC (**0.1.256**) · Relatório fotográfico (**0.1.257–0.1.259**) · RIR (**0.1.260**) — Noto Sans embutida  
- Fix “Nuvem incompleta” mobile 1.0.125  
- JWT wipe lista vazia corrigido  

### Backend / segurança
- 110 migrations; RLS hardening  
- JWT onda 2 LIVE (15 RPCs revoke anon writes)  
- Gateway atendimento JWT-only (2026-08-12)  
- Perf atendimento + recebimentos recalc em prod  
- Domain events + rollup 30d  
- Sentry main + renderer + mobile  

### Ops parcial
- Backups PHYSICAL + checklist restore  
- Smoke diário automatizado  
- Identidade LIVE trava deploy (`iso-pro-project-identity.mjs`)  
- Staging load dedicado + load-test aceite (≥95%) documentado em `LOAD-TEST-RESULTADOS.md`  

---

## 6. Definition of Done — “Enterprise-ready (obra/ISO)”

Marcar **enterprise-ready** quando **todos** P0 + P1 essenciais estiverem `[x]`:

- [ ] P0 completo (itens 1–4 + 6; 5 e 6b já feitos)  
- [ ] DR drill com RTO documentado (item 7)  
- [ ] Pen-test sem críticos abertos (item 8) **ou** decisão explícita de adiar com risco aceite  
- [ ] EXE Authenticode (item 9) **ou** distribuição interna com SHA256SUMS  
- [ ] EULA jurídico (item 10) se distribuição comercial  
- [ ] VISTORIA &lt; 30 dias  

**Frase técnica permitida após DoD:**

> *I.S.O PRO está pronto para operação enterprise em gestão de materiais de obra com ISO, offline-first, multi-tenant e SoT na nuvem.*

**Frase honesta hoje:**

> *Código e arquitectura: prontos para obra séria. Operação enterprise: quase — falta provar no campo e fechar auditoria/ops.*

---

## 7. Sequência recomendada (custo/benefício)

```
Semana 1 — P0
├── Gerar Setup + feed 0.1.260; instalar PC 0.1.260 + mobile 1.0.125 em todos os posts
├── Smoke humano JWT (PC + mobile)
├── Smoke PDF v6 (RNC / RF / RIR) no campo
└── Marcar CHECKLIST-JWT-ONDA2-LIVE.md

Semana 2–3 — P1
├── 1 DR drill cronometrado → DR-DRILL-LOG.md
├── Pen-test externo (quando contrato)
└── Authenticode + EULA (distribuição)

Nunca (até trigger)
└── Kafka · K8s · multi-região · microserviços
```

---

## 8. Documentos relacionados

| Doc | Papel |
|-----|-------|
| `VISTORIA-COMPLETA-FEITO-VS-FALTA.md` | Snapshot operacional FEITO/FALTA |
| `CHECKLIST-JWT-ONDA2-LIVE.md` | Segurança JWT pós-cutover |
| `RUNBOOK-P0-OPS-TOP-MUNDIAL.md` | DR, secrets, pen-test |
| `RUNBOOK-RECONCILIACAO-SOT.md` | Heal snapshot ↔ tabelas |
| `DR-DRILL-LOG.md` | Registo RTO medido |
| `CHECKLIST-ROLLOUT-SEMANA1.md` | Rollout 0.1.260 / 1.0.125 + smoke |
| `IDENTIDADE-PROD-LIVE.md` | Project refs LIVE / rollback / staging-load |
| `LOAD-TEST-RESULTADOS.md` | Aceite carga staging-load |

---

## 9. Conclusão

Enterprise V2 **não muda a arquitetura** — formaliza que o desenho actual **é** o alvo.  
O salto de qualidade = **aceite objectivo + evidência** (rollout, smoke, DR), não adicionar tecnologia.  
Manter a base. **Não virar SAP.**
