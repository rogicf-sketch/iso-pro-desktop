# Colaboradores em tabela (SoT)

**2026-07-23** — migration `20260723200000_iso_pro_colaboradores_tabela.sql`

| Antes | Depois |
|-------|--------|
| Array `colaboradores[]` só no snapshot JSON | Tabela `iso_pro_colaboradores` |
| PC gravava via `patch_snapshot` | PC grava via `iso_pro_replace_colaboradores` (+ projecção leve no snapshot) |
| Mobile lia blob/meta-slice | Mobile: `iso_pro_list_colaboradores_page` no boot Atendimento |

RPCs: `iso_pro_list_colaboradores_page`, `iso_pro_replace_colaboradores`, `iso_pro_sync_colaboradores_from_snapshot`.  
`iso_pro_read_snapshot_meta_slices` devolve colaboradores da tabela (com auto-backfill se vazia).
