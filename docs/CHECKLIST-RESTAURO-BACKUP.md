# Checklist formal — teste de restauro de backup (Schrödinger)

**Regra:** o backup não existe até o restauro ser testado com sucesso **pelo menos 1×** e a data registada.

Ambiente preferido: **staging** (nunca overwrite de produção sem janela anunciada).

---

## Cabeçalho

| Campo | Valor |
|-------|--------|
| Projecto prod | `huvktaxsosxrfpvdigxq` |
| Projecto staging | `cckcvovccqztmmdbkhub` (`iso-pro-staging-teste`) — teste 2026-07-11; **apagado** 2026-07-11 (parar custo) |
| Responsável TI | Rogério / Auto |
| Data do teste | 2026-07-11 |
| Tipo | Restore to new project ← backup PHYSICAL `11 Jul 2026 07:35 UTC` |

---

## Antes

| # | Passo | OK? |
|---|--------|-----|
| 0.1 | Confirmar backups automáticos activos no Dashboard → Database → Backups → **Scheduled** | [x] 2026-07-11 |
| 0.2 | Anotar data/hora do último backup | [x] `11 Jul 2026 07:35:06 (+0000)` PHYSICAL |
| 0.3 | Staging criado **ou** janela de manutenção em prod acordada | [x] `iso-pro-staging-teste` |
| 0.4 | Export CSV crítico opcional (documentos/materiais) como rede de segurança | [ ] n/a neste teste |

Abrir dashboard: `npm run ops:verificar-backup`

---

## Restauro

| # | Passo | OK? | Notas |
|---|--------|-----|-------|
| 1.1 | Iniciar restauro para **staging** via separador **Restore to new project (BETA)** (nunca "Restore" em produção) | [x] | COMPLETED 22:08 UTC |
| 1.2 | Aguardar conclusão; anotar duração | [x] | ~minutos; status COMPLETED |
| 1.3 | Actualizar `.env.staging` com URL/anon do ambiente restaurado | [ ] | smoke via env one-shot |
| 1.4 | `npm run staging:link -- -ProjectRef <REF>` (se for projecto novo) | [x] | ref `cckcvovccqztmmdbkhub`; migrations pós-backup aplicadas; CLI religado a prod |

---

## Smoke pós-restauro (mínimo)

| # | Teste | OK? |
|---|--------|-----|
| 2.1 | `npm run ops:smoke-diario` com `.env.staging` | [x] docs=1201 mat=2469 outbox=0 |
| 2.2 | Login web/PC admin (+ MFA se activo) | [ ] | n/a (Auth não veio no restore; smoke RPC OK) |
| 2.3 | Planejamento: listar 1 página de documentos | [x] | via smoke RPC |
| 2.4 | Materiais: abrir 1 ficha com peso/disciplina | [x] | via smoke RPC total=2469 |
| 2.5 | Atendimento: abrir 1 desenho com itens | [ ] | opcional; dados presentes |

---

## Fecho

| Item | Valor |
|------|--------|
| Restauro OK? | **Sim** |
| Duração | Restore COMPLETED 2026-07-11 22:08 UTC; smoke OK 22:15 UTC |
| Problemas | Backup 07:35 sem migrations do dia — aplicadas no staging antes do smoke final |
| Próximo teste agendado | Trimestral; **apagar** `iso-pro-staging-teste` após este teste |

Assinatura / data: _________________________

---

*Relacionado:* `CHECKLIST-OPERACOES.md` · `scripts/verificar-backup-supabase.ps1` · `npm run ops:smoke-diario`
