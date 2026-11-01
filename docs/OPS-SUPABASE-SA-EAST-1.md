# Ops — Migração Supabase para `sa-east-1` (São Paulo)

## Porquê

O projecto actual `rogicf-iso-pro` está em **East US (Virginia)**. O canteiro e a VM OCI estão no Brasil. O gateway de Confirmar (`POST /api/atendimento/comando` na VM BR) remove o salto **4G → EUA** do browser, mas o salto **VM BR → DB US** continua. Para latência de obra “top mundial” (alvo p95 &lt; 1,5s no Confirmar), a base tem de ficar em **`sa-east-1`**.

Isto **não** é hot-fix de 1 hora: é cutover com janela de manutenção.

## Pré-requisitos

- [x] Projecto Supabase novo em **São Paulo** (ensaio: `iso-pro-staging-sp` / `ofeogtjydjdjrmrekebh`)
- [x] CLI Supabase autenticada (`npx supabase login` / access token)
- [ ] Backup verificado do projecto actual (DB + Storage) — antes do cutover prod
- [ ] Lista de env a actualizar: desktop web (`.env` / CI), mobile, pdf-worker, atendimento-gateway, Edge Functions secrets
- [ ] Janela acordada com operação de campo (sem Confirmar durante cutover)

## Estado actual (2026-08-02)

| Projecto | Ref | Região | Papel |
|---|---|---|---|
| `rogicf-iso-pro` | `huvktaxsosxrfpvdigxq` | East US | **Produção** (não tocar no cutover) |
| `iso-pro-staging` | `vghbcwkvmmihakunvwqw` | East US | Staging legado US |
| `iso-pro-staging-sp` | `ofeogtjydjdjrmrekebh` | **sa-east-1** | Ensaio SP (schema via preflight + `db push`) |

Dashboard SP: https://supabase.com/dashboard/project/ofeogtjydjdjrmrekebh  
Env local ensaio: `.env.staging` (gitignored). **Produção continua em `.env` / US.**

## Fase 1 — Provisionar destino

1. [x] Criar projecto Supabase em **sa-east-1** (`iso-pro-staging-sp`).
2. [x] Anotar `SUPABASE_URL`, `anon`, `service_role` (CLI `projects api-keys` / Dashboard → Settings → API).
3. [x] Aplicar schema no projecto vazio:
   ```bash
   npx supabase link --project-ref ofeogtjydjdjrmrekebh
   # Obrigatório em DB vazio (tabelas legado não estão nas migrations iniciais):
   npx supabase db query --linked -f scripts/preflight-empty-staging.sql
   npx supabase db push --linked --yes
   ```
4. [ ] Recriar secrets / Edge Functions / Storage buckets (políticas iguais ao prod) — quando o ensaio precisar de PDF/auth hook.
   - [x] Auth hook Custom Access Token (`config push`, 2026-08-02 cutover) — `tenant_id` no JWT.

## Fase 2 — Ensaio (staging)

1. [x] Dump lógico do prod US → restore no SP (2026-08-02).
   - Ferramenta: `pg_dump` local (PostgreSQL 17) + credencial temporária CLI (`--role=postgres`).
   - Ficheiro local: `release/dumps/prod-us-public-data.sql` (~24,7 MB, gitignored).
   - SP truncado (public) + restore com `session_replication_role = replica`.
   - **Nota:** `auth.users` / Storage **não** vieram no dump `public` — login JWT Auth e ficheiros Storage precisam de passo à parte.
   - Alternativa futura: Docker Desktop + `supabase db dump`, ou Dashboard Restore-to-new-project.
2. [x] Seed + **dados de obra** no SP (dump public) + Auth/Storage:
   - [x] Auth: 7 `auth.users` + 7 `iso_pro_auth_membership` (rebuild após CASCADE)
   - [x] Storage: buckets `evidencias`/`pdfs` + **21/21** ficheiros copiados US→SP
   - [ ] login manual no PC com `.env.staging` (JWT hook no Dashboard SP se ainda não activo)
   - [ ] Confirmar (gateway e RPC) apontado ao SP — só em ensaio / não cutover
   - [ ] pdf-worker contra SP (ensaio)
3. [x] Smoke diário contra SP OK (após restore de dados, 2026-08-02):
   - `documentos_page` total≈4073 **source=tables** ~275 ms
   - `materiais_page` total≈3622; outbox limpo
   ```powershell
   $env:ISO_PRO_JWT_SKIP_TLS_VERIFY='1'   # se Node local falhar com UNABLE_TO_VERIFY_LEAF_SIGNATURE
   $env:ISO_PRO_SMOKE_STAGING='1'
   npm run ops:smoke-diario
   ```
   Latência HTTPS local (touch REST): SP ~36 ms vs prod US ~505 ms (mesmo PC).
   Contagens SP pós-restore: docs 4074 · itens 26158 · materiais 3646 · users 11 · tenants 3.

## Fase 3 — Cutover (produção)

**Executado 2026-08-02** — destino: `ofeogtjydjdjrmrekebh` (`iso-pro-staging-sp` / sa-east-1).

1. [x] Refresh dump public+auth US → restore SP (antes do switch).
2. [x] Backup local rollback: `secrets/env.rollback-us-east-1.local` + `secrets/pdf-worker.rollback-us-east-1.local.env`
3. [x] Ordem aplicada:
   - [x] `/etc/iso-pro/atendimento-gateway.env` → SP → `systemctl restart` (health 200)
   - [x] `/etc/iso-pro/pdf-worker.env` → SP → restart (active)
   - [x] Build web com `VITE_SUPABASE_*` SP → `deploy:web` (bundle contém ref SP; US=0)
4. [ ] Smoke Confirmar no canteiro (Ctrl+F5 no browser; telemetria `via=gateway`; alvo p95 &lt; 1,5s)
5. [ ] App mobile / instaladores de campo com URL SP (se usarem build embutido)
6. [ ] Monitorizar 24–48h; manter projecto US (`huvktaxsosxrfpvdigxq`) até fechar janela de rollback
7. [ ] (Opcional) Renomear projecto SP no Dashboard de `iso-pro-staging-sp` → nome de produção

### Rollback rápido

1. Restaurar `secrets/*.rollback-us-east-1.*` para `.env` + `pdf-worker.local.env`
2. Recriar `atendimento-gateway.local.env` a partir do pdf-worker US
3. `npm run deploy:atendimento-gateway` → `deploy:pdf-worker` → `deploy:web`

## Rollback

1. Repor env US na VM (gateway + pdf-worker) e no build web.
2. `deploy:web` + restart serviços.
3. Só se o dump SP não tiver escrito dados críticos após cutover — senão reconciliar deltas.

## Critérios de sucesso

- Confirmar multi-desenho canteiro: **p95 &lt; 1,5s**
- Zero recibo sem `snapshot_updated_at` / ACK
- Telemetria `[atendimento] via=gateway` estável
- Backup diário activo no projecto SP

## Relação com o gateway BR

| Etapa | Caminho Confirmar | Latência típica |
|---|---|---|
| Antes | Browser 4G → East US | 15–40s (HTTP preso) |
| Agora (gateway) | Browser → VM BR → East US | alvo p95 &lt; 3s |
| Após sa-east-1 | Browser → VM BR → São Paulo | alvo p95 &lt; 1,5s |

O gateway **permanece** útil após a migração (ACK estável, service role fora do Vite, reconcile por chave).
