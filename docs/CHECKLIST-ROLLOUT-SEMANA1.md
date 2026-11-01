# Checklist — Rollout Semana 1 (0.1.261 / 1.0.125)

**Objectivo:** colocar no campo o que já está built + smoke JWT humano + PDFs/recibos v6.  
**Referência:** `ARQUITETURA-ENTERPRISE-V2.md` · `CHECKLIST-JWT-ONDA2-LIVE.md` · `VISTORIA-COMPLETA-FEITO-VS-FALTA.md`

**Versões alvo:** PC **0.1.261** (RNC + RF + RIR + **recibo/estorno** PDF v6) · Mobile **1.0.125**  
**Artefactos:**
- Setup: `I.S.O PRO Setup 0.1.261.exe` · `release/installers/atuais/`
- Rollback: Setup **0.1.260**
- APK: `iso-pro-mobile-release-1.0.125.apk`
- Web LIVE: **0.1.261**
- Feed: `latest.yml` = **0.1.261**

---

## Pré-rollout

| # | Item | Done |
|---|------|------|
| 1 | Build Setup 0.1.261 | [x] 2026-08-31 |
| 2 | latest.yml = 0.1.261 | [x] feed LIVE |
| 3 | Publicar feed updater | [x] `publish:updates-feed` |
| 4 | Deploy web 0.1.261 | [x] 2026-08-31 |
| 5 | APK 1.0.125 disponível | [ ] confirmar NAS/campo |

## Smoke campo (humano — assinar data/post)

### Web / PC
- [ ] Ctrl+F5 → versão **0.1.261** no login
- [ ] Login MFA OK
- [ ] Materiais → editar 1 campo → gravar (write SoT JWT)
- [ ] RNC → Imprimir PDF v6
- [ ] Relatório fotográfico → Imprimir / Guardar PDF (Noto OK)
- [ ] RIR → Imprimir PDF v6
- [ ] Atendimento → Imprimir **recibo** v6 (cabeçalho + tipografia OK)
- [ ] Estorno (se aplicável) → recibo estorno v6

### Mobile
- [ ] APK **1.0.125** instalada
- [ ] Login + aparelho autorizado
- [ ] 1 atendimento **ou** 1 conferência com sessão JWT
- [ ] Sem “Nuvem incompleta” falso no Finalizar recibo

### Fecho
- [ ] Assinar `CHECKLIST-JWT-ONDA2-LIVE.md` (smoke PC + mobile)
- [ ] Data / post / operador: _______________
