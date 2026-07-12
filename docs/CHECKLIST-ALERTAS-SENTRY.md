# Checklist — alertas Sentry (eventos `iso.*`)

Projecto: **iso-pro-desktop** (React) · ingest EU (`ingest.de.sentry.io`)  
App: web/PC envia via `VITE_SENTRY_DSN` (não commitado).

---

## 1. Confirmar ingestão (2 min)

```powershell
cd "C:\Sistema I.S.O PRO GESTÃO DE MATERIAIS\iso-pro-desktop"
npm run sentry:smoke-test
```

Ou no site: **Configurações → Sentry → Enviar evento de teste**.

No Sentry → **Issues**: filtrar `iso.sentry_smoke_test`.

| OK? | Data | Notas |
|-----|------|-------|
| [x] | 2026-07-11 | CLI `sentry:smoke-test` event_id OK (vários envios) |

---

## 2. Alertas a criar (Alerts → Create Alert)

Cria **uma regra por mensagem** (Issue alert → "A new issue is created" ou "Number of events"):

| # | Filtro (message contains) | Acção | Prioridade | OK? |
|---|---------------------------|--------|------------|-----|
| 1–4 | (UI nova sem filtro message) → 1 alerta: **A new issue is created** + Notify Suggested Assignees | Email / assignees | Alta | [x] 2026-07-11 |

Sugestão de condição: **quando o número de eventos num issue for > 0 em 1 hora** (ou "first seen").

Não cries alerta só para `iso.sentry_smoke_test` (é teste manual).

---

## 3. Canal de notificação

| Canal | Destinatário | OK? |
|-------|--------------|-----|
| Email TI | | [ ] |
| Slack (opcional) | | [ ] |

---

## 4. Release / ambiente

- Release: `iso-pro-desktop@0.1.89` (e seguintes)
- Environment no SDK: produção no build de hosting

Assinatura / data: _________________________

*Relacionado:* `CHECKLIST-ALERTAS-INFRA-SUPABASE.md` · `npm run sentry:smoke-test`
