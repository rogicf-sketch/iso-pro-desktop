# Edge Functions (Supabase)

## `purge_cloud_data`

Apaga dados operacionais na base **apenas para o `tenantId` indicado** (empresa em `iso_pro_tenants`): `materiais`, `dispositivos_mobile`, `desktop_licencas`, e repoe `iso_pro_snapshot` / `iso_pro_relatorio_snapshot` para esse par `(id='default', tenant_id)`. Opcionalmente apaga utilizadores e perfis **só desse tenant**.

O desktop envia `tenantId` = empresa activa na app (`getActiveTenantId()`), com `login` + `senha` validados em `usuarios_sistema` para esse mesmo tenant — **nao** usa JWT do Supabase Auth no browser.

### Corpo JSON (POST)

Obrigatorio: `tenantId` (UUID), `login`, `senha`, `confirmFraseOperacional` (`APAGAR_DADOS_NUVEM`). Opcional: `incluirUtilizadoresEPerfis`, `confirmFraseUtilizadores` (`APAGAR_UTILIZADORES_E_PERFIS`).

### Pre-requisitos

- [Supabase CLI](https://supabase.com/docs/guides/cli) instalado.
- Projecto ligado (`supabase link`) ou variaveis de ambiente ao fazer deploy.

### Publicar

Na raiz do repositorio `iso-pro-desktop`:

```bash
supabase functions deploy purge_cloud_data --no-verify-jwt
```

Se o CLI respeitar `supabase/config.toml` com `[functions.purge_cloud_data] verify_jwt = false`, o flag `--no-verify-jwt` pode ser omitido em algumas versoes; em caso de 401 no invoke, use o flag explicitamente.

### Testar localmente

```bash
supabase functions serve purge_cloud_data --no-verify-jwt
```

### Seguranca

- A funcao usa `SUPABASE_SERVICE_ROLE_KEY` **so no servidor** (injectada pelo Supabase ao fazer deploy).
- Nunca coloque a service role no `.env` do Vite ou no codigo do cliente.

### Frases de confirmacao

Devem coincidir com `src/modules/configuracoes/constants/purgeCloud.constants.ts`:

- Operacional: `APAGAR_DADOS_NUVEM`
- Com utilizadores/perfis: `APAGAR_UTILIZADORES_E_PERFIS`

---

## `purge_cloud_cadastros`

Limpa **apenas cadastros** na nuvem **para o `tenantId` indicado**: apaga linhas em `materiais` e `dispositivos_mobile` desse tenant, zera no JSON `iso_pro_snapshot` (linha `id='default'` e esse `tenant_id`) as listas
`materiais`, `fornecedores`, `colaboradores`, `recebimentos`, `documentos` (planejamento), `atendimentos`, `atendimentoHistorico`, `atendimentoLotes`,
`rirRegistros`, `rncRegistros`, `inventarios`, `equipamentos`, `etiquetas`, `estoqueAjustes`, `disciplinas`, `unidades`, e mantem `configuracoesSistema`.
Repoe `iso_pro_relatorio_snapshot` vazio para o mesmo tenant. **Nao** remove `usuarios_sistema`, perfis, permissoes nem `desktop_licencas`.

### Corpo JSON (POST)

Obrigatorio: `tenantId` (UUID), `login`, `senha`, `confirmFrase` (`APAGAR_CADASTROS_NUVEM`).

Frase de confirmacao (sync com `src/modules/configuracoes/constants/limparCadastros.constants.ts`): `APAGAR_CADASTROS_NUVEM`

### Publicar

```bash
supabase functions deploy purge_cloud_cadastros --no-verify-jwt
```

---

## `iso_pro_link_auth_user`

Define ou remove `usuarios_sistema.auth_user_id` para um utilizador já existente num `tenant_id`. A base mantém `iso_pro_auth_membership` automaticamente (trigger na migração `20260207130000_iso_pro_auth_membership_auto_sync.sql`).

### Segredo

No Dashboard do projecto → Edge Functions → Secrets, define **`ISO_PRO_LINK_AUTH_SECRET`** (valor aleatório longo). O mesmo valor deve ser enviado em cada pedido no cabeçalho **`x-iso-pro-link-secret`**. Não coloques este secret na app desktop nem em repositório público.

### Pedido

`POST` JSON:

```json
{
  "usuarioId": "123",
  "tenantId": "00000000-0000-0000-0000-000000000001",
  "authUserId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

Para **remover** a ligação Auth, envia `"authUserId": null` ou omite / string vazia.

### Publicar

```bash
supabase secrets set ISO_PRO_LINK_AUTH_SECRET="valor-aleatorio"
supabase functions deploy iso_pro_link_auth_user --no-verify-jwt
```

---

## `iso_pro_admin_user`

Cria ou actualiza utilizador em `usuarios_sistema` e substitui linhas em `usuario_permissoes` para o mesmo `usuario_id` + `tenant_id`. O **actor** (`actorLogin` + `actorSenha`) tem de passar na RPC `iso_pro_usuario_administra_utilizadores` (perfil `admin` ou permissão `usuarios` / `administrar`).

### Segredo

No Dashboard → Edge Functions → Secrets: **`ISO_PRO_ADMIN_USER_SECRET`**. Em cada pedido: cabeçalho **`x-iso-pro-admin-user-secret`** com o mesmo valor. Não coloques o secret em cliente público sem backend/proxy.

### Pedido

`POST` JSON:

**Criar**

```json
{
  "tenantId": "00000000-0000-0000-0000-000000000001",
  "actorLogin": "admin",
  "actorSenha": "********",
  "mode": "create",
  "user": {
    "login": "novo",
    "nome": "Novo utilizador",
    "senha": "1234",
    "perfil_id": "<uuid-do-perfil>",
    "ativo": true,
    "colaborador_id": null
  },
  "permissoes": [
    { "modulo": "dashboard", "acao": "visualizar", "permitido": true }
  ]
}
```

**Actualizar**

```json
{
  "tenantId": "00000000-0000-0000-0000-000000000001",
  "actorLogin": "admin",
  "actorSenha": "********",
  "mode": "update",
  "usuarioId": "<id-em-usuarios_sistema>",
  "user": {
    "login": "novo",
    "nome": "Nome actualizado",
    "senha": "",
    "perfil_id": "<uuid>",
    "ativo": true,
    "colaborador_id": null
  },
  "permissoes": []
}
```

`senha` vazia ou omitida no `update` mantém a senha actual. Módulos/acções válidos alinham com `usuarios.service.ts` (lista fixa).

### Base de dados

A migração `20260503120100_iso_pro_usuario_admin_rpcs.sql` define `iso_pro_usuario_administra_utilizadores` (apenas `service_role`).

### Publicar

```bash
supabase secrets set ISO_PRO_ADMIN_USER_SECRET="valor-aleatorio"
supabase functions deploy iso_pro_admin_user --no-verify-jwt
```

### Desktop

No modulo Configuracoes, o campo **Segredo criar utilizador na nuvem** (mesmo valor que `ISO_PRO_ADMIN_USER_SECRET`) activa gravacao via esta funcao; vazio mantem insert/update directo com a chave anon.

---

## Testes de integração HTTP (opcional)

Com o ambiente local em execução (`supabase start`) e as funções no ar (`supabase functions serve`, ou o stack completo), você pode validar as respostas HTTP sem passar pelo Electron:

1. Defina os mesmos segredos que o `serve` usa (`supabase secrets set ...` no projeto local, ou o que o `supabase status` indicar).
2. Obtenha a **chave anon** (por exemplo com `npx supabase status`, seção API).
3. Na raiz do `iso-pro-desktop`, no PowerShell (exemplo; ajuste a chave):

```powershell
$env:ISO_PRO_EDGE_INTEGRATION='1'
$env:SUPABASE_ANON_KEY='eyJ...'
$env:ISO_PRO_LINK_AUTH_SECRET='...'
$env:ISO_PRO_ADMIN_USER_SECRET='...'
# opcional: $env:SUPABASE_EDGE_FUNCTIONS_URL='http://127.0.0.1:54321/functions/v1'
npm run test:integration:edge
```

Os testes ficam em `src/test/edgeFunctions.integration.test.ts` e **não** entram no `npm test` (exclusão no `vite.config.ts`). Cobrem sobretudo **401** e **400** em `iso_pro_link_auth_user`, `iso_pro_admin_user` e a validação de `tenantId` em `purge_cloud_data`, sem depender de dados concretos na base.

---

## `alerta_estoque_critico`

Envia e-mail SMTP quando materiais entram em estoque **CRITICO** (saldo zero ou muito abaixo do limite sobre o planejamento). Configuracao vem de `iso_pro_snapshot.payload.configuracoesSistema` (sincronizada ao **Salvar configuracoes** no desktop com Supabase activo).

### Modos

**Cron (24h, PC desligado):**

```bash
supabase secrets set ISO_PRO_ALERTA_ESTOQUE_CRON_SECRET="valor-aleatorio-longo"
supabase functions deploy alerta_estoque_critico --no-verify-jwt
```

**Agendamento (escolha um):**

1. **Dashboard** → Edge Functions → `alerta_estoque_critico` → **Schedules**: POST, body `{"modo":"cron"}`, header `x-iso-pro-cron-secret` = mesmo secret; intervalo **15–60 min**.

2. **`pg_cron` + `pg_net`** (SQL): ver snippet `supabase/snippets/schedule_alerta_estoque_critico_cron.sql` — grava URL/anon/cron secret no Vault e agenda (ex.: `*/30 * * * *`).

**Manual (desktop):** Configuracoes → Alertas → **Verificar e enviar na nuvem** (login+senha de administrador de configuracoes).

Corpo JSON (POST):

```json
{
  "tenantId": "00000000-0000-0000-0000-000000000001",
  "login": "admin",
  "senha": "********",
  "forcar": false
}
```

`forcar: true` ignora deduplicacao (teste).

### Pre-requisitos

1. Supabase configurado no desktop; materiais e planejamento sincronizados na nuvem.
2. Aba Alertas preenchida (SMTP, destinatarios, alerta activo) e **Salvar configuracoes** (copia para o snapshot).
3. Funcao publicada (comando acima).

### Seguranca

- SMTP e destinatarios ficam no JSON do snapshot (mesmo nivel de sensibilidade que localStorage no PC). Restrinja RLS/`iso_pro_snapshot` a utilizadores autenticados.
- Cron exige secret dedicado; nao coloque em cliente publico.

---

## `alerta_operacional`

Envia e-mail SMTP quando conferencias, RIR, RNC ou inventarios ultrapassam o prazo configurado em **Configuracoes → Alertas → Pendencias operacionais**. Tambem inclui **RIR reprovado sem RNC** vinculada ao recebimento (lacuna de rastreio ISO).

### Modos

**Cron (recomendado):**

```bash
supabase secrets set ISO_PRO_ALERTA_OPERACIONAL_CRON_SECRET="valor-aleatorio-longo"
supabase functions deploy alerta_operacional --no-verify-jwt
```

Agendar POST para `alerta_operacional` com body `{"modo":"cron"}` e header `x-iso-pro-cron-secret` igual ao secret (ex.: 1x/dia ou a cada 6 h).

**Manual (desktop):** Configuracoes → Alertas → **Verificar pendencias na nuvem** (login+senha de administrador).

Corpo JSON (POST):

```json
{
  "tenantId": "00000000-0000-0000-0000-000000000001",
  "login": "admin",
  "senha": "********",
  "forcar": false
}
```

### Pre-requisitos

1. SMTP preenchido na aba Alertas (secao estoque critico) e **Salvar configuracoes**.
2. Alerta operacional activo, destinatarios e prazos definidos.
3. Funcao publicada (comando acima).

Pode usar o **mesmo schedule** do estoque critico apontando para esta funcao, ou combinar invocacoes separadas no cron externo.
