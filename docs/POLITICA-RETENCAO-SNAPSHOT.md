# Política — retenção e tamanho do snapshot

## Limites (app)

| Nível | Bytes | UI |
|-------|-------|-----|
| Aviso | 5 MB | Dashboard + Configurações (`snapshotPayloadSize.ts`) |
| Crítico | 15 MB | Mesmo sítio — mensagem a pedir limpeza / migração |

## O que cresce o snapshot

- `documentos[]`, `recebimentos[]`, `materiais[]`
- `atendimentoHistorico` / `atendimentos` / logs de estorno
- Qualquer fatia ainda dual-escrita para mobile/legado

## Retenção operacional

| Artefacto | Política |
|-----------|----------|
| Outbox escala + comandos atendimento (tabelas) | Prune **30 dias** — `docs/RETENCAO-OUTBOX.md` / `ops:prune-retencao` |
| Histórico no snapshot JSON | Auto-trim em cada patch com `atendimentoHistorico`/`atendimentos`: **90 dias** e máx. **3000** linhas (`snapshotHistoricoRetencao.ts`) |
| Dual-write cliente (docs/recebimentos/inventário/RIR-RNC) | **Removido** 2026-07-22/23 — tabelas via outbox servidor |

## Acções quando o aviso dispara

1. Confirmar Dashboard → widget Snapshot (tamanho + nível).
2. Correr `ops:prune-retencao` (service role) se outbox/comandos inchados.
3. Evitar «Enviar planejamento completo do PC» em loop.
4. Priorizar leitura/gravação por tabelas (Fase B) e reduzir fatias no mobile.

## Revisão

Mensal: tamanho do snapshot no Dashboard. Trimestral: restauro staging + load-test (`docs/LOAD-TEST-RESULTADOS.md`).
