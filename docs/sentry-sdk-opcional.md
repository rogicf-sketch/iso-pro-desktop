# Sentry — SDK oficial (integrado)

O **desktop** (`@sentry/react`) e o **mobile** (`@sentry/react-native`) usam o SDK oficial quando defines o DSN:

- Desktop / web: `VITE_SENTRY_DSN` — `initSentryDesktop()` em `src/main.tsx`, `captureException` em `src/lib/errorReporting.ts`.
- Mobile: `EXPO_PUBLIC_SENTRY_DSN` — `initSentryMobile()` + `Sentry.wrap` em `app/_layout.tsx`.

O módulo `src/lib/sentryHttp.ts` (só desktop) mantém o **envelope HTTP** para testes unitários e referência; o fluxo da app usa o SDK.

## Depois de `git pull` (obrigatório para CI)

Os pacotes `@sentry/*` estão no `package.json`. É preciso **instalar dependências** e **commitar o `package-lock.json`** actualizado na tua máquina (onde o `npm` funciona):

```powershell
cd iso-pro-desktop
npm install
npm run ci
```

```powershell
cd iso_pro_mobile
npm install
npm run ci
```

Se o `npm ci` no GitHub falhar com "lockfile out of sync", falta o passo acima.

## Expo / EAS (mobile)

Preferir `npx expo install @sentry/react-native` para alinhar versões com o SDK Expo, depois `npm install` na raiz.

## Alertas operacionais (recomendado)

No Sentry, criar alertas (Issues / Alerts) para mensagens que começam por:

| Mensagem | Significado |
|----------|-------------|
| `iso.snapshot_conflict` | Conflito OCC no snapshot (duas gravações ao mesmo tempo) |
| `iso.dual_write_failure` | Falha a projectar escala / flush outbox |
| `iso.offline_flush` | Fila offline mobile (sucesso ou falha no flush) |

Filtro sugerido: `message:"iso."` + environment `production`.

## Activar DSN (checklist rápido)

1. Criar projecto em [sentry.io](https://sentry.io) (plataforma **React** para PC/web; **React Native** para mobile — ou um projecto partilhado no início).
2. Copiar o **DSN** (Client Keys).
3. Desktop/web — `.env` / secrets de build:
   ```env
   VITE_SENTRY_DSN=https://...@....ingest.sentry.io/...
   ```
4. Mobile — `.env` / EAS Secrets:
   ```env
   EXPO_PUBLIC_SENTRY_DSN=https://...@....ingest.sentry.io/...
   ```
5. Rebuild e publicar.
6. Validar formato local: `node scripts/validate-sentry-dsn.mjs`
7. Em staging (ou tenant piloto), forçar um erro de teste e confirmar evento no Sentry.

Sem DSN a app **não quebra** — só regista no console.

## Documentação Sentry

- [React](https://docs.sentry.io/platforms/javascript/guides/react/)
- [React Native](https://docs.sentry.io/platforms/react-native/)
