# Política de segurança

## Versões suportadas

| Versão   | Suporte     |
| -------- | ----------- |
| Última release / `main` | Sim         |
| Anteriores | Conforme disponibilidade da equipa |

## Reportar uma vulnerabilidade

**Não abras um issue público** com detalhes de segurança.

1. Usa **[Security advisories](https://docs.github.com/en/code-security/security-advisories)** do repositório (aba **Security** → **Report a vulnerability**), se estiver disponível.
2. Ou contacta os mantenedores por um canal **privado** acordado pela organização.

Inclui sempre: impacto, passos para reproduzir (se aplicável), versão afectada e, se souberes, uma sugestão de mitigação.

## Divulgação responsável

Damos tempo razoável para corrigir antes de divulgação pública, salvo acordo em contrário.

## Assinatura de código Windows (releases)

Os binários gerados por `electron-builder` podem ser assinados com um certificado **Authenticode** (`.pfx`), o que reduz avisos do SmartScreen e identifica o editor do programa.

### Localmente

1. Obter um certificado de assinatura de código válido para Windows (fornecedor comercial).
2. Antes do comando de release:

   ```text
   CSC_LINK=caminho\para\certificado.pfx
   CSC_KEY_PASSWORD=palavra-passe_do_certificado
   ```

3. Executar `npm run dist:win:signed` (ver `electron-builder.yml`: `signAndEditExecutable: true`).

### GitHub Actions

No workflow **Build Windows** (`.github/workflows/build-windows.yml`), definir os secrets:

- `WINDOWS_PFX_BASE64` — ficheiro `.pfx` codificado em Base64
- `WINDOWS_CERTIFICATE_PASSWORD` — palavra-passe do `.pfx`

Se **ambos** existirem, o CI corre `dist:win:signed`; caso contrário, `dist:win` sem assinatura.

### EULA no instalador

O instalador NSIS apresenta **`legal/EULA.txt`**. O texto deve ser o definitivo acordado com assessoria jurídica antes de distribuição ampla.

### Observabilidade no cliente (Sentry)

Os DSNs em `VITE_SENTRY_DSN` / `EXPO_PUBLIC_SENTRY_DSN` são **visíveis no bundle**. Os SDKs `@sentry/react` e `@sentry/react-native` enviam contexto, breadcrumbs e tracing conforme configuração no projecto Sentry (sampling, filtros de PII, etc.).
