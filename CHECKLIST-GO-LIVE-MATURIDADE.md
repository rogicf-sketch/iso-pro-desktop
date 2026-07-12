# Checklist go-live — maturidade P0–P2 (TI)

Uso interno após o pacote **JWT/RLS escala**, **conferência paginada**, **dual-write visível**, **offline sem re-fetch**, **E2E real** e **Sentry operacional**.

Complementa (não substitui):
- `CHECKLIST-GO-LIVE.md` — validação por módulo na obra
- `CHECKLIST-ATIVACAO-JWT.md` — piloto JWT / Auth
- `CHECKLIST-OPERACOES.md` — backups e operação contínua

**Regra:** aplicar primeiro em **staging** (ou tenant piloto). Só depois produção.

---

## Cabeçalho

| Campo | Valor |
|-------|--------|
| Ambiente | staging / produção |
| Tenant UUID | |
| URL Supabase | |
| URL web | https://isoprogestaodemateriais.com.br |
| Versão PC/Web | 0.1.89+ |
| Versão mobile | 1.0.59+ (MFA no código; APK a gerar) |
| Responsável TI | |
| Data início | |
| Data go-live | |

---

## Fase 0 — Pré-requisitos

| # | Verificação | OK? | Data |
|---|-------------|-----|------|
| 0.1 | Backup Supabase recente + restauro testado (registar data) | [ ] | |
| 0.2 | Staging ou tenant piloto disponível | [ ] | |
| 0.3 | Desktop: `npm run typecheck` + `npm run test` verdes | [ ] | |
| 0.4 | Mobile: `npx tsc --noEmit` + `npx vitest run` verdes | [ ] | |
| 0.5 | Desktop E2E local: `npx playwright test` → **4 passed** (2 skipped opcionais OK) | [ ] | |

---

## Fase 1 — Migration P0 (RLS escala + assert)

Ficheiro: `supabase/migrations/20260711120000_iso_pro_rls_escala_jwt_align.sql`

| # | Passo | OK? | Data |
|---|-------|-----|------|
| 1.1 | Staging: `npx supabase link` + `npx supabase db push` (ou colar SQL no Editor) | [x] | 2026-07-11 (prod `huvktaxsosxrfpvdigxq`; sem staging separado) |
| 1.2 | Correr `supabase/snippets/validar_rls_escala_jwt_p0.sql` | [x] | 2026-07-11 |
| 1.3 | Confirmar políticas `*_tenant_rls` em documentos/recebimentos/inventários/RIR/RNC | [x] | 2026-07-11 |
| 1.4 | Confirmar `tem_assert = true` em `iso_pro_read_snapshot_slices`, `iso_pro_patch_snapshot`, `iso_pro_list_*_page`, `iso_pro_operacao_contagens` | [x] | 2026-07-11 |
| 1.5 | Login anon (utilizador sem Auth) continua a funcionar no tenant correcto | [ ] | |
| 1.6 | (Se piloto JWT) sessão `authenticated` com tenant errado → `ISO_PRO_TENANT_FORBIDDEN` | [ ] | |
| 1.7 | **Só após staging OK:** repetir 1.1–1.4 em **produção** | [x] | 2026-07-11 (aplicado directo em prod) |

PowerShell (staging/prod conforme link):

```powershell
cd "C:\Sistema I.S.O PRO GESTÃO DE MATERIAIS\iso-pro-desktop"
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push
```

Validação no SQL Editor: abrir e executar `supabase/snippets/validar_rls_escala_jwt_p0.sql`.

---

## Fase 2 — Sentry (DSN)

Sem DSN o app **não quebra** — só deixa de enviar alertas externos.

**Decisão 2026-07-11:** release actual **sem DSN** (`VITE_SENTRY_DSN` / `EXPO_PUBLIC_SENTRY_DSN` ausentes no `.env` local e `deploy-web.env`). Código + eventos `iso.*` prontos; activar quando houver projecto Sentry.

| # | Passo | OK? | Data |
|---|-------|-----|------|
| 2.1 | Criar projecto Sentry (ou reutilizar) para I.S.O PRO | [ ] | adiado |
| 2.2 | Desktop/web: definir `VITE_SENTRY_DSN` no `.env` de build / EAS secrets / hosting | [ ] | adiado |
| 2.3 | Mobile: definir `EXPO_PUBLIC_SENTRY_DSN` no `.env` / EAS | [ ] | adiado |
| 2.4 | Rebuild PC/web + APK/IPA com o DSN | [ ] | adiado |
| 2.5 | Smoke: forçar um erro de teste **só em staging** e ver evento no Sentry | [ ] | adiado |
| 2.6 | Alertas Sentry: filtrar por mensagem `iso.snapshot_conflict`, `iso.dual_write_failure`, `iso.offline_flush` | [ ] | adiado |

Eventos esperados (quando DSN activo):

| Evento | Origem |
|--------|--------|
| `iso.snapshot_conflict` | Conflito OCC no snapshot (PC `executeWrite` / mobile patch) |
| `iso.dual_write_failure` | Falha dual-write escala (painel Nuvem também mostra) |
| `iso.offline_flush` | Flush da fila offline mobile |

Docs: `docs/sentry-sdk-opcional.md`

---

## Fase 3 — Smoke staging (15–25 min)

### 3A — PC / Web

| # | Teste | OK? |
|---|--------|-----|
| 3A.1 | Login com utilizador real da obra | [x] | 2026-07-11 JWT admin OK |
| 3A.2 | Painel → widget **Nuvem** + **Dual-write** = OK (sem falhas) | [ ] | UI obra (widget agora = Escala/outbox) |
| 3A.3 | Planejamento: listar desenhos (tabelas de escala / sync se vazio) | [x] | SQL + RPC page OK |
| 3A.4 | Recebimento teste → Conferência → finalizar | [ ] |
| 3A.5 | Atendimento: abrir módulo, listar pendentes (sem erro de tenant) | [ ] |
| 3A.6 | Trocar empresa (se multi-tenant) → sessão JWT limpa / re-login se necessário | [ ] |

### 3B — Mobile Campo

| # | Teste | OK? |
|---|--------|-----|
| 3B.1 | Login + mesmo tenant/Supabase do PC | [ ] |
| 3B.2 | **Consulta**: desenhos e NF via RPC paginada (não demora “infinita”) | [ ] |
| 3B.3 | **Conferência**: lista pendentes sem baixar snapshot completo de recebimentos | [ ] |
| 3B.4 | Abrir 1 NF → guardar quantidades (online) | [ ] |
| 3B.5 | (Opcional) Modo avião → guardar → voltar rede → flush / aviso “Sincronizado” | [ ] |
| 3B.6 | Atendimento: baixa teste com comando idempotente | [ ] |

### 3C — Automação (CI / máquina TI)

| # | Comando | Esperado | OK? |
|---|---------|----------|-----|
| 3C.1 | `cd iso-pro-desktop` → `npx playwright test` | 4 passed, 2 skipped | [x] 2026-07-11 |
| 3C.2 | Staging remoto (opcional): `ISO_PRO_E2E_LOGIN` + `ISO_PRO_E2E_SENHA` | login → Atendimento | [ ] skip |

---

## Fase 4 — Produção (só com Fases 1–3 OK)

| # | Passo | OK? | Data |
|---|-------|-----|------|
| 4.1 | Anunciar janela curta à obra (migration + deploy) | [ ] | |
| 4.2 | Aplicar migration P0 em produção (Fase 1) | [x] | 2026-07-11 (+ hotfix `20260711130000` CTE filtrado) |
| 4.3 | Publicar PC/web **0.1.87+** e mobile **1.0.58+** com DSN se previsto | [x] | 2026-07-11 web **0.1.89**; mobile APK **1.0.59** (MFA); Sentry DSN ainda ausente |
| 4.4 | Repetir smoke 3A.1–3A.5 e 3B.1–3B.4 em produção (dados reais mínimos) | [ ] | |
| 4.5 | Confirmar painel Dual-write = OK após 1 gravação de documento/recebimento | [ ] | |
| 4.6 | Monitorizar Sentry 24 h (conflitos / dual-write) | [ ] | |

---

## Rollback rápido

| Situação | Acção |
|----------|--------|
| Migration partiu RPC inexistente | Funções antigas mantêm-se se `db push` falhou a meio — reverter SQL manual só com backup |
| Dual-write a falhar em massa | Snapshot continua a gravar; sincronizar escala em Configurações → Obra; limpar aviso no painel Nuvem |
| Sentry a inundar | Remover DSN do próximo build ou silenciar regras no Sentry |
| Mobile conferência sem lista | Fallback snapshot ainda existe se RPC `missing`; sync recebimentos no PC |

---

## Fecho

| Item | OK? |
|------|-----|
| Migration P0 validada em staging e produção | [x] prod (+ hotfix CTE) |
| Sentry configurado **ou** decisão explícita “sem DSN nesta release” | [x] sem DSN nesta release |
| Smoke 3A + 3B OK | [~] | 2026-07-11 mobile MFA+leveza OK (user); falta smoke obra PC completo |
| Playwright 3C.1 OK | [x] |
| Outbox escala servidor (`20260711140000`) em produção | [x] 2026-07-11 |
| Piloto JWT `jwt_forte` (admin) | [x] 2026-07-11 |
| MFA TOTP UI (Configurações → Nuvem) | [x] código 2026-07-11; enroll manual com JWT |
| MFA TOTP admin Auth verificado | [x] 2026-07-11 `jwt:ativar-mfa-piloto` (segredo em `release/`) |
| Desafio MFA no login (PC/web/mobile) | [x] 2026-07-11 web; **mobile 1.0.59 validado na obra** |
| SLO local 24h no Painel Nuvem | [x] 2026-07-11 (v0.1.88+) |
| Staging Supabase separado | [ ] criar projecto + `npm run staging:link` |
| Sentry DSN em produção | [ ] painel + `npm run sentry:ativar` prontos |
| Build mobile MFA no campo | [x] APK 1.0.60 |
| Retenção outbox + pg_cron | [x] 2026-07-11 `iso_pro_prune_retencao_ops` |
| Smoke diário | [x] `npm run ops:smoke-diario` + workflow GitHub |
| Lista docs status só na página (escala) | [x] 2026-07-11 smoke ~0,5s / 1201 docs |
| Restauro formal assinado | [ ] `docs/CHECKLIST-RESTAURO-BACKUP.md` |
| Alertas infra Supabase | [ ] `docs/CHECKLIST-ALERTAS-INFRA-SUPABASE.md` |
| CI/CD deploy automático | [ ] ainda manual |
| Obra informada: nuvem = referência; dual-write falhas aparecem no Painel | [ ] |

**Assinatura / data:** _________________________

---

*Referências técnicas:*  
`docs/NIVEL-MUNDIAL-PROXIMOS.md` ·  
`docs/RETENCAO-OUTBOX.md` ·  
`supabase/migrations/20260711120000_iso_pro_rls_escala_jwt_align.sql` ·  
`supabase/migrations/20260711130000_fix_documentos_page_cte_filtrado.sql` ·  
`supabase/snippets/validar_rls_escala_jwt_p0.sql` ·  
`e2e/login-atendimento.spec.ts` ·  
`src/lib/dualWriteEscala.ts` ·  
`src/lib/errorReporting.ts`
