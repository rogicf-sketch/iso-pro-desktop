# I.S.O PRO Desktop (Windows)

Aplicacao desktop em `React + TypeScript + Electron`, preparada para ser o executavel Windows do sistema.

## Repositorio

- [Contribuir](CONTRIBUTING.md) — `npm run ci`, fluxo de PR, desenvolvimento.
- [Seguranca](SECURITY.md) — como reportar vulnerabilidades.
- **CI** (GitHub Actions): mesmo fluxo que `npm run ci` (typecheck, testes, lint, build, icon, audit).
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

## Executavel Windows (distribuicao)

1. **`npm run dist:win`** — gera em `release/` o instalador NSIS (`*Setup*.exe`), o `.exe` portable (se configurado) e **`SHA256SUMS.txt`** com SHA-256 de cada `.exe` (para utilizadores verificarem o download).
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

Execute os ficheiros da pasta `supabase` do repositório (ou a cópia que acompanha o projecto) nesta ordem:

1. `001_schema_inicial.sql`
2. `002_iso_pro_snapshot.sql`
3. `003_relatorio_fotografico.sql`
4. `004_mobile_access.sql`
5. `005_auth_access.sql`
6. `006_desktop_licenses.sql`

Com isso, o modulo `Dispositivos Mobile` do desktop consegue:

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

Depois de executar `006_desktop_licenses.sql`, o desktop passa a consultar no Supabase se a licenca continua `active`.

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
