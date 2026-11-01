# Ops de campo — rotina mensal / trimestral

**Estado actual (2026-07-24):**
- Prod: `rogicf-iso-pro` (`huvktaxsosxrfpvdigxq`)
- Staging: `iso-pro-staging` (`vghbcwkvmmihakunvwqw`) — schema + seed sintético; **não** é clone PHYSICAL
- CLI: ligado a **produção**
- Stress volume: assinado em `docs/LOAD-TEST-RESULTADOS.md`
- Restauro BD testado: **2026-07-11** (próximo ensaio trimestral **2026-10-15**)
- Lembrete na app: Configurações → Backup Oracle (aviso da rotina PHYSICAL)

A rotina está **documentada e ensaiada** (2026-07-11). O que falta até Outubro é **repetir** o ensaio trimestral e assinar de novo o checklist — não falta procedimento.

---

## Mensal (tu + TI)

| # | Acção | Como |
|---|--------|------|
| 1 | Confirmar backup BD | `npm run ops:verificar-backup` → anotar data do último PHYSICAL em `CHECKLIST-OPERACOES.md` |
| 2 | Export Storage | Ver abaixo — buckets `evidencias` + `pdfs` |
| 2b | Cópia fora deste PC | Copiar `release/storage-exports/AAAA-MM-DD` para pen/Drive — **obrigatório** para não depender só deste computador |
| 3 | Smoke prod (leitura) | `npm run ops:smoke-diario` |
| 4 | Prune retenção (se outbox grande) | `npm run ops:prune-retencao` (precisa service role) |

### Export Storage (primeira vez)

1. No Dashboard prod → **Settings → API** → copiar `service_role` (secret).
2. Colar no `.env` local (nunca no git):
   ```
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   ```
3. Contar objectos (sem gravar):
   ```powershell
   cd "C:\Sistema I.S.O PRO GESTÃO DE MATERIAIS\iso-pro-desktop"
   npm run ops:export-storage -- --dry-run
   ```
4. Gravar cópia (NAS/disco da empresa):
   ```powershell
   npm run ops:export-storage -- --out "D:\Backups\iso-pro-storage"
   ```
5. Marcar em `docs/POLITICA-BACKUP-STORAGE.md`: dono + data.

Se **não** houver fotos/PDFs na nuvem ainda, o dry-run mostra `0` objectos — anota “risco aceite / bucket vazio” na política.

---

## Trimestral (ensaio de restauro)

**Próxima data alvo: 2026-10-15** (calendário interno TI).

Só quando quiseres provar de novo o backup PHYSICAL com **dados reais**:

1. Apagar **ou** aceitar custo temporário do staging actual.
2. Prod → Backups → **Restore to new project** (nunca Restore in-place).
3. Nome: `iso-pro-staging`.
4. Colar ref + anon → `npm run staging:bootstrap -- -ProjectRef "…" -AnonKey "…"`.
5. Smoke + 1 load-test; assinar `docs/CHECKLIST-RESTAURO-BACKUP.md`.
6. Ficar com **um** staging.

Até lá, o staging sintético cobre stress de escrita/listagens.

---

## O que **não** fazer agora

- Não criar terceiro projecto
- Não Restore in-place em produção
- Não apontar APK de campo para staging
