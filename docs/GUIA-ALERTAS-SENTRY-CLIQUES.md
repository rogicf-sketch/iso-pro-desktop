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


1. Menu **Alerts** → **Create Alert** (ou **Create Alert Rule**)  
2. Tipo: **Issues** (não Metric, se perguntar)  
3. Condição sugerida: **A new issue is created**  
   (ou: Number of events in an issue is more than `0` in `1 hour`)  
4. Filtro / Filter:
   - **Message** → **contains** → cola uma destas strings:

| # | Mensagem (cola exacta) | Prioridade |
|---|------------------------|------------|
| 1 | `iso.snapshot_conflict` | Alta |
| 2 | `iso.dual_write_failure` | Crítica |
| 3 | `iso.offline_flush` | Alta |
| 4 | `iso.outbox_flush_fail` | Crítica |

5. Acção: **Send a notification** → o teu email (owner)  
6. Nome do alerta: `ISO PRO — <mensagem>`  
7. **Save Rule**

**Não** cries alerta para `iso.sentry_smoke_test` nem `iso.mfa_challenge` (ruído).

---

## Passo C — Marcar feito

Quando os 4 estiverem criados, responde **“alertas sentry ok”**.

Checklist: `docs/CHECKLIST-ALERTAS-SENTRY.md`
