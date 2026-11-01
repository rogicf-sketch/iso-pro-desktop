# DR drill log — RTO medido (I.S.O PRO)

Alvo obra: restore + heal SoT **< 2h**. RPO = último backup PHYSICAL/OCI.

**Semana 2 (Enterprise V2):** executar drill e preencher linha #1 abaixo.  
Procedimento completo: `docs/RUNBOOK-P0-OPS-TOP-MUNDIAL.md` §1.

| # | Data | Ambiente | T0 | T1 | RTO | Operador | Resultado | Notas |
|---|------|----------|----|----|-----|----------|-----------|-------|
| 1 | _pendente_ | staging | | | | | | Restaurar PHYSICAL + Auth + 1 object Storage; smoke login → Histórico → 1 baixa ACK |

### Checklist pré-drill

- [ ] Backup PHYSICAL recente confirmado (Dashboard Supabase LIVE)
- [ ] Ambiente staging disponível (não usar LIVE para ensaio destructivo)
- [ ] Cronómetro / relógio partilhado para T0/T1
- [ ] Operador + testador de campo designados
- [ ] Pós-drill: se RTO > 2h → issue P0

Após cada drill: assinar linha e abrir issues P0 se RTO > alvo.
