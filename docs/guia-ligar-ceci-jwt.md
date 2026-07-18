# Guia — Ligar utilizador `ceci` ao Supabase Auth (JWT)

**Objectivo:** `ceci` passar de `rpc_only` → `jwt_ready` (igual ao `admin`).  
**Sem cutover:** anon continua a funcionar até ligares.

| Campo | Valor |
|-------|--------|
| Tenant | `00000000-0000-0000-0000-000000000001` |
| Login I.S.O PRO | `ceci` |
| Nome | Cecilia |
| `usuario_id` | `7c361684-b378-4f28-b3fd-f0c253d2253b` |
| Email Auth sugerido | `ceci@isopro.local` (ou outro que preferires) |
| Password Auth | **a mesma** que `ceci` já usa no I.S.O PRO |

---

## 1) Criar user no Supabase Auth

1. Abre [Authentication → Users](https://supabase.com/dashboard/project/huvktaxsosxrfpvdigxq/auth/users).
2. **Add user** → **Create new user**.
3. Email: `ceci@isopro.local` (ou o que escolheres).
4. Password: a **mesma** senha do login `ceci` no I.S.O PRO.
5. Confirma criação e **copia o UUID** do user (`auth.users.id`).

---

## 2) Segredo no PC (se ainda não estiver)

1. Login como **admin** no I.S.O PRO.
2. **Configurações → Nuvem**.
3. Campo **Segredo ligação Auth** = valor de `ISO_PRO_LINK_AUTH_SECRET` (Dashboard → Edge Functions → Secrets).
4. **Salvar**.

---

## 3) Ligar no módulo Utilizadores

1. **Usuários** → editar **`ceci`** (não criar novo).
2. Secção **Supabase Auth (JWT / tenant)**.
3. Colar o UUID → **Ligar**.
4. Confirma que aparece **Auth user id actual**.

Alternativa CLI (só se o secret estiver no ambiente operacional, **não** no chat):

```json
POST .../functions/v1/iso_pro_link_auth_user
Header: x-iso-pro-link-secret: <secret>
{
  "usuarioId": "7c361684-b378-4f28-b3fd-f0c253d2253b",
  "tenantId": "00000000-0000-0000-0000-000000000001",
  "authUserId": "<UUID_COPIADO_DO_DASHBOARD>"
}
```

---

## 4) Validar

1. Logout completo.
2. Login com **`ceci`** / senha habitual.
3. No PC (como admin): `npm run jwt:auditar-link` **ou** SQL:

```sql
SELECT login,
  CASE WHEN auth_user_id IS NULL THEN 'rpc_only' ELSE 'jwt_ready' END
FROM public.usuarios_sistema
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND coalesce(ativo,false)
ORDER BY login;
```

Esperado: `admin` e `ceci` → **`jwt_ready`**.

4. Opcional: `npm run jwt:validar-piloto` (continua a validar o admin).

---

## Rollback (se algo falhar)

No mesmo ecrã de Utilizadores → **ceci** → remover ligação Auth (ou Edge com `"authUserId": null`).  
Volta a `rpc_only` sem perder o utilizador I.S.O PRO.
