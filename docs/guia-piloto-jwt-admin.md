# Guia — Primeiro piloto JWT (`admin`)

Passo a passo menu a menu no I.S.O PRO + Supabase Dashboard.

**Ambiente documentado:** projecto `huvktaxsosxrfpvdigxq` · tenant principal `00000000-0000-0000-0000-000000000001`

---

## Onde se faz cada coisa

| Passo | Onde |
|--------|------|
| Migrations, hook, secret na nuvem | **Supabase Dashboard** ou CLI |
| Secret no PC | **Configurações → Nuvem** |
| Ligar utilizador | **Usuários** → editar → **Ligar** |
| Validar JWT | **Dispositivos mobile** → Sync atendimento |
| Teste funcional | **Atendimento** → 1 baixa |

---

## A. Supabase Dashboard (1× antes da app)

1. **Edge Functions → Secrets** → `ISO_PRO_LINK_AUTH_SECRET` (valor longo aleatório).
2. **Authentication → Users → Add user**
   - Email: real ou `admin@empresa.local`
   - Password: **mesma** que o `admin` usa no I.S.O PRO
3. Copiar **UUID** (`auth.users.id`).

---

## B. I.S.O PRO — Configurações

1. Login como administrador.
2. **Configurações** → aba **Nuvem**.
3. **Segredo ligacao Auth (ISO_PRO_LINK_AUTH_SECRET)** = mesmo valor do Dashboard.
4. **Salvar configurações**.

---

## C. I.S.O PRO — Utilizadores

1. **Usuários** → editar **`admin`** (utilizador existente, não “Novo usuario”).
2. Secção **Supabase Auth (JWT / tenant)**.
3. Colar UUID → **Ligar**.
4. Confirmar **Auth user id actual** preenchido.

---

## D. Logout + login

1. Sair completamente.
2. Entrar com login/senha habituais do `admin`.

---

## E. Validar — Dispositivos mobile

1. **Dispositivos mobile** → **Sincronização de atendimento (nuvem)**.
2. **Atualizar auditoria**.
3. Esperado: modo **`jwt_forte`**, role **`authenticated`**, sessão JWT **activa**.

---

## F. Teste — Atendimento

1. **Atendimento** → 1 baixa teste.
2. Voltar ao painel sync → comando origem **PC**, estado **Confirmado**.

---

## Fluxo resumido

```
Supabase (user + secret)
    → Configurações → Nuvem → Salvar
    → Usuários → admin → Ligar UUID
    → Logout → Login
    → Dispositivos mobile (jwt_forte)
    → Atendimento (teste)
```

---

## Problemas comuns

| Sintoma | Acção |
|---------|--------|
| Sem secção Supabase Auth | Editar utilizador **existente** + Supabase configurado |
| Ligar falha | Secret errado ou Edge Function em falta |
| `anon_compativel` | UUID não ligado ou falta logout/login |
| `jwt_desalinhado` | Tenant activo ≠ membership |

---

## Documentos relacionados

- [`CHECKLIST-ATIVACAO-JWT.md`](../CHECKLIST-ATIVACAO-JWT.md)
- [`checklist-ativacao-jwt.html`](checklist-ativacao-jwt.html)
- [`email-ti-ativacao-jwt.md`](email-ti-ativacao-jwt.md)
