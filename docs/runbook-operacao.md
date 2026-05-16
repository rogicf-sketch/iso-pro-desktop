# Runbook de operação — I.S.O PRO

Documento curto para equipa interna ou cliente enterprise: **o que fazer quando algo corre mal** e **rotinas mínimas**.

## 1. Backups e restauro

- **Desktop**: confirmar periodicamente que export de snapshot / backup (conforme fluxo do produto) abre noutra máquina ou VM.
- **Supabase**: backups geridos pela plataforma + exportes administrativos que a vossa política exigir.
- **Teste de restauro**: pelo menos **uma vez por trimestre**, restaurar um backup em ambiente de teste e validar login, leitura de dados e um fluxo crítico (ex.: conferência ou atendimento).

## 2. Incidentes (indisponibilidade, erros em massa)

1. Verificar **status Supabase** e rede.
2. Confirmar se o problema é **só nuvem** ou também **modo local** no desktop.
3. Recolher: versão da app, hora aproximada, utilizador, ecrã — e logs do dispositivo se existirem.
4. **Rollback**: ter instalador anterior (`release/` + `SHA256SUMS.txt`) pronto antes de distribuir uma versão nova amplamente.

## 3. Licença desktop e dispositivos mobile

- **Revogação de licença desktop**: seguir SQL/documentação no `README` do desktop (`desktop_licencas`, estado `revoked`).
- **Bloquear / autorizar aparelho**: módulo **Dispositivos Mobile** no desktop; políticas RLS devem permitir apenas o papel certo.
- **SLA interno sugerido**: definir na vossa empresa **quem** pode revogar e em **quantas horas** úteis (ex.: 24h úteis) — isto é contrato/processos, não código.

## 4. Segurança contínua

- Rever **RLS e policies** no Supabase após cada alteração de schema ou módulo novo.
- Rotacionar chaves de serviço apenas com plano de **downtime zero** (novo segredo → deploy → revogar antigo).
- Manter **Dependabot** (ou equivalente) activo nos repositórios; triar PRs semanais.

## 5. Observabilidade

- **Desktop / web**: `VITE_SENTRY_DSN` — SDK **`@sentry/react`**. Vitest usa stub via alias em `vite.config.ts` quando `VITEST=true`.
- **Mobile**: `EXPO_PUBLIC_SENTRY_DSN` — SDK **`@sentry/react-native`**; Vitest mapeia o pacote para mock em `src/test/`.
- O DSN do cliente **não é segredo absoluto**, mas limite taxas e use **alertas por volume** no projecto Sentry.
- Em produção, preferir alertas com **taxa de erro** e **versão da build**, não só “um erro isolado”.

## 6. Go-live mínimo (checklist)

- [ ] SQL Supabase aplicado na ordem documentada.
- [ ] RLS validado para cada papel (admin, campo, leitura).
- [ ] Build desktop assinado (se aplicável) testado em VM limpa.
- [ ] APK/AAB mobile testado com login real e modo offline breve.
- [ ] Plano de backup + runbook conhecido pela equipa de suporte.
