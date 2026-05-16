# Contribuir

## Requisitos

- **Node.js** ≥ 22 (vê `.nvmrc`). Com `.npmrc` (`engine-strict=true`), `npm ci` / `npm install` **falham** se a versão de Node não cumprir `package.json` → `engines`.
- Dependências: `npm ci` (preferível a `npm install` para lockfile exacto).

## Limpar artefactos de build

```bash
npm run clean
```

Remove `dist/`, `dist-electron/`, `build/` e o bundle dev `electron/.dev-main.mjs*`. Não apaga `release/` (instaladores).

## Antes de abrir um PR

Corre localmente o mesmo fluxo do CI:

```bash
npm run ci
```

Se o repositório tiver acabado de adicionar dependências (ex.: `@sentry/react`), corre **`npm install`** antes para actualizar o `package-lock.json` e evita falhas de `npm ci` no GitHub.

Smoke E2E sobre o bundle web (Playwright, sem Electron): `npm run build:web` e depois `npm run test:e2e` (usa `npx` para não obrigar dependência no lockfile).

Inclui typecheck, testes, lint, build (Vite + Electron), ícone e `npm audit`.

## Desenvolvimento

- Web + Electron em dev: `npm run dev`
- Só browser: `npm run dev:web`

## Estilo

- `.editorconfig` e ESLint do projeto — evita debates de formatação no review.

## Pull requests

Usa o modelo que o GitHub sugere ao abrir o PR; referencia issues quando fizer sentido.

## Workflows (GitHub Actions)

Alterações em `.github/workflows/` disparam o workflow **Lint workflows** ([actionlint](https://github.com/rhysd/actionlint)) para validar sintaxe e expressões `${{ }}`.

O workflow **CI** na raiz corre `npm run ci` **e** smoke E2E web (Playwright) após o build — ver `README.md` e `npm run test:e2e`.

## Releases Windows e EULA

Antes de publicar um instalador NSIS a clientes, confirma que **`legal/EULA.txt`** está actualizado com o texto jurídico definitivo (o modelo no repositório não substitui revisão por advogado). Ver também `README.md` → *Direitos de autor, EULA e terceiros*.
