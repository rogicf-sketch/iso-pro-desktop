# I.S.O PRO Desktop (Windows)

Aplicacao desktop em `React + TypeScript + Electron`, preparada para ser o executavel Windows do sistema.

## Repositorio

- [Contribuir](CONTRIBUTING.md) — `npm run ci`, fluxo de PR, desenvolvimento.
- [Runbook de operação](docs/runbook-operacao.md) — backups, incidentes, licenças, go-live.
- [Sentry (SDK + lockfile)](docs/sentry-sdk-opcional.md) — `@sentry/react` / `npm install` após pull.
- [Seguranca](SECURITY.md) — como reportar vulnerabilidades.
- **CI** (GitHub Actions): typecheck, testes, lint, build, ícone, **smoke E2E web (Playwright)**, audit.
- **Instalador Windows** (local): `npm run dist:win` — gera artefactos em `release/` e valida com **`verify-release`** + ficheiro **`SHA256SUMS.txt`** (hashes dos `.exe`). Ver secção abaixo.
- **Limpar artefactos** (`dist/`, `dist-electron/`, `build/`): `npm run clean` — detalhes em [CONTRIBUTING](CONTRIBUTING.md).
- **Node**: `.nvmrc` + `engines` no `package.json`; `.npmrc` com `engine-strict=true` faz `npm ci` falhar se a versão for incompatível.

## Instalacao

Requisito: **Node.js ≥ 22** (ver `.nvmrc`). Na raiz do clone:

```powershell
npm ci
npm run dev
```

Para desenvolvimento só no browser: `npm run dev:web`.

## Bundle web (mesmo código que o site)

O `vite build` gera `dist/` servido em produção (ex.: Nginx). O **número de versão** em `package.json` alimenta `__APP_VERSION__` no build — útil para confirmar que o servidor tem o mesmo artefacto que o CI (`npm run build:web && npm run test:e2e`).

- **Variáveis**: modelo em `.env.example` (`VITE_SUPABASE_*`, `VITE_SENTRY_DSN` opcional). No deploy, use os mesmos valores que no ambiente de build (ficheiro local ou secrets no CI).
- **Sentry (opcional)**: com `VITE_SENTRY_DSN`, o SDK **`@sentry/react`** envia erros e tracing de browser (`initSentryDesktop` + `captureException`). Ver [docs/sentry-sdk-opcional.md](docs/sentry-sdk-opcional.md) para `npm install` / lockfile.

## Direitos de autor, EULA e terceiros

- **`legal/EULA.txt`** — texto mostrado no **instalador NSIS** antes da instalação (o utilizador deve aceitar). O ficheiro actual é um **modelo**: substitui-o pelo EULA definitivo aprovado pelo **advogado** antes de distribuir comercialmente.
- **`legal/NOTICE.md`** — como listar licenças das dependências npm (open-source) para auditoria ou releases.
- **`package.json`** — campo `"license": "UNLICENSED"` indica software **não** open-source por omissão do npm; não substitui o EULA nem contratos com clientes.
- **Portable** (`*portable*.exe`) — não usa o assistente NSIS; **não apresenta** a página do EULA. Para uso corporate, prefira o **Setup** ou combine com contrato assinado à parte.

## Executavel Windows (distribuicao)

1. **`npm run dist:win`** — gera em `release/` o instalador NSIS (`*Setup*.exe`), o `.exe` portable (se configurado) e **`SHA256SUMS.txt`** com SHA-256 de cada `.exe` (para utilizadores verificarem o download). O Setup inclui o fluxo de aceitação do **`legal/EULA.txt`**.
2. **Assinatura** (opcional, menos avisos SmartScreen): `npm run dist:win:signed` com certificado e variáveis `CSC_*` / secrets no CI — ver `electron-builder.yml` e [SECURITY](SECURITY.md).
3. **Backend**: em produção, as **políticas RLS** do Supabase devem estar correctas; a chave `anon` no cliente é pública por desenho — a segurança dos dados é no servidor.
4. **Testar** o instalador num PC limpo ou VM antes de distribuir amplamente.

`npm run verify:release` volta a correr só a verificação + `SHA256SUMS.txt` se `release/` já existir.

## Variaveis Supabase

Crie um ficheiro `.env` na raiz do projeto:

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sua_chave_anon
```

## SQL necessario no Supabase

Execute as **migrações** em `supabase/migrations/` do repositório, **por ordem de nome** (timestamp):

1. `20260205120000_iso_pro_multi_tenant.sql`
2. `20260207130000_iso_pro_auth_membership_auto_sync.sql`
3. `20260208120000_perfis_acesso_codigo_unique_per_tenant.sql`
4. `20260503120000_iso_pro_usuarios_colaborador_id.sql`
5. `20260503120100_iso_pro_usuario_admin_rpcs.sql`

Para setup inicial ou novo tenant, use também os snippets em `supabase/snippets/` (ex.: `cole_uma_vez_sql_editor_setup_iso_pro.sql`, `provision_novo_tenant.sql`). Edge Functions em `supabase/functions/` exigem deploy separado — ver `supabase/functions/README.md`.

Com as migrações aplicadas, o modulo `Dispositivos Mobile` do desktop consegue:

- listar aparelhos cadastrados
- autorizar aparelho
- bloquear aparelho
- revogar vinculo do aparelho

Se o Supabase nao estiver configurado, o desktop continua em `fallback local` para nao travar o desenvolvimento.

## Licenca desktop assinada

Gerar um novo par de chaves RSA:

```powershell
npm run license:keypair
```

O comando devolve um JSON com `publicKey` e `privateKey`.

- `publicKey`: deve ser a chave publica embutida no desktop para validar a assinatura
- `privateKey`: deve ficar fora do executavel, usada apenas para emitir licencas

Emitir uma licenca assinada para uma maquina autorizada:

```powershell
npm run license:generate -- --private-key-file "C:\chaves\desktop-private-key.pem" --issued-to "ISO PRO - Cliente" --machine-fingerprint "FINGERPRINT_DA_MAQUINA" --machine-label "PC-ALMOXARIFADO" --expires-at "2026-12-31T23:59:59.000Z" --app-version "0.0.0"
```

Para gerar diretamente um arquivo de licenca importavel no desktop:

```powershell
npm run license:generate -- --private-key-file "C:\chaves\desktop-private-key.pem" --issued-to "ISO PRO - Cliente" --machine-fingerprint "FINGERPRINT_DA_MAQUINA" --machine-label "PC-ALMOXARIFADO" --expires-at "2026-12-31T23:59:59.000Z" --app-version "0.0.0" --output-file "C:\licencas\iso-pro-desktop-licenca.json"
```

O comando devolve um JSON com:

- `token`: valor a ser colado em `Configuracoes > Licenca Desktop > Token/licenca`
- `payload`: resumo administrativo da licenca emitida
- `registrationSql`: SQL pronto para registrar/atualizar a licenca na tabela `desktop_licencas`

Fluxo recomendado:

1. Vincular a maquina autorizada no desktop.
2. Gerar a licenca assinada com o `machineFingerprint` dessa maquina.
3. Executar no Supabase o `registrationSql` retornado pelo gerador.
4. Importar no desktop o arquivo `.json` gerado ou preencher os campos manualmente.
5. Salvar as configuracoes para ativar a validacao criptografica local.

## Revogacao central de licenca desktop

Com tabelas de licença desktop configuradas no Supabase (ver migrações/snippets do projecto), o desktop passa a consultar se a licenca continua `active`.

Se a licenca estiver marcada como `revoked`, o executavel bloqueia a abertura mesmo que o token assinado ainda esteja salvo localmente.

Exemplo para revogar uma licenca:

```sql
update public.desktop_licencas
set status = 'revoked',
    revogada_em = now(),
    motivo_revogacao = 'Equipamento substituido ou desligado da operacao',
    updated_at = now()
where license_id = 'SEU_LICENSE_ID';
```
