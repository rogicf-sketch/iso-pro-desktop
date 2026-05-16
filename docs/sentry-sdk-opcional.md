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

## Documentação Sentry

- [React](https://docs.sentry.io/platforms/javascript/guides/react/)
- [React Native](https://docs.sentry.io/platforms/react-native/)
