# Escala enterprise — desenhos, recebimentos, materiais, inventario, RIR, RNC

## Entregue

| Modulo | Tabelas / RPC | PC |
|--------|---------------|-----|
| Desenhos | `iso_pro_documentos_planejamento` + itens | lista/atendimento paginado |
| Recebimentos | `iso_pro_recebimentos` + itens | lista/detalhe + Conferencia |
| Materiais | `iso_pro_list_materiais_page` | lista paginada no servidor |
| Inventario | `iso_pro_inventarios` + itens | lista/detalhe paginado |
| RIR / RNC | `iso_pro_rir` / `iso_pro_rnc` (payload jsonb) | listas paginadas |
| Painel/badges | `iso_pro_operacao_contagens` | 1 RPC; chaves RIR/RNC corrigidas |

## Migrations
1. `20260710120000`…`130000` — desenhos
2. `20260710140000` — contagens + pendentes atendimento
3. `20260710150000` — recebimentos + materiais page
4. `20260710160000` — inventario + RIR + RNC

```bash
cd iso-pro-desktop
npx supabase db push
```

## Configuracoes
Botoes «Activar estrutura de escala» para desenhos, recebimentos e inventario+RIR+RNC.

## Nota
Snapshot JSON continua a existir para mobile/legado. Contagens e listas UI ja preferem tabelas.

**SoT table-first** (2026-08-03):
- Recebimentos / inventarios / documentos / **RIR / RNC** / fornecedores / equipamentos / etiquetas: `iso_pro_write_*_sot`
  (tabelas + projecao snapshot com `skip_escala_outbox`).
- Documentos: **preserva `quantidade_atendida` das tabelas** (nao ressuscita qAt apos estorno).
- Historico atendimento: merge tabelas∪snapshot + backfill + `iso_pro_reconcile_atendimento_historico`.
- Fallback patch legado se a RPC faltar.
- Reconciliador: `iso_pro_reconcile_escala_sot` + historico ATD.

Retencao de historico no patch: `snapshotHistoricoRetencao.ts` (90 dias / 3000 itens).
Ver `docs/POLITICA-RETENCAO-SNAPSHOT.md`.
