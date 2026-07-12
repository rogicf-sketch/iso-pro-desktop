# Triagem Security Advisor (2026-07-11)

Fonte: `npx supabase db advisors --linked --type security`  
Projecto: `huvktaxsosxrfpvdigxq`

| Nível | Qtd | Veredicto |
|-------|-----|-----------|
| ERROR | **0** | OK — nada a bloquear go-live |
| WARN  | 85 | Ruído + dívida (ver abaixo) |
| INFO  | 2 | Membership/tokens sem policy (acesso só service/definer) |

Performance Advisor: **72** `multiple_permissive_policies` (esperado com várias policies por tabela; optimizar depois, não urgente).

---

## Agrupamento (security)

| Tipo | Qtd | Risco real | Acção |
|------|-----|------------|--------|
| `rls_policy_always_true` | 30 | Médio — policies `anon`/`authenticated` permissivas em tabelas de negócio | Já mitigado em parte por JWT/`executeWrite`; **não** apertar em massa sem staging |
| `anon_security_definer_function_executable` | 23 | Médio — RPCs sensíveis chamáveis com anon key | Revogar `EXECUTE` de `anon` **só** onde a app já usa JWT; testar em staging |
| `authenticated_security_definer_function_executable` | 23 | Baixo/médio — espelho do acima para role authenticated | Idem |
| `function_search_path_mutable` | 8 | Baixo — hardening clássico | Migration batch `SET search_path` |
| `auth_leaked_password_protection` | 1 | Baixo/médio | **Feito 2026-07-11** (Email provider + min length 8) |
| `rls_enabled_no_policy` | 2 | Baixo se só service role escreve | Confirmar; policies JWT depois |

### Tabelas com policy always-true
`desktop_licencas`, `dispositivos_mobile`, `iso_pro_relatorio_snapshot`, `iso_pro_snapshot`, `materiais`, `mobile_logs_acesso`, `perfil_permissoes`, `perfis_acesso`, `usuario_permissoes`, `usuarios_sistema`

### Funções DEFINER executáveis por anon (amostra crítica)
Auth/sessão: `iso_pro_autenticar_usuario`, `iso_pro_criar_token_operacional`, `iso_pro_validar_token_operacional`, `iso_pro_refresh_usuario_sessao`, …  
Outbox/PDF/prune: `iso_pro_escala_outbox_*`, `claim_pdf_job`, `iso_pro_prune_*`

---

## Quick win Auth (HaveIBeenPwned)

Na página Attack Protection o botão diz **Configure in email provider** — o toggle não fica aí.

1. Abre: https://supabase.com/dashboard/project/huvktaxsosxrfpvdigxq/auth/providers?provider=Email  
   (Authentication → Sign In / Providers → **Email**)
2. Activa **Prevent use of leaked passwords** (HaveIBeenPwned)
3. Opcional: reforça comprimento mínimo (≥ 8) e caracteres exigidos
4. Save

**Captcha:** deixa OFF por agora (precisa chave hCaptcha/Turnstile e pode atrapalhar login de campo). Só activar se houver abuso de bots.

Nota: isto protege fluxos **Supabase Auth** (JWT). Login legado via RPC `iso_pro_autenticar_usuario` não passa por este check — MFA admin já mitiga o piloto.

---

## Ordem cirúrgica (não fazer tudo de uma vez)

1. **Auth:** activar HaveIBeenPwned no provider Email (secção acima) — **feito**
2. **search_path** nas 8 funções — **feito** (migration `20260711200000`)
3. **P0 (2026-07-12):** drop policies legadas `*_insert/update/delete/select_anon` com `true` que OR-bypassavam `*_tenant_rls` + revogar EXECUTE anon em PDF/prune/trigger/link-admin — migration `20260712010000` — **feito em prod**
   - Advisor: `rls_policy_always_true` **30 → 1** (resta `mobile_logs_acesso_insert_anon`, sem `tenant_id`)
   - Advisor: `anon_security_definer_*` **23 → 13** (só auth legado + outbox + audit)
4. **P1 (2026-07-12):** `mobile_logs` INSERT com WITH CHECK real + SELECT só service_role; revogar claim/complete/fail/process_one da outbox para anon — migration `20260712020000` — **feito em prod**
   - Advisor: `rls_policy_always_true` **1 → 0**
   - Advisor: `anon_security_definer_*` **13 → 9** (auth + enqueue + flush + audit)
5. **P2 (2026-07-12):** revogar `enqueue` / `enqueue_from_patch` de anon (só trigger DEFINER + service_role); clientes ficam com `flush` + `status` — migration `20260712030000` — **feito em prod**
6. Onda JWT-only: revogar auth RPC anon quando 100% login Supabase Auth

---

## O 500 no Unified Logs

Um `500` pontual no preview **não** é o Security Advisor. Ver **Logs → API / Postgres** no minuto `18:38`. Smoke diário recente devolveu `401` esperado em REST sem JWT (marcado OK).

---

## Comando para reavaliar

```powershell
npx supabase db advisors --linked --type security --level warn
npx supabase db advisors --linked --type performance --level warn
```

Relacionado: `docs/GUIA-RESTAURO-STAGING.md` · `docs/NIVEL-MUNDIAL-PROXIMOS.md`
