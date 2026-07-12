# Guia — Deploy web automático (GitHub Actions)

Workflow: `.github/workflows/deploy-web.yml`  
Comando local (igual): `npm run deploy:web`

---

## Secrets necessários (Settings → Secrets → Actions)

Já tens (smoke):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Falta criar:

| Secret | Valor |
|--------|--------|
| `VITE_SENTRY_DSN` | o DSN Sentry (mesmo do `.env`) |
| `DEPLOY_SSH_TARGET` | ex. `ubuntu@IP` ou user@host (igual ao `deploy-web.env`) |
| `DEPLOY_SSH_PRIVATE_KEY` | conteúdo **completo** da chave privada SSH (inclui `BEGIN`/`END`) |
| `DEPLOY_REMOTE_PATH` | opcional — default no script `/var/www/iso-pro` |
| `DEPLOY_REMOTE_STAGING` | opcional |

Copia `DEPLOY_SSH_*` do teu `scripts/deploy-web.env` local (não commits).

---

## Environment `production`

O workflow usa `environment: production`. Na primeira vez o GitHub pode pedir criar o environment em **Settings → Environments → New environment → `production`**.

---

## Como publicar

1. Confirma secrets  
2. **Actions → Deploy web → Run workflow**  
3. Testa https://isoprogestaodemateriais.com.br/#/login (Ctrl+F5)

Ou: `git tag web-v0.1.90 && git push origin web-v0.1.90`

---

## Nota

PC instalador e APK continuam manuais nesta onda (CD web primeiro — maior tráfego / menor risco).
