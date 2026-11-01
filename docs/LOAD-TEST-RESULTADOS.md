# Load-test — resultados

Critério de aceite: **≥ 95% sucesso**.

## 2026-09-05 (gaps PC/web/mobile + relatórios)

Fecha as lacunas da prova completa: caminhos de cliente, offline mobile (contrato), relatório/PDF readiness.

### A — Caminhos UI (contrato PC/web/mobile) a 200k

Script: `scripts/load-test-client-paths-enterprise.mjs`  
Simula scroll/busca/deep-offset como a UI (sem clique; sem credenciais E2E).

| Teste | Resultado |
|-------|-----------|
| Scroll docs offsets 0…50000 | **OK** ~0,1–0,6 s |
| Search docs / materiais / atd / RIR | **OK** |
| Mobile page + deep recebimentos | **OK** |
| Offline policy 24h/48h/72h | **OK** (constantes mobile) |
| RIR payload → PDF | **OK** |
| Painel `operacao_contagens` | **OK** |
| Métricas `p_codigos` (folha) | **OK** ~119 ms |
| **Aceite** | **15/15 (100%)** |

### B — Mobile offline

| Item | Estado |
|------|--------|
| RIR/RNC no mobile | **N/A** — fora do produto Campo (só PC/web) |
| Políticas fila | **OK** aviso 24 h · bloqueio 48 h · escala 72 h |
| Unit `offlineSnapshotMerge.utils` | **6/6 PASS** |
| Airplane-mode no aparelho | Checklist pronta · contrato RPC **7/7 PASS** · ensaio físico ☐ |

### C — Relatórios / PDF

| Item | Estado |
|------|--------|
| Lista RIR/RNC + payload imprimível | **OK** (prova A) |
| Agregados painel / métricas folha | **OK** |
| `npm run test:pdf-worker` local | **PASS 5/5** (HTML-first · RIR + relatório final · fila opcional) |
| E2E Playwright listas | **PASS** 2026-09-05 — login `e2e` (perfil operação) · 7 rotas OK em 13 s |

### D — Playwright UI (PC/web) a staging 200k

| Item | Estado |
|------|--------|
| Bootstrap | `scripts/bootstrap-e2e-staging-user.mjs` → user `e2e` + Auth JWT |
| Credenciais | `ISO_PRO_E2E_*` em `.env.staging` |
| Spec | `e2e/escala-listas-staging.spec.ts` |
| Rotas | documentos · recebimentos · materiais · atendimento · rir · rnc · relatorio-final |
| Resultado | **1/1 PASS** · sem crash · ~13 s |

```bash
node --use-system-ca scripts/run-load-on-staging.mjs -- scripts/bootstrap-e2e-staging-user.mjs
npx vite build --mode staging
# carregar ISO_PRO_E2E_* do .env.staging
$env:ISO_PRO_E2E_PREVIEW='1'
npx playwright test e2e/escala-listas-staging.spec.ts
```

### Veredicto gaps

| Pergunta | Resposta |
|----------|----------|
| PC/web/mobile sem lentidão no **contrato de listas** a 200k? | **Sim** |
| Clique UI em todos os ecrãs? | **Sim (PC/web)** — Playwright 7 rotas PASS |
| Mobile offline a 200k blob? | **Não aplicável** — mobile é paginado + fila; não descarrega 200k |
| Relatório robusto? | **OK** — agregados + `test:pdf-worker` HTML→PDF (RIR + RF) |

### E — Mobile offline (contrato + checklist)

| Item | Estado |
|------|--------|
| Contrato RPC Campo a 200k | **7/7 PASS** (`npm run test:load:mobile-offline-contract`) |
| Unit fila 24/48 h | **10/10 PASS** |
| Checklist aparelho | `iso_pro_mobile/docs/SMOKE-MOBILE-OFFLINE-STAGING.md` |
| Airplane-mode físico | **pendente** (precisa telemóvel) |

```bash
npm run test:load:mobile-offline-contract
# no mobile: seguir docs/SMOKE-MOBILE-OFFLINE-STAGING.md
```

---

## 2026-09-05/06 (PDF worker HTML-first)

| Teste | Resultado |
|-------|-----------|
| Fontes Noto | OK |
| Build worker | OK |
| RIR HTML → Chromium PDF | **OK** ~40 KB · 1 pág. |
| Relatório final HTML → PDF | **OK** ~40 KB · 1 pág. |
| Fila Supabase | SKIP (opcional `PDF_WORKER_QUEUE=1`) |

Corrigido: harness antigo (payload `registro`) → `{ html, waitPagedJs }`; `htmlPaged` usa `setContent` + Chrome do sistema.

```bash
npm run test:pdf-worker
```

---

## 2026-09-05 (prova completa · docs+NFs+cadastros+atd+RIR/RNC+relatórios)

### Staging-load `sacaiokhqhegvtpzlpkf`

| Entidade | Volume |
|----------|--------|
| Documentos | **200 000** |
| Recebimentos | **100 000** |
| Materiais | **50 000** |
| Atendimento lotes | **50 000** (`loadent-atd-*`) |
| RIR | **30 000** (`loadent-rir-*`) |
| RNC | **15 000** (`loadent-rnc-*`) |

Scripts: `seed-staging-volume-enterprise-ops-fn.sql` · `seed-staging-volume-enterprise-ops.mjs` · `load-test-prova-completa-enterprise.mjs`

### Smoke 1× (lista / agregados)

| RPC | Resultado | Latência |
|-----|-----------|----------|
| docs page | OK total=200000 | **270 ms** |
| recebimentos page | OK total=100000 | ~7,3 s |
| materiais page | OK total=50000 | **90 ms** |
| atendimento lotes | OK total=50000 | **151 ms** |
| rir page | OK total=30000 | **130 ms** |
| rnc page | OK total=15000 | **121 ms** |
| métricas por código | OK 50000 codes | ~10 s (cache miss/warm) |
| `iso_pro_operacao_contagens` | OK | ~2,2 s |

### Burst parallel=20 (100 RPCs: docs+atd+rir+rnc+contagens)

| Métrica | Resultado |
|---------|-----------|
| Sucesso | **100/100 (100%)** |
| p95 docs | ~568 ms |
| p95 atendimento | ~2,4 s |
| p95 RIR | ~2,1 s |
| p95 RNC | ~750 ms |
| p95 contagens | ~141 ms |

### OCC atendimento (escrita)

| Teste | Resultado |
|-------|-----------|
| 20 operadores × 2 rondas | **40/40 (100%)** · p95 ~134 ms · 0 conflitos duros |

### Aceite global

| Critério | Estado |
|----------|--------|
| ≥95% sucesso | **PASS 10/10 (100%)** |
| Volume ≥150k docs + ops | **PASS** |
| Sem timeout nas listagens 1× | **PASS** |

### Veredicto

Arquitectura SoT **aguenta prova completa** a volume enterprise nos eixos pedidos (cadastros, docs, NFs, atendimento, RIR/RNC, painel/contagens).  
Limitações conhecidas: burst **40×** no pool Supabase; métricas globais frias ~10 s (cache quente ≪1 s); PDF/foto de relatório fora deste harness.

```bash
npx supabase link --project-ref sacaiokhqhegvtpzlpkf --yes
npx supabase db query --linked -f scripts/seed-staging-volume-enterprise-ops-fn.sql
node --use-system-ca scripts/seed-staging-volume-enterprise-ops.mjs
node --use-system-ca scripts/load-test-prova-completa-enterprise.mjs --parallel 20
```

---

## 2026-09-05 (cutover LIVE · migrations enterprise)

### LIVE `ofeogtjydjdjrmrekebh`

| Item | Estado |
|------|--------|
| Migrations | `20260903010000` · `20260903020000` · `20260903030000` **aplicadas** |
| Seed de carga | **não** (só schema/RPCs/cache) |
| Warm | `scripts/warm-live-enterprise-caches.sql` — contagens + métricas por tenant |

### Verificação pós-push (RPC directa)

| Tenant | Docs (lista) | Mode | Métricas códigos | Source |
|--------|--------------|------|------------------|--------|
| `…0001` | **4073** | cached | **3622** | cache |
| `0bc5…` | 17 | cached | 553 | cache |
| `07c7…` | 0 | — | 0 | cache (snapshot docs) |

Clientes PC/web/mobile **não precisam de build novo** para estas RPCs (mesmas assinaturas; métricas com `p_codigos` opcional).

---

## 2026-09-03 (enterprise · 200k docs + 100k NFs · staging-load)

### Staging

| Item | Estado |
|------|--------|
| Projecto | `iso-pro-staging-load` ref **`sacaiokhqhegvtpzlpkf`** |
| Seed | `scripts/seed-staging-volume-enterprise.mjs` |
| Volume | **200 000** docs · **~800 000** itens docs · **100 000** recebimentos · **~300 000** itens NF · **50 000** materiais |
| Migrations | `20260903010000` (índices + lista count cache + triggers) · `20260903020000` (métricas PostgREST) · `20260903030000` (cache métricas + lista materiais) |

### Smoke listagens (1 cliente) a 200k

| RPC | Resultado | Latência | Nota |
|-----|-----------|----------|------|
| `iso_pro_list_documentos_planejamento_page` | **OK** total=200000 | **~296 ms** | `_totalMode=cached` |
| `iso_pro_list_recebimentos_page` | **OK** total=100000 | **~1,2 s** | |
| `iso_pro_sum_metricas_planejamento_por_codigo` | **OK** 50 000 códigos | **~295 ms** | cache TTL 5 min |
| `iso_pro_sum_quantidade_recebida_por_codigo` | **OK** | **~1,9 s** | |

### Burst leitura a 200k

| Parallel | Sucesso | p95 docs | Nota |
|----------|---------|----------|------|
| **20** (60 RPCs) | **60/60 (100%)** | ~42 s | **Aceite ≥95%** |
| **40** (120 RPCs) | **96/120 (80%)** / **110/120 (92%)** | ~70–80 s | falhas = pool de conexões Supabase, não SQL |

### Aceite a 100k (pré-expansão, mesma onda)

| Teste | Antes | Depois |
|-------|-------|--------|
| Lista docs 1× | ~35 s frio | **~0,3–0,5 s** |
| Métricas globais | TIMEOUT ~11 s | **~157 ms** (cache) |
| Burst parallel=40 | 5/40 docs · 0/40 mats | **120/120 (100%)** |

### Veredicto

| Camada | Estado |
|--------|--------|
| Contrato SoT + volume enterprise | **OK** — 200k docs / 100k NFs / 50k cadastros |
| Latência lista/métricas 1× | **OK** — nível sistema grande |
| Burst 40× a 100k | **OK** ≥95% |
| Burst 20× a 200k | **OK** 100% |
| Burst 40× a 200k | **Fraco no pool** (~80–92%); SQL responde; subir pool ou limitar concorrência |

### Como repetir

```bash
npx supabase link --project-ref sacaiokhqhegvtpzlpkf --yes
npx supabase db push --linked --yes
npx supabase db query --linked -f scripts/seed-staging-volume-enterprise-fn.sql
npx supabase db query --linked -f scripts/seed-staging-volume-enterprise-mats.sql
node --use-system-ca scripts/seed-staging-volume-enterprise.mjs --docs 200000 --recs 100000
npx supabase db query --linked -f scripts/refresh-staging-metricas-cache.sql
node --use-system-ca scripts/load-test-listagens-escala-100k.mjs
node --use-system-ca scripts/run-listagens-burst-staging.mjs --parallel 20
```

---

## 2026-09-02/03 (prova formal ~100k · staging-load)

### Staging

| Item | Estado |
|------|--------|
| Projecto | `iso-pro-staging-load` ref **`sacaiokhqhegvtpzlpkf`** |
| Seed | `scripts/seed-staging-volume-100k.mjs` + `iso_pro_seed_load100k_batch` |
| Volume | **100 000** docs · **399 999** itens · **20 000** materiais (`LOAD100K-*`) |
| Migrations | push até `20260831260000` (métricas, status, inventário upsert) |

### Smoke listagens (1 cliente)

| RPC | Resultado | Latência | Nota |
|-----|-----------|----------|------|
| `iso_pro_list_documentos_planejamento_page` | **OK** total=100000 | **~35 s** (frio) / **~0,36 s** (quente) | Funcional; frio acima do aviso 15 s |
| `iso_pro_list_recebimentos_page` | OK total=0 | ~1,7 s | Sem NFs no seed |
| `iso_pro_sum_metricas_planejamento_por_codigo` | **TIMEOUT** | ~11 s | Agregado global ainda pesado a 100k |
| `iso_pro_sum_quantidade_recebida_por_codigo` | OK | ~3,9 s | porCodigo vazio (sem recebimentos) |

### Burst leitura (parallel=40)

| RPC | Sucesso | p95 | Nota |
|-----|---------|-----|------|
| documentos | **5/40 (12%)** | ~70 s | Timeouts sob concorrência |
| materiais | **0/40 (0%)** | — | Timeout |
| outbox | **40/40 (100%)** | ~53 s | OK mas lento |

**Aceite ≥95% sob burst a 100k:** **não** (leitura de listagens).

### Veredicto

| Camada | Estado |
|--------|--------|
| Contrato SoT + seed 100k | **OK** — lista devolve total correcto sem blob |
| Latência lista 1× a 100k | **Fraco** (~35 s) — falta índice/count rápido |
| Métricas globais a 100k | **Fraco** — timeout; precisa agregação incremental ou timeout maior + SQL |
| Burst 40× a 100k | **Fraco** — timeouts |

**Próxima onda de escala:** otimizar `iso_pro_list_documentos_planejamento_page` (count + ORDER BY numero) e `iso_pro_sum_metricas_planejamento_por_codigo` (materialized/parcial por códigos da página).

### Como repetir

```bash
# seed (idempotente)
node --use-system-ca scripts/seed-staging-volume-100k.mjs --target 100000 --batch 2000

# smoke
node --use-system-ca scripts/load-test-listagens-escala-100k.mjs
node --use-system-ca scripts/run-listagens-burst-staging.mjs --parallel 40
```

---

## 2026-08-30/31 (staging-load novo · sa-east-1)

### Staging

| Item | Estado |
|------|--------|
| Projecto | `iso-pro-staging-load` ref **`sacaiokhqhegvtpzlpkf`** |
| Motivo | Staging legado US `vghbcwkvmmihakunvwqw` **removido**; `.env.staging` estava na LIVE |
| Bootstrap | `projects create` + preflight + `db push` completo |
| Auth writes | SERVICE_ROLE via `.env.staging` (JWT onda 2 bloqueia anon) |
| Guard | `ISO_PRO_STAGING_LOAD_REF` permitido; LIVE e rollback US continuam recusados |

### Aceite operacional (critério ≥95%)

| Teste | Sucesso | p95 | Aceite |
|-------|---------|-----|--------|
| comandos 10×2 | **20/20 (100%)** | 66–79 ms | sim |
| comandos 20×2 | **40/40 (100%)** | 77–92 ms | sim |
| hotspot 10×2 | **20/20 (100%)** | 64–69 ms | sim |
| hotspot 25×2 | **50/50 (100%)** | 67–69 ms | sim |
| canteiro hotspot 10×2 | **20/20 (100%)** | 72–81 ms | sim |
| canteiro avalanche 10 | **20/20 (100%)** | 76–85 ms | sim |
| listagens burst parallel=40 | **120/120 (100%)** | ~611–613 ms | sim |

### Stress além do aceite (alta demanda)

| Teste | Sucesso | Nota |
|-------|---------|------|
| comandos 50×2 | **88/100 (88.0%)** | 12 conflitos OCC após 16 retries; **0 erros duros**; p95 72–83 ms |

Tecto observado: ~20–25 operadores paralelos no harness actual (OCC retry 16 + backoff) mantém ≥95%. A 50 ops o gargalo é concorrência de baseline no mesmo tenant/snapshot — comportamento esperado, não falha de dados.

### Relatório

Canvas: `canvases/campanha-testes-2026-08-30.canvas.tsx`

---

## 2026-08-08/09 (auditoria staging SP)

### Staging

| Item | Estado |
|------|--------|
| Projecto | `iso-pro-staging-sp` ref **`ofeogtjydjdjrmrekebh`** |
| Auth writes | JWT onda 2: **anon bloqueado** em submit/write SoT (`jwt:onda2-smoke` OK) |
| Harness | `run-load-on-staging.mjs` usa `SERVICE_ROLE` do `.env` para writes (anon → 0%) |
| Listagens | Requer `ISO_PRO_JWT_SKIP_TLS_VERIFY=1` neste ambiente; `p_status: 'todos'` (evita overload PostgREST) |

### Comandos / hotspot / canteiro (escrita)

| Teste | Sucesso | p95 | Aceite |
|-------|---------|-----|--------|
| comandos 10×2 | **20/20 (100%)** | 69–85 ms | sim |
| hotspot 10×2 | **20/20 (100%)** | 58–59 ms | sim |
| canteiro hotspot 10×2 | **20/20 (100%)** | 74–89 ms | sim |

Nota: harness `comandos` actualizado com números de lote únicos + OCC retry 16 + backoff (evita `iso_pro_atendimento_lotes_tenant_numero_uidx` e conflitos).

### Listagens burst (parallel=40)

| RPC | Sucesso | p95 | wall |
|-----|---------|-----|------|
| documentos / materiais / outbox | **120/120 (100%)** | ~5,3–5,8 s | ~5,9 s |

**Aceite leitura:** sim.

### CI local (mesma campanha)

| Check | Resultado |
|-------|-----------|
| Desktop typecheck + atendimento-perf + shared-hash | PASS |
| Desktop vitest | 788 pass / **43 fail** (mocks SoT) |
| Mobile typecheck | FAIL (`atendimentoSnapshotPatch.ts`) |
| jwt:onda2-smoke (staging) | PASS |

Ver canvas: `canvases/auditoria-sistema-iso-pro.canvas.tsx`.

---

## 2026-07-22 (fecho onda 1)

### Staging

| Item | Estado |
|------|--------|
| Projecto | `iso-pro-staging` ref **`vghbcwkvmmihakunvwqw`** |
| Bootstrap | Preflight `scripts/preflight-empty-staging.sql` + `db push` completo |
| `.env.staging` | Aponta para este ref |
| Nota | Schema fresco (não é clone PHYSICAL). Serve para stress de **comandos/OCC**. Para dados de obra reais, preferir Restore-to-new-project. |

### Comandos atendimento (escrita)

`node scripts/run-load-on-staging.mjs -- scripts/load-test-atendimento-comandos.mjs --operators 10 --rounds 2`

| Métrica | Resultado |
|---------|-----------|
| Sucesso | **19/20 (95.0%)** |
| Ronda 1 | 10/10 · p95 174 ms |
| Ronda 2 | 9/10 · 1 conflito · p95 310 ms |
| Erros duros | 0 |

**Aceite:** sim (≥95%).

### Hotspot (mesmo documento)

`…/load-test-atendimento-hotspot.mjs --operators 10 --rounds 2`  
(OCC retry até 16 + backoff)

| Métrica | Resultado |
|---------|-----------|
| Sucesso | **20/20 (100%)** |
| p95 | 166–182 ms |
| retries médio | ~3.2 |

**Aceite:** sim.

### Canteiro

| Modo | Sucesso | p95 |
|------|---------|-----|
| hotspot 10×2 | **20/20 (100%)** | 163–175 ms |
| avalanche 10 | **20/20 (100%)** | 173–180 ms |

**Aceite:** sim.

### Listagens burst

| Ambiente | Resultado |
|----------|-----------|
| Staging parallel=40 | **120/120 (100%)** · p95 ~1,3–1,4 s · wall 1,4 s |
| Prod parallel=40 (leitura) | **120/120 (100%)** · p95 ~3,6–4,0 s · wall 4,0 s |

**Aceite:** sim.

### Checklist

- [x] Item 6.4 `CHECKLIST-ATIVACAO-JWT.md` — assinado 2026-07-22
- Harness: retries OCC aumentados em hotspot/canteiro (backoff) para reflectir cliente real

---

## 2026-07-22 (stress com volume sintético)

Staging `vghbcwkvmmihakunvwqw` semeado com `scripts/seed-staging-volume.sql` (prefixo `LOADVOL-` / `loadvol-doc-`).

| Volume | Contagem |
|--------|----------|
| Documentos | **8 000** (~2× prod ≈4 073) |
| Itens | **64 000** (~2,5× prod ≈26 k) |
| Materiais | **10 000** (~2,7× prod ≈3 6k) |

### Comandos / hotspot / canteiro

| Teste | Sucesso | p95 |
|-------|---------|-----|
| comandos 10×2 | **20/20 (100%)** | 237–473 ms |
| hotspot 10×2 | **20/20 (100%)** | 427–495 ms |
| canteiro hotspot 10×2 | **20/20 (100%)** | 533–595 ms |
| canteiro avalanche 10 | **20/20 (100%)** | 290–406 ms |

**Aceite escrita:** sim (≥95%). Latência sobe vs schema vazio (esperado).

### Listagens burst (parallel=40)

| Métrica | Resultado |
|---------|-----------|
| Sucesso | **120/120 (100%)** |
| documentos p95 | ~11,4 s |
| materiais p95 | ~11,2 s |
| outbox p95 | ~9,3 s |
| wall | ~11,5 s |

**Aceite leitura:** sucesso 100%. p95 bem acima do schema vazio (~1,4 s) — prova de carga com volume; não é regressão de lógica.

### Nota Restore

Volume sintético cobre stress de listagens/OCC. Clone PHYSICAL (Restore to new project) continua útil para dados de obra reais + Storage metadados; ver `docs/GUIA-RESTAURO-STAGING.md`.
