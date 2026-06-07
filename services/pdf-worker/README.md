# PDF Worker — I.S.O PRO

Processo Node que consome jobs da fila `pdf_jobs` (Postgres) e gera PDFs com fontes fiáveis.

## Requisitos

- Node 22+
- Variáveis: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Playwright Chromium (`npx playwright install chromium`) para relatórios HTML
- Fontes Noto em `./fonts/` (copiadas por `npm run sync:rir-fonts` na raiz do projeto)

## Desenvolvimento

```bash
# Na raiz do iso-pro-desktop
npm run sync:rir-fonts
npm run build:pdf-worker
npm install playwright   # uma vez na VM/servidor
npx playwright install chromium
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run pdf-worker:start
```

## Produção (systemd)

1. Copiar `dist/`, `fonts/`, `package.json` e `node_modules` para `/opt/iso-pro-pdf-worker`
2. Criar `/etc/iso-pro/pdf-worker.env`:

```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
PDF_WORKER_POLL_MS=2000
PDF_WORKER_ID=vm-1
```

3. Instalar unit `systemd/pdf-worker.service` e `systemctl enable --now pdf-worker`

## Docker

```bash
npm run build:pdf-worker
docker build -f services/pdf-worker/Dockerfile -t iso-pro-pdf-worker .
docker run --env-file /etc/iso-pro/pdf-worker.env iso-pro-pdf-worker
```

## Tipos suportados

| tipo | Motor |
|------|--------|
| `rir` | pdf-lib + Noto TTF |
| `rnc`, `relatorio_fotografico`, `planejamento_campo`, `etiqueta` | Playwright + Paged.js |

## Limpeza

Edge Function `pdf_cleanup` — cron com header `x-iso-pro-cron-secret` = `ISO_PRO_PDF_CLEANUP_CRON_SECRET`.
