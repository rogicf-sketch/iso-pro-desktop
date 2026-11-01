# Política — backup de ficheiros (Storage)

## Facto

Backups **PHYSICAL** do Postgres **não** incluem objectos do Supabase Storage (fotos RF, evidências, PDFs). Só metadados/BD.

## Onde vivem os ficheiros

| Tipo | Destino típico | Risco se Storage falhar |
|------|----------------|-------------------------|
| Relatório fotográfico (blobs locais PC) | IndexedDB no browser/Electron | Perde só cópia local; reexportar do fluxo RF se ainda no posto |
| Evidências / anexos na nuvem | Bucket Storage do projecto (`iso_pro_storage_*` migrations) | Perda permanente sem cópia externa |
| Payload JSON (RIR/RNC refs) | Postgres | Coberto pelo backup PHYSICAL |

## Política aceite (2026-07-22)

1. **BD:** backups diários PHYSICAL activos na prod — rede de segurança principal.
2. **Storage:** crítico para fotos de obra → **export periódico** (mensal) do bucket para disco/NAS da empresa, ou aceitar risco de perda de media (metadados/RIR ficam na BD).
3. Staging via Restore **não** clona ficheiros Storage — validar RF só em prod ou com cópia manual.
4. Checklist ops §5: documentar dono do export Storage e data da última cópia.

## Como exportar

```powershell
cd "C:\Sistema I.S.O PRO GESTÃO DE MATERIAIS\iso-pro-desktop"
# precisa SUPABASE_SERVICE_ROLE_KEY no .env
npm run ops:export-storage -- --dry-run
npm run ops:export-storage -- --out "D:\Backups\iso-pro-storage"
```

Rotina completa: `docs/OPS-MENSAL-CAMPO.md`.

## Checklist rápido

| Item | Feito? | Notas |
|------|--------|-------|
| Bucket evidências com RLS/path por tenant | [x] | migrations `20260721010000`+ (`evidencias`); `pdfs` à parte |
| Export Storage mensal (ou risco aceite por escrito) | [x] | 2026-07-22 — 13 PDFs (~20 MB); evidencias=0 |
| Dono do export | [x] | Rogério / Auto |
| Última cópia (data + pasta) | [x] | `release/storage-exports/2026-07-23` + Desktop `ISO-PRO-Backup-Storage-2026-07-23` |
| Cópia externa (pen/Drive/NAS) | [~] | Já no Ambiente de Trabalho; mover para pen/Drive da empresa quando puderes |
| Teste: apagar objecto de teste e validar refs | [ ] | |
