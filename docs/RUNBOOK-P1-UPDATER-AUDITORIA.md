# P1 — updater Desktop + auditoria before/after

Status (2026-08-31): **código / web / Setup / feed LIVE = 0.1.260** · APK **1.0.125** · rollout campo + smoke JWT — `CHECKLIST-ROLLOUT-SEMANA1.md`.

## Updater Electron

- Feed default: `https://isoprogestaodemateriais.com.br/updates/iso-pro-desktop/`
  (`electron/main/updateFeed.ts` + `electron-builder.yml`)
- Override runtime: `ISO_PRO_UPDATE_FEED_URL`
- `verify-release` falha se o publish URL ainda tiver `example.com`

### Estado do feed (verificar sempre)

```powershell
Invoke-WebRequest -Uri "https://isoprogestaodemateriais.com.br/updates/iso-pro-desktop/latest.yml" -UseBasicParsing | Select-Object -ExpandProperty Content
# Esperado: version: 0.1.260 (alinhado a package.json)
```

Se LIVE ainda mostrar versão antiga (ex.: 0.1.239), publicar com os passos abaixo.

### Publicar um release (ops)

1. `npm run dist:win:off-path` (ou `dist:win`) + `node scripts/write-latest-yml.mjs`
2. Copiar para `release/installers/atuais/` (Setup + portable + `latest.yml` + `SHA256SUMS.txt`)
3. No host web (nginx), pasta pública `/updates/iso-pro-desktop/` com:
   - `latest.yml`
   - `I.S.O PRO Setup x.y.z.exe` (+ `.blockmap` se existir)
   - `SHA256SUMS.txt` (opcional, boa prática)
4. Smoke: instalar EXE antigo → arrancar → deve descarregar update (log main `autoUpdater`)

Ou em um passo (requer `scripts/deploy-web.env` + SSH):

```powershell
npm run dist:win:off-path
node scripts/write-latest-yml.mjs
npm run publish:updates-feed
```

Nginx exemplo:

```nginx
location /updates/iso-pro-desktop/ {
  alias /var/www/iso-pro/updates/iso-pro-desktop/;
  autoindex off;
  add_header Cache-Control "no-cache";
}
```

Disco no host: `/var/www/iso-pro/updates/iso-pro-desktop/`.  
`deploy:web` preserva `updates/` (`rsync --exclude`).

**Artefactos locais prontos (0.1.260):** `release/installers/atuais/I.S.O PRO Setup 0.1.260.exe` + portable + `latest.yml` + `SHA256SUMS.txt`.


## Auditoria before/after (P1)

| Módulo | Eventos |
|--------|---------|
| Recebimentos | já gold standard |
| Materiais | `material_criado`, `material_editado`, exclusão com amostra |
| Inventário | `inventario_criado`, `inventario_editado`, `inventario_fechado` |
| Documentos | `documento_criado`, `documento_editado` (+ cancel com before/after status) |

Filtros na página Usuários → Auditoria (abas: Cadastro · Auditoria deste PC · Auditoria nuvem · Eventos de dominio). Eventos locais com rótulos PT e badges.

## Contagens do Painel (cache TTL)

- Tabela `iso_pro_operacao_contagens_cache` + RPC `iso_pro_operacao_contagens` (TTL **90s**)
- Compute: `iso_pro_operacao_contagens_compute`
- Invalidar: `iso_pro_invalidate_operacao_contagens(tenant)` — cliente chama best-effort apos writes SoT (recebimentos, documentos, inventarios, RIR, RNC)
- Migração: `20260805220000_iso_pro_operacao_contagens_cache.sql`
- Cliente inalterado (`fetchOperacaoContagens`)

## Checklist campo

Ver `docs/CHECKLIST-ROLLOUT-SEMANA1.md` (Setup **0.1.260** + APK **1.0.125** + smoke JWT + PDFs v6).

## Ainda P1 (humano / comercial)

| Item | Estado |
|------|--------|
| Sentry regra `iso.dual_write_failure` | Feito 2026-08-06 — `CHECKLIST-ALERTAS-SENTRY.md` |
| Feed updater LIVE = 0.1.260 | **FEITO** 2026-08-31 |
| Rollout + smoke JWT nos posts | Pendente — `CHECKLIST-ROLLOUT-SEMANA1.md` |
| API/webhooks públicos | Em espera — **só com contrato comercial** |

P2 (domain events list/smoke): ver `docs/P2-DOMAIN-EVENTS.md`.
