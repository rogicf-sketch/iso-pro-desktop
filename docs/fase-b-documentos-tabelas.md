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
Snapshot JSON continua a ser dual-escrito para mobile/legado. Contagens e listas UI ja preferem tabelas.
