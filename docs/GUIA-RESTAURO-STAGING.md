# Guia rápido — restauro para staging (nível mundial)

**Objectivo:** provar que o backup funciona **sem** tocar em produção.

Projecto prod: `huvktaxsosxrfpvdigxq` (`rogicf-iso-pro`)

---

## Passos no Dashboard (tu)

1. Abre: https://supabase.com/dashboard/project/huvktaxsosxrfpvdigxq/database/backups/scheduled
2. Separador **Restore to new project (BETA)**
3. Nome sugerido: `iso-pro-staging`
4. Escolhe o backup mais recente (ex.: `11 Jul 2026 07:35`)
5. Confirma e **espera** o projecto novo ficar Healthy
6. Copia o **Reference ID** (project-ref) do projecto novo
7. Cola o ref neste chat

**Nunca** uses o botão **Restore** na lista de backups de produção.

---

## Depois (eu / scripts)

```powershell
cd "C:\Sistema I.S.O PRO GESTÃO DE MATERIAIS\iso-pro-desktop"
# Um comando: link + .env.staging + db push + smoke
npm run staging:bootstrap -- -ProjectRef "COLE_O_REF" -AnonKey "COLE_A_ANON_KEY"
```

Alternativa manual: `npm run staging:link -- -ProjectRef "COLE_O_REF"` + preencher `.env.staging` + `npm run ops:smoke-diario`.

Marcar: `docs/CHECKLIST-RESTAURO-BACKUP.md` secção Restauro + Fecho. · Cutover: `docs/GUIA-JWT-CUTOVER.md`.

---

## Nota Storage

Backups PHYSICAL **não** incluem ficheiros do Storage — só metadados/BD. Fotos/PDFs em Storage precisam de política à parte se forem críticos.
