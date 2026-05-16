# Checklist — Operação forte (PC + mobile + Supabase)

Uso interno: marcar **Feito** / **Não feito** e data quando aplicável.  
Aplica-se ao **iso-pro-desktop** e ao **iso_pro_mobile** no mesmo projecto Supabase.

---

## 1. Modo produção (uma verdade só)

| Item | Feito? | Notas / data |
|------|--------|----------------|
| URL + chave Supabase **sempre** configurados em produção (PC e builds mobile) | [ ] | |
| **Mesmo** projecto Supabase no PC e no telemóvel (sem misturar ambientes por engano) | [ ] | |
| **Materiais em nuvem**: decisão fixa (Ativado **ou** Desativado) alinhada com a equipa — **não** alternar no meio do trabalho | [ ] | |
| Regra escrita para utilizadores: *sem credenciais = dados só neste PC; com credenciais = dados no servidor* | [ ] | |
| Exportação manual ocasional (CSV/backup dos módulos que permitirem) como rede extra | [ ] | |

---

## 2. Supabase — segurança e dados

| Item | Feito? | Notas / data |
|------|--------|----------------|
| RLS/políticas revistas em `iso_pro_snapshot` e tabelas expostas ao cliente | [ ] | |
| RLS/políticas em tabelas de **materiais** na nuvem (se usarem) | [ ] | |
| Migrações `supabase/migrations/` aplicadas (ordem por timestamp) se usarem vínculo de dispositivo mobile | [ ] | |
| **Supabase Storage** (se usarem ficheiros): permissões alinhadas + caminho único por documento | [ ] | |
| Plano do projecto com **backups automáticos** activos | [ ] | |
| **Teste de restauração** feito ao menos uma vez (registar data) | [ ] | |
| Ambiente **staging** separado de produção (recomendado) | [ ] | |

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
