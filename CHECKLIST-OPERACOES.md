# Checklist — Operação forte (PC + mobile + Supabase)

Uso interno: marcar **Feito** / **Não feito** e data quando aplicável.  
Aplica-se ao **iso-pro-desktop** e ao **iso_pro_mobile** no mesmo projecto Supabase.

---

## 1. Modo produção (uma verdade só)

**Regra:** a **nuvem (Supabase) é sempre a referência**. O `localStorage` neste PC é cópia; gravação de negócio em produção vai **primeiro** para a nuvem (`executeWrite`); só depois espelha local.

| Item | Feito? | Notas / data |
|------|--------|----------------|
| URL + chave Supabase **sempre** configurados em produção (PC e builds mobile) | [ ] | |
| **Mesmo** projecto Supabase no PC e no telemóvel (sem misturar ambientes por engano) | [ ] | |
| **Materiais em nuvem**: decisão fixa (Ativado **ou** Desativado) alinhada com a equipa — **não** alternar no meio do trabalho | [ ] | |
| Regra escrita para utilizadores: *com credenciais = servidor é a verdade; este PC só acelera a leitura* | [ ] | |
| Checklist de testes por módulo na obra (`CHECKLIST-GO-LIVE.md`) preenchido antes de “fechado” | [ ] | |
| Exportação manual ocasional (CSV/backup dos módulos que permitirem) como rede extra | [ ] | |

---

## 2. Supabase — segurança e dados

| Item | Feito? | Notas / data |
|------|--------|----------------|
| RLS/políticas revistas em `iso_pro_snapshot` e tabelas expostas ao cliente | [ ] | |
| **JWT forte (Fase 3):** `CHECKLIST-ATIVACAO-JWT.md` — hook, membership, piloto | [x] | 2026-07-11 `jwt_forte` admin |
| RLS/políticas em tabelas de **materiais** na nuvem (se usarem) | [ ] | |
| Migrações `supabase/migrations/` aplicadas (ordem por timestamp) se usarem vínculo de dispositivo mobile | [ ] | |
| **Supabase Storage** (se usarem ficheiros): permissões alinhadas + caminho único por documento | [ ] | |
| Plano do projecto com **backups automáticos** activos | [x] | 2026-07-11 — físicos diários OK; último `11 Jul 2026 07:35:06 UTC` |
| **Teste de restauração** feito ao menos uma vez (registar data) | [x] | 2026-07-11 — smoke OK; projecto `iso-pro-staging-teste` **apagado** no mesmo dia |
| Ambiente **staging** separado de produção (recomendado) | [ ] | Tooling pronto (`staging:bootstrap`); falta Restore-to-new-project + Ref — `docs/GUIA-RESTAURO-STAGING.md` |
| Retenção outbox / comandos (pruning) | [x] | Migration `20260711160000`; `ops:prune-retencao` (service role) — 2026-07-21 |
| Smoke diário automatizado | [x] | Secrets GH + workflow OK 2026-07-11 — run #3 verde (`0e98b99`); cron 07:00 UTC |
| Alertas infra Supabase (CPU/disco/pool ≥80%) | [ ] | `docs/CHECKLIST-ALERTAS-INFRA-SUPABASE.md`

### 2b. Criar staging Supabase (nível mundial)

Hoje só existe produção (`huvktaxsosxrfpvdigxq`). Staging evita testar migrations/JWT em obra ao vivo.

| # | Passo | Feito? |
|---|-------|--------|
| 1 | Dashboard → backups prod → **Restore to new project** (`iso-pro-staging`) — `docs/GUIA-RESTAURO-STAGING.md` | [ ] |
| 2 | Anotar `project-ref` + anon key (nunca misturar com prod no mesmo `.env` de build) | [ ] |
| 3–6 | `npm run staging:bootstrap -- -ProjectRef <REF> -AnonKey "<key>"` (link + `.env.staging` + db push + smoke) | [ ] |
| 7 | Builds TI usam `.env.staging` — **nunca** apontar APK de campo para staging | [ ] |

Modelo: `.env.staging.example` · Cutover JWT: `docs/GUIA-JWT-CUTOVER.md`

*Até existir staging: usar tenant piloto + backups antes de cada migration arriscada em prod.*

---

## 3. Concorrência PC ↔ mobile (snapshot partilhado)

| Item | Feito? | Notas / data |
|------|--------|----------------|
| Equipa alinhada: evitar dois utilizadores a gravar o **mesmo** fluxo crítico ao mesmo tempo sem coordenação | [ ] | |
| Mensagens de erro/conflito compreendidas (recarregar e tentar de novo quando aplicável) | [ ] | |
| Gravação mobile usa controlo de versão do snapshot (`updated_at`, conflito + retry) — evitar PC e telemóvel a gravar o mesmo fluxo em simultâneo | [ ] | |

---

## 4. Qualidade e observabilidade

| Item | Feito? | Notas / data |
|------|--------|----------------|
| `npm run ci` (ou equivalente) a passar antes de releases | [ ] | |
| Fluxos críticos cobertos por testes ou checklist manual antes de largar versão | [ ] | |
| Erros de API/Supabase registados (log mínimo) para não falhar em silêncio | [ ] | |

---

## 5. Documentos e ficheiros (se aplicável)

| Item | Feito? | Notas / data |
|------|--------|----------------|
| Onde vive cada tipo de ficheiro (Storage vs payload vs mistura) **documentado** | [ ] | |
| Política de backup inclui **ficheiros** ou cópia fora do Postgres | [ ] | |
| Teste: criar / apagar documento de teste e validar referências | [ ] | |

---

**Última revisão deste checklist:** _preencher_
