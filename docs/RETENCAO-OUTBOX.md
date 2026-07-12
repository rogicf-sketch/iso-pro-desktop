# Retenção outbox / comandos

Expurga registos antigos para o banco não crescer sem controlo (SRE).

## Funções

| Função | Efeito |
|--------|--------|
| `iso_pro_prune_escala_outbox(dias, tenant?)` | Apaga `done`/`failed` com `completed_at` mais antigo que N dias (mín. 7) |
| `iso_pro_prune_atendimento_comandos(dias, tenant?)` | Apaga comandos com `created_at` mais antigo que N dias |
| `iso_pro_prune_retencao_ops(dias)` | Corre as duas |

Default: **30 dias**.

## Manual (SQL Editor, role adequada)

```sql
SELECT public.iso_pro_prune_retencao_ops(30);
```

## Via CLI (após link)

```powershell
cd "C:\Sistema I.S.O PRO GESTÃO DE MATERIAIS\iso-pro-desktop"
npm run ops:prune-retencao
```

## pg_cron

Se a extensão existir no projecto, a migration agenda:

- Nome: `iso_pro_prune_retencao_ops_daily`
- Cron: `15 4 * * *` (UTC)

Sem pg_cron: correr `ops:prune-retencao` semanalmente ou no smoke CI.

## Segurança

Funções com `SECURITY DEFINER` e `GRANT` apenas a **`service_role`** (não anon).
