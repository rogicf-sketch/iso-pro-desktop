# Offline — fila de atendimento (mobile)

## Persistência

| Antes | Depois (2026-07-22) |
|-------|---------------------|
| AsyncStorage `iso_pro_atendimento_comandos_v1` | **SQLite WAL** `iso_pro_atendimento_comandos.db` (`atendimentoComandoQueueStore.ts`) |

Na primeira abertura, a fila AsyncStorage é **migrada** para SQLite e removida. Se SQLite falhar, há fallback temporário para AsyncStorage.

## O que pode ficar offline

- Baixas / comandos idempotentes de atendimento ainda não enviados (`iso_pro_submit_atendimento_comando`).
- Patches de snapshot genéricos na fila `offlineSnapshotQueue` (AsyncStorage — não é SQLite nesta onda).

## TTL / política

| Idade da fila (item mais antigo) | Comportamento |
|----------------------------------|---------------|
| &lt; 24 h | Aviso normal «N por enviar» |
| ≥ 24 h | Aviso reforçado (sincronizar em breve) |
| ≥ **48 h** | **Bloqueio** de novas baixas offline até flush com sucesso |

Constantes: `ATENDIMENTO_FILA_AVISO_HORAS` / `ATENDIMENTO_FILA_BLOQUEIO_HORAS` em `atendimentoFilaPolitica.ts`.

- Sem TTL automático de apagar itens: ficam até flush com sucesso ou limpeza manual.
- Na nuvem, comandos antigos na tabela são podados aos **30 dias** (`RETENCAO-OUTBOX.md`).
- **Regra de campo:** não deixar o telemóvel offline &gt; 24–48 h com baixas pendentes.

## Se o aparelho morrer antes do sync

- Com SQLite, a fila **sobrevive** a restart da app / kill do processo.
- Wipe de dados da app / uninstall / falha de storage do SO → **perda** das baixas não flushed.
- Rede de segurança: só o que já chegou à nuvem.

## UX

- Faixa Nuvem: `N por enviar (fila local)`.
- Aviso no Atendimento enquanto `comandosPendentes > 0`.
- Início: badge `N por enviar (fila local)`.
