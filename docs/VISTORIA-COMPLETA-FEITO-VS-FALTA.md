# Vistoria completa — FEITO vs FALTA (PC · Web · Mobile)

**Data:** 2026-08-31  
**Método:** código + migrations + checklists `[x]` + runbooks + smoke automatizado + campanha load staging.  
**Regra:** `.cursor/rules/nao-refazer-ja-feito.mdc`

**Versões no código:** PC/web **0.1.261** · Mobile **1.0.125** (versionCode 126)  
**Gates:** PC min **0.1.247** / force abaixo **0.1.246** · Mobile min **1.0.114** / force abaixo **1.0.113**  
**PC = Web:** mesmo bundle Vite (`dist/`); Electron só empacota + IPC (updater, PDF, mail, fetch).

**Artefactos:**
- Web LIVE — **0.1.260** deployado (RNC + RF + RIR PDF v6 premium)
- Setup / feed — **0.1.260** publicado (`latest.yml` LIVE)
- Locais: `release/installers/atuais/I.S.O PRO Setup 0.1.260.exe` (+ portable + SHA256SUMS)
- APK `iso_pro_mobile/dist/android/iso-pro-mobile-release-1.0.125.apk` (+ cópia `C:\IPB\mob\dist\android`)
- Staging load — `sacaiokhqhegvtpzlpkf` (ensaio; **nunca** builds de campo)

**Veredicto:** código e arquitectura prontos para obra séria; operação enterprise quase — falta provar no campo e fechar auditoria/ops.

---

## Resumo executivo

| Camada | Maturidade | Nota |
|--------|------------|------|
| **PC / Web** | Alta | SoT, MFA, updater, auditoria, dashboard, Sentry, relatórios rápidos, PDFs v6 |
| **Mobile** | Alta | Comando atendimento, filas SQLite, force-update, Sentry RN, fix recibo 1.0.125 |
| **Backend Supabase LIVE** | Alta | JWT onda 2; perf atendimento + recebimentos em prod |
| **Carga (staging-load)** | Aceite | ≥95% comandos/hotspot/canteiro 10–25 ops; listagens 120/120 |
| **P1 produto** | Quase fechado | API pública **adiada** de propósito |
| **P2/P3** | Embrionário / adiado | Kafka/K8s/BPM **não fazer** |

O I.S.O PRO **já está no nível “obra fiável / offline-first”**. O que falta para selo ops enterprise é **rollout campo**, smoke humano JWT, pen-test, DR cronometrado, Authenticode, EULA jurídico — não reescrever o sistema.

---

## P0 — SoT, Edge, Sentry, versões, JWT

| Item | Estado | Evidência / nota |
|------|--------|------------------|
| SoT hard-fail `sot_require_rpc` | **FEITO** | `sotWriteGuard.ts` PC+mobile; CI blindagem; testes alinhados 2026-08-30 |
| Migrations `write_*_sot` em prod | **FEITO** | Runbook `[x]` 2026-08-05 |
| Atendimento comando (sem patch) | **FEITO** | mobile `atendimentoComando.ts` + check CI |
| Residual `patch_snapshot` vivo | **FEITO** (2026-08-06) | `iso_pro_write_configuracoes_sot` + sync Configurações |
| Ramos legado mortos nos services | **FEITO** (2026-08-06) | Sem `commitIsoProSnapshotPatch` em `modules/**/services` |
| Edge admin + service fetch | **FEITO** | `iso_pro_admin_user` + `isoProAdminUser.service.ts` |
| MFA **nas** Edges | **NÃO** (por desenho) | MFA no **login** Auth; Edge = secret + actor |
| Sentry PC/web renderer | **FEITO** | `sentryInit.ts` |
| Sentry mobile | **FEITO** | `sentryRN.ts` |
| Sentry Electron main | **FEITO** | `electron/main/sentryMain.ts` |
| Alerta `dual_write_failure` | **FEITO** | Checklist `[x]` 2026-08-06 |
| Políticas de versão + force gate | **FEITO** | `appVersionPolicy.ts` PC + mobile |
| MFA login admin (campo) | **FEITO** | Activo — **não repetir** |
| PC obra instalado | **FEITO** | Desde ~2026-08-05; **actualizar** para **0.1.260** |
| JWT cutover login (auth sem anon) | **FEITO** | Checklist activação |
| JWT onda 2 staging (revoke writes) | **FEITO** | 2026-08-06 + smoke OK |
| JWT onda 2 **prod (LIVE)** | **FEITO** (2026-08-25) | Reconfirm smoke 2026-08-30 |
| Peek ainda anon | **FEITO** (desenho onda 2) | Onda 2b depois — **não** revogar agora |
| Perf atendimento staging &lt;2s | **FEITO** | Mig `20260807013000` |
| Perf atendimento **prod** | **FEITO** | Aplicada no cutover LIVE |
| Recebimentos recalc status lista | **FEITO** (2026-08-25) | Mig `20260809010000` em LIVE |
| Relatórios contagens RPC | **FEITO** (2026-08-27) | `fetchOperacaoContagens` — sem paginar ~4k docs |
| JWT wipe em lista vazia | **FEITO** | `materiaisListaPaginada.ts` — não limpa sessão |
| RNC PDF/HTML v6 premium | **FEITO** | **0.1.256** — marca, badges, figuras |
| Relatório fotográfico PDF v6 | **FEITO** | **0.1.257–0.1.259** — Noto inline (fix tipografia Chrome PDF) |
| RIR PDF/HTML v6 premium | **FEITO** | **0.1.260** — alinhado RNC/RF + Noto inline |
| Recibo atendimento / estorno v6 | **FEITO** | **0.1.261** — cabeçalho premium + Noto + DOC_VERSION 6 |
| Load-test aceite staging | **FEITO** (2026-08-31) | `iso-pro-staging-load` · ver `LOAD-TEST-RESULTADOS.md` |

---

## P1 — API, updater, MFA, auditoria, dashboard

| Item | Estado | Evidência / nota |
|------|--------|------------------|
| API / webhooks públicos | **ADIADO** | Só com contrato comercial |
| Updater Electron + feed live | **FEITO** | Feed LIVE **0.1.260** (2026-08-31) |
| MFA código + campo | **FEITO** | Não repetir |
| Auditoria before/after | **FEITO** | Materiais, recebimentos, inventário, documentos |
| Auditoria atendimento full before/after | **FEITO** | `before`/`after` lotes/docs |
| Dashboard ops vs admin | **FEITO** | `DashboardPage` + cache contagens |
| Gateway atendimento BR | **FEITO** | JWT-only desde 2026-08-12 |

---

## P2 / P3

| Item | Estado |
|------|--------|
| Tabela + RPC append/list domain events | **FEITO** |
| UI Eventos (Usuários) | **FEITO** |
| Consumers / read models / MV BI | **FEITO** (rollup RPC daily_counts) |
| OpenSearch | **ADIADO** |
| SSO (SAML/OIDC) | **ADIADO** |
| Kafka / K8s multi-região / BPM | **ADIADO** |
| IA relatório-final opcional | **FEITO** (feature estreita; off por omissão) |
| IA genérica plataforma | **ADIADO** |
| REVOKE peek anon (onda 2b) | **ADIADO** — só após telemetria |

---

## Transversal (fiabilidade / segurança / distribuição)

| Item | Estado |
|------|--------|
| Offline atendimento (SQLite WAL) | **FEITO** |
| Offline escala/conferência (SQLite) | **FEITO** |
| RLS + advisors sem ERROR | **FEITO** (hardening contínuo) |
| Backups PHYSICAL + restore smoke | **FEITO** (checklists) |
| Staging load dedicado | **FEITO** | `sacaiokhqhegvtpzlpkf` (legado US removido) |
| Drill DR com RTO medido no log | **FALTA** (`DR-DRILL-LOG` pendente) |
| Pen-test externo | **FALTA** (ops/contrato) |
| Authenticode (EXE assinado) | **PARCIAL** — pipeline existe; signing off |
| EULA jurídico definitivo | **PARCIAL** — ficheiro ainda modelo |
| iOS distribuição | **PARCIAL** — config; sem build EAS iOS |
| Push notifications | **NÃO CONSTRUÍDO** |
| Rollout campo 0.1.260 + 1.0.125 | **FALTA** | Setup/feed/web prontos; **instalar** nos posts + APK |

---

## Por canal

### PC (Electron 0.1.260)
**Feito:** UI completa, SoT writes, MFA login, updater, auditoria, dashboard, Sentry renderer + main, force-update, config SoT, relatórios rápidos, **suite PDF v6** (RNC + RF + RIR).  
**Falta:** EXE Authenticode; EULA final; **gerar Setup 0.1.260** e instalar nos posts &lt; 0.1.260.

### Web (mesmo bundle 0.1.260)
**Feito:** Idêntico ao PC em funcionalidade de negócio; PDFs v6 no browser.  
**Falta:** Authenticode N/A; Ctrl+F5 após deploy; confirmar versão no login = **0.1.260**.

### Mobile (1.0.125)
**Feito:** Atendimento comando + fila SQLite; peek/timeout; gateway JWT; Sentry; force-update; offline escala; fix “Nuvem incompleta” no Finalizar recibo.  
**Falta:** iOS store; push; **instalar APK 1.0.125** nos telemóveis de campo.

---

## Plano de rollout campo (passo a passo)

Ver checklist completa: **`CHECKLIST-ROLLOUT-SEMANA1.md`**

### PC — Setup 0.1.260

1. Confirmar versão actual: I.S.O PRO → Configurações → versão.
2. Se &lt; **0.1.247**: updater pode bloquear writes — instalar Setup **obrigatório**.
3. Copiar `I.S.O PRO Setup 0.1.260.exe` do NAS/installers atuais (ou `release/installers/atuais/`).
4. Executar Setup (não precisa desinstalar versão anterior).
5. Abrir app → login MFA → **Dashboard** carrega em segundos.
6. **Smoke:** Materiais → editar 1 campo → gravar (write SoT JWT).
7. **Smoke:** Relatórios → Actualizar → deve responder em **&lt;10s**.
8. **Smoke PDF v6:** Qualidade → RNC / RIR / Relatório fotográfico → Imprimir → layout carta + tipografia Noto intacta no “Guardar PDF”.

### Mobile — APK 1.0.125

1. Desinstalar APK antigo **só se** force-update bloquear (abaixo 1.0.113).
2. Instalar `iso-pro-mobile-release-1.0.125.apk` (origem: `C:\IPB\mob\dist\android` ou NAS).
3. Login → dispositivo aprovado (se pendente, aprovar no PC → Mobile).
4. **Smoke:** Atendimento → 1 linha → Finalizar recibo (sem “Nuvem incompleta” falso).
5. **Smoke:** Conferência → 1 item (opcional).

### Pós-rollout (marcar checklist JWT)

- [ ] Smoke login JWT + 1 write SoT no PC/web — `CHECKLIST-JWT-ONDA2-LIVE.md`
- [ ] Smoke mobile: 1 atendimento ou conferência com sessão JWT

---

## O que realmente falta (ordenado) — máximo 12

### Ops (não é “construir de novo”)
1. ~~JWT onda 2 revoke em **prod** + smoke~~ **FEITO** (2026-08-25)
2. ~~Migração perf atendimento + recebimentos em prod~~ **FEITO**
3. ~~Suite PDF v6 (RNC + RF + RIR)~~ **FEITO** (**0.1.260**)
4. ~~Load-test staging aceite~~ **FEITO** (2026-08-31)
5. **Rollout campo:** Setup **0.1.260** + APK **1.0.125** em todos os posts
6. **Smoke humano JWT** (PC write + mobile atendimento)
7. Drill DR com RTO no `DR-DRILL-LOG.md`
8. Pen-test externo (selo segurança)
9. Certificado Authenticode + builds assinados
10. EULA jurídico (substituir modelo)

### Código (pequeno, útil)
11. ~~Relatórios lento / RNC Excel~~ **FEITO** (v6 + Noto)
12. Lint desktop (13 erros React Compiler) — sprint limpeza, não bloqueia typecheck

### Só se doer / cliente pagar
Webhooks · SSO · OpenSearch · iOS · push · onda 2b peek · Kafka/K8s/BPM

---

## Conclusão

Manter a base. **Não virar SAP.**  
Código e arquitectura: **prontos para obra séria.**  
Operação enterprise: **quase** — falta provar no campo e fechar auditoria/ops.

**LIVE:** `ofeogtjydjdjrmrekebh` · Rollback US: `huvktaxsosxrfpvdigxq` · Staging load: `sacaiokhqhegvtpzlpkf`
