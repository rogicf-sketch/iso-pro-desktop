# Guia — secrets GitHub para Smoke diario (sem CLI)

Workflow: `.github/workflows/smoke-diario.yml`  
Cron: 07:00 UTC (~04:00 BRT)

---

## No browser

1. Abre o repositório do **iso-pro-desktop** no GitHub  
2. **Settings** → **Secrets and variables** → **Actions**  
3. **New repository secret** (3×):

| Nome | Valor (do teu `.env` de produção) |
|------|-------------------------------------|
| `VITE_SUPABASE_URL` | `https://huvktaxsosxrfpvdigxq.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | a anon key de produção |
| `ISO_PRO_E2E_TENANT_ID` | `00000000-0000-0000-0000-000000000001` |

4. **Actions** → workflow **Smoke diario ops** → **Run workflow** (teste manual)

---

## Com GitHub CLI (opcional)

```powershell
winget install --id GitHub.cli --source winget
gh auth login
npm run ops:activar-secrets-smoke
gh workflow run "Smoke diario ops"
```

Não commits secrets. Só no GitHub Actions secrets.
