# Segredos locais (não versionar)

Ficheiros `*.local.txt` nesta pasta estão no `.gitignore`.

| Ficheiro | Uso |
|----------|-----|
| `ISO_PRO_ADMIN_USER_SECRET.local.txt` | Mesmo valor que o secret `ISO_PRO_ADMIN_USER_SECRET` no Supabase Dashboard (Edge Functions → Secrets) e o campo em **Configurações → Supabase e nuvem**. |

Depois de criar ou rodar o valor:

1. Dashboard → **Add or Replace Secrets** → Name `ISO_PRO_ADMIN_USER_SECRET` → Value = conteúdo do `.local.txt`
2. App → Configurações → colar o mesmo → Salvar
