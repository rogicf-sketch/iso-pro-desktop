# Checklist campo — EXE 0.1.239 + APK ≥1.0.114 (fecho P0)

## Já fechado (não repetir)

| Item | Estado | Desde |
|------|--------|-------|
| MFA admin (TOTP 6 dígitos no login) | **OK** | semanas (produção) |
| PC instalado na obra | **OK** | ~2026-08-05 |
| APK 1.0.114 + atendimento staging &lt;2s | **OK** | 2026-08-06 |
| JWT onda 2 smoke staging | **OK** | 2026-08-06 |
| SoT hard-fail + migrações Ago prod | **OK** | runbooks |

## Só falta (se ainda não feito)

1. Confirmar no PC que a versão mostrada é **0.1.239** (se já for, nada a fazer).
2. Janela JWT onda 2 → **prod após 2026-08-13** (DBA — não é reconfigurar MFA).
3. Em **prod**, migração perf atendimento (`20260807013000`) no cutover.
4. Outros posts físicos (se houver) — mesma prova; MFA **não** se reinstala.

## Registo

| Post | EXE | APK | MFA | Atend. | Notas |
|------|-----|-----|-----|--------|-------|
| Obra (PC desde 05/08) | 0.1.239 | 1.0.114 | **OK** | staging &lt;2s | MFA activo há semanas |
| Staging lab | — | 1.0.114 | n/d | **&lt;2s** | perf + JWT smoke |

Detalhe histórico / caixas opcionais: ver git history deste ficheiro se precisares. Fonte de verdade do “já feito”: tabela acima + regra `.cursor/rules/nao-refazer-ja-feito.mdc`.
