# Guia cliques — alertas Sentry `iso.*` (5–10 min)

Org / projecto: o teu projecto React **iso-pro-desktop** (ingest EU).  
Smoke já enviado: filtra Issues por `iso.sentry_smoke_test` para confirmar.

---

## Passo A — Confirmar Issues (1 min)

1. Abre https://sentry.io  
2. Projecto **iso-pro-desktop** → **Issues**  
3. Pesquisa: `iso.sentry_smoke_test`  
4. Se aparecer → ingestão OK

---

## Se não vires “Alertas” no menu

O menu novo às vezes esconde. Faz **um** destes caminhos:

### Caminho mais fácil (a partir de Projetos)
1. Em **Projetos**, no cartão `iso-pro-desktop`, clica a **engrenagem** (canto do cartão)
2. No menu do projecto → **Alertas** / **Alerts** → **Rules** / **Regras**
3. **Criar alerta** / **Create Alert**

### Ou
1. Menu esquerdo → **Problemas** (ícone de lista, o 2.º)
2. No topo da página procura botão **Alertas** ou link **Create Alert**

### Link directo
https://iso-pro-gestao-de-materiais.sentry.io/alerts/rules/

Se pedir permissão / 404: a conta pode não ter role Admin — usa o email owner da org.


## Passo B — Alerta crítico `dual_write_failure` (obrigatório P1)

Link: https://iso-pro-gestao-de-materiais.sentry.io/alerts/rules/

1. **Create Alert** → tipo **Issues**
2. Condição: **A new issue is created** (ou events > 0 in 1 hour)
3. Filtro (um dos dois):
   - **Message** contains `iso.dual_write_failure`  ← mais simples
   - **ou** Tag `iso_event` equals `dual_write_failure` (SDK passa a enviar tag)
4. Acção: email TI
5. Nome: `ISO PRO — dual_write_failure`
6. **Save**

Validar:

```powershell
cd iso-pro-desktop
npm run sentry:dual-write-smoke
```

Em ~1 min: Issues deve mostrar o evento; se a regra existir, chega email. Depois **Resolve** o issue de smoke.

---

## Passo C — Outros alertas (opcional)

1. Menu **Alerts** → **Create Alert**  
2. Filtro message contains:

| # | Mensagem (cola exacta) | Prioridade |
|---|------------------------|------------|
| 1 | `iso.snapshot_conflict` | Alta |
| 3 | `iso.offline_flush` | Alta |
| 4 | `iso.outbox_flush_fail` | Crítica |

**Não** cries alerta para `iso.sentry_smoke_test`, `iso.mfa_challenge`, `iso.reconcile_ok`.  
`iso.sot_divergence` = heal (digest opcional).

---

## Passo D — Marcar feito

Quando `dual_write_failure` estiver criado e o smoke notificar, responde **“alertas sentry ok”**.

Checklist: `docs/CHECKLIST-ALERTAS-SENTRY.md`
