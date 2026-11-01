# P0 ops — DR, secrets, pen-test, alertas (top mundial)

Status código (2026-08-27): **migrações Ago SoT + JWT onda 2 + perf atendimento + recebimentos em LIVE** · Hard-fail SoT · **force-update bloqueia writes** (PC abaixo **0.1.246** + mobile abaixo **1.0.113**) · **fila conferência/inventário SQLite + idempotency** · Sentry `dual_write_failure` regra OK · Edge admin CORS · gates PC min **0.1.247** · APK min policy **1.0.114** · alvo campo **1.0.125** · PC/web código **0.1.256**. JWT onda 2 **LIVE 2026-08-25** (`jwt:onda2-smoke` OK); peek anon mantido (onda 2b adiada).

Restante abaixo = **ops humano** + provas de campo (não fecha só com PR).

## 0. Checklist rápido “o que falta”

| Item | Quem | Estado |
|------|------|--------|
| Migrações SoT Ago em prod | DBA | [x] 2026-08-05 `db push` |
| Perf atendimento (status_derivado + trigger) | DBA | [x] staging SP 2026-08-06; **prod no cutover** |
| Alerta Sentry dedicado `dual_write_failure` | TI | Smoke CLI pronto: `npm run sentry:dual-write-smoke` + guia cliques |
| JWT onda 2 LIVE | DBA | [x] **2026-08-25** — mig `20260825100000`; smoke automatizado OK |
| Drill DR + RTO no log | Ops | `docs/DR-DRILL-LOG.md` |
| Pen-test externo | Segurança | Contratar / executar |
| Rotação secrets 90d | Ops | Tabela §2 |
| Prova Histórico UI = Export | Campo | Qualquer tenant |
| Prova import docs → Visualizar/Editar | Campo | Após Ctrl+F5 |
| Smoke Edge: salvar user + Mobile | Campo/TI | Flavio |
| Instalar EXE **0.1.256** + APK **1.0.125** | Campo | Todos os posts — ver secção rollout em `VISTORIA-COMPLETA-FEITO-VS-FALTA.md` |

## 1. Drill DR com RTO medido

Alvo obra: restore + heal SoT **&lt; 2h**; RPO = último backup PHYSICAL/OCI.

Checklist (cronometrar e assinar):

1. Anotar `T0` (início).
2. Staging = restore PHYSICAL do prod (ou dump fresco) **incluindo Auth**.
3. Restaurar amostra Storage (1 object evidência) via `ops:export-storage` / NAS.
4. `supabase db` heal: Dashboard → Reparar SoT no staging.
5. Smoke: login JWT → Histórico Construcap → 1 baixa mobile ACK → recibo.
6. Anotar `T1`; RTO = T1−T0. Guardar em `docs/DR-DRILL-LOG.md`.

Próximo drill agendado: ver runbook reconciliação.

## 2. Rotação de secrets

Cadência sugerida: **90 dias** (ou após offboarding).

| Segredo | Onde | Procedimento |
|---------|------|--------------|
| `service_role` | Supabase + gateway VM | Rodar novo key → deploy gateway → invalidar antigo |
| JWT admin / link | Edge + Config | Ver `CHECKLIST-ATIVACAO-JWT.md` |
| GH Actions deploy SSH | Secrets GH | Rodar chave; atualizar `DEPLOY_SSH_*` |
| OCI / Sentry DSN | Painel | Rodar; validar smoke |
| Mobile keystore | Cofre local | Backup offsite; nunca no git |

## 3. Pen-test / ASVS (externo)

Escopo mínimo:

- Isolamento tenant (RPC DEFINER + RLS)
- Storage paths cross-tenant
- Gateway Origin/JWT/rate-limit
- Peek ACK anon (ameaças de leitura)

Entregar relatório + issues P0 no backlog. Sem relatório externo, **não** declarar top mundial segurança.

## 4. Alertas Sentry (activar)

Eventos obrigatórios com notificação:

- `dual_write_failure` / `iso.sot_fallback`
- `snapshot_conflict` (taxa)
- gateway 429 / 5xx

Ver `CHECKLIST-ALERTAS-SENTRY.md`.

## 5. JWT onda 2

**Staging aplicado 2026-08-06** (`ofeogtjydjdjrmrekebh`): revoke anon em writes (patch, submit, write_*_sot, escala).  
**Peek ACK mantém anon** (mobile poll). Checklist: `docs/CHECKLIST-JWT-ONDA2-STAGING.md`.  
**Prod:** só após 7 dias (alvo **2026-08-13**) + smoke JWT write OK.

SQL:

- Staging: `supabase/snippets/jwt_onda2_revoke_anon_ops_staging.sql`
- Rollback: `supabase/snippets/jwt_onda2_rollback_anon_ops.sql`

Ordem restante:

1. Smoke staging: login JWT + 1 write SoT (PC) e mobile
2. Monitorar 7 dias: `permission denied` / 401
3. Só então repetir em prod (rollback aberto na janela)

Verificação:

```sql
SELECT proname, has_function_privilege('anon', oid, 'EXECUTE') AS anon_x
FROM pg_proc
WHERE proname IN (
  'iso_pro_patch_snapshot',
  'iso_pro_submit_atendimento_comando',
  'iso_pro_peek_atendimento_comando',
  'iso_pro_write_documentos_sot',
  'iso_pro_write_recebimentos_sot'
);
-- Esperado: writes anon_x=false; peek anon_x=true
```

