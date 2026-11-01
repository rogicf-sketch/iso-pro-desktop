# Locks de edição (estilo ERP)

Presença server-backed para evitar dois postos a editar o mesmo registo ao mesmo tempo.

## Recursos

| `resource_kind` | Onde |
|-----------------|------|
| `atendimento` | Atendimento (desenho) — desktop + mobile |
| `recebimento` | Formulário editar recebimento |
| `rir` | Formulário editar RIR |
| `rnc` | Formulário editar RNC |

Tabela: `iso_pro_resource_locks`. RPCs: `iso_pro_claim_resource_lock`, `iso_pro_release_resource_lock`, `iso_pro_force_release_resource_lock`.  
As RPCs antigas `iso_pro_claim_atendimento_lock` / `release` são wrappers.

## Comportamento

- **TTL:** 120 s (clamp 30–600)
- **Heartbeat:** ~45 s enquanto o formulário está aberto
- **Held:** outro login → aviso + botão Salvar desactivado
- **Force (admin):** perfil `admin` ou permissão `usuarios:administrar` — botão «Forçar libertar»
- **Criação nova:** sem lock até existir id
- **Fail-open:** se a RPC ainda não existir no projecto, não bloqueia (OCC do snapshot continua)

## Rede de segurança

O snapshot OCC (`updated_at` / `SnapshotConflictHint`) mantém-se: se o lock falhar ou expirar, a gravação conflituosa ainda é detectada.

## RLS (sem USING true)

- `iso_pro_atendimento_locks` e `iso_pro_resource_locks` usam `iso_pro_rls_tenant_authenticated_only` (JWT tenant; **anon = false**).
- Claim no cliente: retries exponenciais só para timeout/rede/deadlock — **nunca** reintenta `held` (evita spin/race).
- Timeout total do claim ~6s; locks longos (>2.5s em falha) geram evento `lock_long` no SLO.

## Operação

Regra de obra: **um posto por documento em edição**. Consultas em paralelo são livres.
