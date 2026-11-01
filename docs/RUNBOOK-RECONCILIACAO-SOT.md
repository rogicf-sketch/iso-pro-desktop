# Runbook — reconciliação, heal e fallback SoT

## Diagnóstico rápido (Dashboard)

1. Abrir **Painel** → bloco Nuvem / Escala / SLO 24h.
2. Observar:
   - **falhas sync** / **fallback SoT N** → escritas cairam no snapshot legado
   - **Historico ATD** → lotes no snapshot ausentes nas tabelas
   - **locks longos** → claim demorou (rede/deadlock)
3. Clicar **Reparar SoT** (flush outbox + heal escala + heal histórico em lotes).

## Heal idle automático

- A cada ~10 min (aba visível / online): `runEscalaSotReconcileBestEffort` + `runAtendimentoHistoricoReconcileBestEffort`.
- Kill switch: `localStorage.setItem('iso-pro-kill-switch','1')` ou `VITE_ISO_PRO_KILL_SWITCH=1`.
- Flags: `iso-pro-ff-heal_idle_historico` / `heal_idle_escala` (`0` desliga).

## Backfill manual (Historico)

1. Atendimento → Historico → **Todos** → **Atualizar** (merge + backfill best-effort).
2. Ou Dashboard → Reparar SoT.
3. RPC: `iso_pro_reconcile_atendimento_historico(tenant, heal:=true, batch:=40)` — repetir até `aligned=true`.

## Fallback snapshot→SoT

- Motivos: `rpc_missing`, `supabase_unavailable`, `feature_flag_disabled`.
- **Hard-fail (default):** flag `sot_require_rpc=1` — escritas SoT **não** caem em `patch_snapshot` silencioso (`sotWriteGuard.ts`). Emergência: `localStorage.setItem('iso-pro-ff-sot_require_rpc','0')`.
- Telemetria local: `getSotFallbackSummary()` / Sentry `iso.sot_fallback` com `traceId`.
- Após aplicar migrations SoT, fallbacks devem cair a zero; se persistirem, `db push` falhou ou flag `sot_rir_rnc=0`.

## Locks (sem USING true)

- Policies: `iso_pro_rls_tenant_authenticated_only` (anon = false).
- Claim com retry exponencial só para timeout/rede/deadlock — **nunca** reintenta `held`.
- TTL ~2 min; não substitui OCC de snapshot/comando.

## Update crítico do EXE

- Banner se `< 0.1.247` (`MIN_SUPPORTED_APP_VERSION`); **obrigatório** se `< 0.1.246` (`FORCE_UPDATE_BELOW_VERSION` + flag `force_update_gate`).
- Mobile: banner se `< 1.0.114`; force write se `< 1.0.113`.
- Alvo campo actual: PC **0.1.255** · Mobile **1.0.125**.
- Distribuir Setup/portable + `SHA256SUMS.txt` (`npm run dist:win` / `verify-release`).
- Rollback: EXE anterior em `release/versoes-anteriores/`.
- Auto-update: `ISO_PRO_UPDATE_FEED_URL` no processo principal (default: `https://isoprogestaodemateriais.com.br/updates/iso-pro-desktop/` — ver `docs/RUNBOOK-P1-UPDATER-AUDITORIA.md`).
- **Atenção (2026-08-27):** feed LIVE pode estar atrás do código — confirmar `latest.yml` HTTP = **0.1.255** antes de confiar só no auto-update.

## Clientes — mesma língua (PC / web / mobile)

| Canal | Versão mínima pós-SoT | Alvo rollout | Contrato obrigatório |
|-------|----------------------|--------------|----------------------|
| PC EXE | `≥ 0.1.247` (gate) | **0.1.255** | `iso_pro_list_atendimento_lotes` + merge/heal; writes SoT; feed updater |
| Web | **mesmo bundle** que o EXE (`deploy:web`) | **0.1.255** | Idêntico ao PC — Histórico = Export |
| Mobile | `≥ 1.0.114` (gate) | **1.0.125** | Write: `iso_pro_submit_atendimento_comando` (+ fila). Read/heal: `iso_pro_list_atendimento_lotes` + upsert/reconcile. **Proibido** `patch_snapshot` atendimento |

Gate cruzado: `node scripts/check-iso-pro-shared-hash.mjs` (raiz) — `iso-pro-shared` hash idêntico em master / desktop package / mobile vendor.

RPCs de referência:
- Atendimento write: `iso_pro_submit_atendimento_comando`
- Atendimento list: `iso_pro_list_atendimento_lotes`
- Heal lotes: `iso_pro_upsert_atendimento_lotes_from_json` / `iso_pro_reconcile_atendimento_historico`
- Confirmação mobile: `iso_pro_read_atendimento_confirmacao`

## DR / backup

Ver [CHECKLIST-RESTAURO-BACKUP.md](./CHECKLIST-RESTAURO-BACKUP.md). RTO/RPO alvo obra: restore snapshot + heal SoT < 2h; RPO = último backup OCI agendado.

## Checklist 48–72h (owners)

| Item | Owner | Done |
|------|-------|------|
| `supabase db push` migrations 0321–0325 | Ops nuvem | x |
| Build EXE 0.1.237 + SHA256 | Release | x |
| Deploy web 0.1.237 (`deploy:web`) | Release | x |
| Mobile APK ≥ 1.0.105 (SoT + comando) | Release | x |
| Validar Historico=Export Construcap | Campo/QA | |
| Reparar SoT se fallback > 0 | Admin obra | |
| Confirmar feed auto-update (se activo) | Release | |
| Gate `check-iso-pro-shared-hash` verde | CI | x |
