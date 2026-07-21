# Checklist — Activação JWT / RLS forte (equipa TI)

Uso interno: marcar **OK** e data em cada passo.  
Aplica-se ao **iso-pro-desktop** (Web **0.1.75+**, Windows **0.1.75+**) e **iso_pro_mobile** (**1.0.43+**) no **mesmo** projecto Supabase.

**Objectivo:** passar de `anon_compativel` (app filtra `tenant_id` na query) para `jwt_forte` (PostgreSQL valida `tenant_id` no JWT em sessões `authenticated`).

**Regra de ouro:** até activar o hook JWT **e** ligar utilizadores, o sistema **continua a funcionar** em modo compatível. Não há “janela de corte” obrigatória.

---

## Cabeçalho (preencher)

| Campo | Valor |
|-------|--------|
| Obra / tenant UUID | `00000000-0000-0000-0000-000000000001` |
| URL Supabase | https://huvktaxsosxrfpvdigxq.supabase.co |
| URL produção web | https://isoprogestaodemateriais.com.br |
| Versão PC/Web testada | 0.1.153+ (sync outbox idle + ensure_pending) |
| Versão mobile testada | 1.0.78+ |
| Responsável TI | |
| Data início | 2026-07-11 |
| Data go-live JWT | |
| PR1 dual-path (sem cutover) | **Feito** 2026-07-12 — migration `20260712120000` + login prefer JWT |

---

## Fase PR1 — Dual-path (já em produção; sem revogar anon)

| # | Item | OK? | Data |
|---|------|-----|------|
| P1.1 | Migration `20260712120000_iso_pro_resolver_auth_return_user.sql` (`db push`) | [x] | 2026-07-12 |
| P1.2 | Desktop/Web login `authenticateIsoProPreferJwt` + audit `authPath` | [x] | `4615b01` / `web-v0.1.91` |
| P1.3 | Mobile login prefer JWT | [x] | `69f875a` |
| P1.4 | `npm run jwt:auditar-link` — listar `rpc_only` vs `jwt_ready` | [x] | 2026-07-12: admin + ceci `jwt_ready`; restantes activos ainda podem ser `rpc_only` |
| P1.5 | Ligar restantes activos (Fase 4) até `rpc_only = 0` | [x] | 2026-07-21: activos=2 jwt_ready=2 rpc_only=0 (`ops-security-baseline`) |
| P1.6 | Só então: staging + revogar EXECUTE anon em `iso_pro_autenticar_usuario` | [x] | 2026-07-21 staging `anon_execute=false`; **prod ainda com fallback** |
| P1.7 | Mobile APK com JWT-prefer + Sentry `auth_path` (`client: mobile`) | [x] | 2026-07-12: APK 1.0.61 — login OK + 1 atendimento OK |
| P1.8 | Acompanhar Sentry `iso.auth_path` (web + mobile) ≥ alguns dias | [ ] | paths esperados: `jwt` / `rpc_fallback` / `rpc_only` |

## Fase 0 — Pré-requisitos (obrigatório)

| # | Verificação | OK? | Data |
|---|-------------|-----|------|
| 0.1 | Backups Supabase activos + **teste de restauro** já feito (registar data) | [ ] | |
| 0.2 | Ambiente **staging** ou tenant de teste separado (recomendado para 1.º piloto) | [x] | 2026-07-21 `blyrzngunpxxgpdmoypo` |
| 0.3 | `npm run ci` / releases **0.1.75** (PC) e **1.0.43** (mobile) instalados em campo piloto | [ ] | |
| 0.4 | Equipa alinhada: **nuvem = referência** (`CHECKLIST-GO-LIVE.md` preenchido) | [ ] | |

---

## Fase 1 — Migrações SQL (Supabase)

Aplicar na ordem (SQL Editor ou `supabase db push`). Ficheiros em `supabase/migrations/`.

| # | Migration | Conteúdo | OK? | Data |
|---|-----------|----------|-----|------|
| 1.1 | `20260705140000_iso_pro_patch_snapshot_merge_keys.sql` | Merge por `id` em patch snapshot | [ ] | |
| 1.2 | `20260705170000_iso_pro_registrar_atendimento_mobile.sql` | RPC gravação mínima atendimento | [ ] | |
| 1.3 | `20260705180000_iso_pro_atendimento_comandos_arquitetura.sql` | Comandos idempotentes + tabela auditoria | [ ] | |
| 1.4 | `20260706220000_iso_pro_atendimento_comandos_admin.sql` | Painel admin `iso_pro_list_atendimento_comandos` | [ ] | |
| 1.5 | `20260706230000_iso_pro_rls_fase3_comandos_jwt.sql` | RLS comandos + assert tenant + bootstrap JWT | [ ] | |
| 1.5b | `20260711120000_iso_pro_rls_escala_jwt_align.sql` | P0: RLS híbrido nas tabelas de escala + assert em snapshot/escala RPCs | [x] | 2026-07-11 |
| 1.6 | Migrações JWT base já existentes: `20260207130000`, `20260604160000`, `20260607120000` | Hook + membership + RLS híbrido | [ ] | |

### Validação rápida (SQL Editor)

Executar `supabase/snippets/validar_pos_melhorias.sql` e confirmar que aparecem:

- `iso_pro_jwt_tenant_id`
- `custom_access_token_hook`
- `iso_pro_assert_tenant_caller`
- `iso_pro_resolver_auth_email_sessao`
- `iso_pro_auditar_rls_jwt_estado`
- `iso_pro_list_atendimento_comandos`
- `iso_pro_submit_atendimento_comando`

| # | Resultado esperado | OK? |
|---|-------------------|-----|
| 1.7 | Funções listadas sem erro | [ ] |
| 1.8 | `iso_pro_snapshot`: RLS ligado + políticas `*_tenant_rls` | [ ] |
| 1.9 | `iso_pro_atendimento_comandos`: RLS ligado | [ ] |

---

## Fase 2 — Supabase Auth: Custom Access Token Hook

| # | Passo | OK? | Data |
|---|-------|-----|------|
| 2.1 | Dashboard → **Authentication** → **Hooks** → **Custom Access Token** | [x] | 2026-07-11 (`config push` OK) |
| 2.2 | Activar hook com função Postgres: `custom_access_token_hook` | [x] | 2026-07-11 |
| 2.3 | Confirmar que novos tokens incluem claim `tenant_id` (ver Fase 5) | [x] | 2026-07-11 `jwt:validar-piloto` → tenant_id OK |

**Nota:** O hook lê `iso_pro_auth_membership`. Sem membership, login Auth **falha** com “sem empresa associada” — por isso só ligar utilizadores **depois** do hook estar activo **ou** testar primeiro em conta piloto.

---

## Fase 3 — Edge Function: ligar utilizadores Auth

| # | Passo | OK? | Data |
|---|-------|-----|------|
| 3.1 | Definir secret: `ISO_PRO_LINK_AUTH_SECRET` (Dashboard → Edge Functions → Secrets) | [x] | ficheiro `release/ISO_PRO_LINK_AUTH_SECRET.txt` |
| 3.2 | Deploy: `supabase functions deploy iso_pro_link_auth_user --no-verify-jwt` | [x] | ACTIVE v14 |
| 3.3 | No **PC** → Configurações → Supabase → campo **Segredo ligação Auth** = mesmo valor do secret | [ ] | sync snapshot feito pelo script; confirmar UI |
| 3.4 | Documentar secret em cofre da empresa (não em repositório público) | [ ] | |

Detalhe: `supabase/functions/README.md` (secção `iso_pro_link_auth_user`).

---

## Fase 4 — Por utilizador: conta Supabase Auth + ligação

Repetir para cada utilizador que deve ter JWT forte (começar por **1 admin piloto**).

| # | Passo | OK? | Notas |
|---|-------|-----|-------|
| 4.1 | Dashboard → **Authentication** → **Users** → **Add user** | [x] | `admin@isopro.local` |
| 4.2 | Password = **mesma** que o utilizador usa no I.S.O PRO (ou comunicar nova e actualizar senha ISO PRO) | [x] | alinhada Auth ↔ ISO PRO |
| 4.3 | Copiar **UUID** do user Auth (`auth.users.id`) | [x] | `faabe730-1fee-4bad-9ca0-6fed5faa4ee5` |
| 4.4 | PC → **Utilizadores** → editar utilizador → **Ligar Supabase Auth** (UUID) | [x] | admin ligado |
| 4.5 | SQL: `SELECT COUNT(*) FROM iso_pro_auth_membership WHERE tenant_id = '<UUID>'` aumentou | [x] | memberships = 1 |
| 4.6 | Utilizador piloto faz **logout + login** no PC/Web | [x] | validado via `jwt:validar-piloto` |

**Ordem recomendada:** 1 admin → 2 operadores atendimento → restante equipa.

---

## Fase 5 — Verificação no painel (sem SQL)

Login como administrador mobile (`configuracoes` / `mobile` → administrar).

| # | Onde | Resultado esperado | OK? |
|---|------|-------------------|-----|
| 5.1 | **Dispositivos mobile** → secção **Sincronização de atendimento (nuvem)** | Tabela de comandos carrega (ou aviso claro se migration em falta) | [ ] |
| 5.2 | Mesma secção → faixa **Segurança RLS/JWT** | Após login piloto com Auth ligado: `modo jwt_forte`, `jwtAlinhado` sim | [x] | `jwt:validar-piloto` 2026-07-11 |
| 5.3 | Antes da ligação Auth | `modo anon_compativel` — **normal**, não é erro | [x] | |
| 5.4 | Utilizador **sem** `auth_user_id` | Continua `anon_compativel`; atendimento/sync funcionam | [ ] | ceci / novo.login |

---

## Fase 6 — Testes funcionais (piloto)

| # | Teste | Resultado esperado | OK? |
|---|-------|-------------------|-----|
| 6.1 | Login piloto (JWT) → **Atendimento** → 1 baixa teste | Sucesso; comando aparece no painel sync (origem PC) | [ ] |
| 6.2 | Mobile **1.0.43** → mesma obra → 1 baixa teste | Comando origem Mobile; PC vê na auditoria | [ ] |
| 6.3 | PC B (outro browser) → Ctrl+F5 → mesmo atendimento | Dados coincidem | [ ] |
| 6.4 | `npm run test:load:atendimento -- --operators 10 --rounds 2` (staging) | ≥ 95% sucesso | [ ] |
| 6.5 | Logout → login utilizador **sem** Auth ligado | `anon_compativel`; operações normais | [ ] |

Variáveis para teste de carga:

```powershell
$env:SUPABASE_URL = "https://<projecto>.supabase.co"
$env:SUPABASE_ANON_KEY = "<anon-key>"
$env:SUPABASE_TENANT_ID = "<tenant-uuid>"
cd iso-pro-desktop
npm run test:load:atendimento -- --operators 50 --rounds 3
```

---

## Fase 7 — Rollout produção

| # | Passo | OK? | Data |
|---|-------|-----|------|
| 7.1 | Comunicar equipa: versão mínima PC **0.1.75**, mobile **1.0.43** | [ ] | |
| 7.2 | Instalar `I.S.O PRO Setup 0.1.75.exe` nos postos críticos | [ ] | |
| 7.3 | Ligar Auth utilizador a utilizador (Fase 4) em ondas de 5–10 | [ ] | |
| 7.4 | Monitorizar painel sync 48h: `pendentes = 0` em operação normal | [ ] | |
| 7.5 | Registar incidentes e ATDs afectados (estorno manual se histórico antigo incompleto) | [ ] | |

---

## Rollback (se algo correr mal)

| Situação | Acção | Risco |
|----------|-------|-------|
| Hook JWT a bloquear logins Auth | Desactivar hook no Dashboard (volta anon) | Baixo |
| Utilizador não entra com JWT | Remover `auth_user_id` no módulo Utilizadores | Baixo; volta anon |
| Erros `ISO_PRO_TENANT_FORBIDDEN` | Verificar `tenant_id` activo na app = membership no Auth | Médio |
| Painel sync vazio com aviso RPC | Aplicar migrations Fase 1 em falta | Baixo |

**Não** desactivar RLS em produção sem plano; preferir rollback por utilizador (remover ligação Auth).

---

## Modos de operação (referência)

| Modo | `auth.role()` | Comportamento |
|------|---------------|---------------|
| `anon_compativel` | `anon` | App envia `tenant_id` nas queries; RLS exige linha com tenant válido |
| `jwt_forte` | `authenticated` | JWT deve ter `tenant_id` = empresa activa; RPCs validam com `iso_pro_assert_tenant_caller` |
| `jwt_desalinhado` | `authenticated` | JWT tenant ≠ empresa seleccionada → **bloqueado** (corrigir tenant ou membership) |

---

## Opcional — forçar JWT no build

Variável de ambiente no build Web/Electron:

```env
VITE_ISO_PRO_JWT_AUTH=true
```

Por omissão, o bootstrap JWT está **activo** no cliente (tenta `signInWithPassword` após login RPC se existir `auth_user_id`). Para desactivar globalmente: `VITE_ISO_PRO_JWT_AUTH=false`.

---

## Contactos / documentos relacionados

| Documento | Uso |
|-----------|-----|
| `CHECKLIST-GO-LIVE.md` | Validação obra antes de JWT |
| `CHECKLIST-GO-LIVE-MATURIDADE.md` | Migration RLS escala P0, Sentry, smoke staging |
| `CHECKLIST-OPERACOES.md` | Operação diária PC + mobile |
| `docs/checklist-ativacao-jwt.html` | Página interactiva (web: `/checklist-ativacao-jwt.html`) |
| `supabase/snippets/validar_pos_melhorias.sql` | Auditoria pós-migration |
| `supabase/functions/README.md` | Secrets e deploy Edge Functions |
| `docs/runbook-operacao.md` | Runbook geral |
| `docs/guia-piloto-jwt-admin.md` | Passo a passo piloto `admin` (menus) |
| `docs/email-ti-ativacao-jwt.md` | Modelo email para equipa TI |
| Mobile Fase 3 JWT | `C:\IPB\mob\docs\fase-3-mobile-jwt.md` (APK **1.0.44**) |

### Exportar PDF

```powershell
# Gera release/CHECKLIST-ATIVACAO-JWT.pdf (Edge/Chrome) ou abre HTML
npm run docs:checklist-jwt-pdf

# Só abrir a pagina no browser
npm run docs:checklist-jwt-open
```

---

## Assinaturas

| Papel | Nome | Data | Assinatura |
|-------|------|------|------------|
| TI / Supabase | | | |
| Responsável obra | | | |
| Admin I.S.O PRO | | | |
