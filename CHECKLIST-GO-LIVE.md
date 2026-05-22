# Checklist go-live — validação na obra (1 página)

**Regra fixa:** a **nuvem (Supabase) é sempre a referência**. O PC/navegador é só cópia rápida. Cadastro só conta como gravado quando **Salvar** teve sucesso **com** Supabase configurado.

**Como validar “aparece na nuvem”:** gravar no **PC A** → abrir o **mesmo login** no **PC B** ou na **web** (Ctrl+F5) → o registo deve existir sem reimportar.

| Campo | Valor |
|-------|--------|
| Obra / ambiente | |
| URL produção | https://isoprogestaodemateriais.com.br |
| Versão testada | 0.1.11 |
| Data | |
| Responsável | |

---

## A. Antes de começar (obrigatório)

| # | Teste | OK? |
|---|--------|-----|
| A1 | **Configurações → Integração Supabase**: URL + chave anon salvas; indicador de ligação OK | [ ] |
| A2 | **Mesmo** projecto Supabase no PC, web e app Campo (sem misturar contas/obras) | [ ] |
| A3 | **Materiais em nuvem**: decisão única (ligado **ou** desligado) — não alternar no meio da obra | [ ] |
| A4 | Backup Supabase ativo + export manual testado (Configurações / módulos que exportam) | [ ] |

---

## B. Testes por módulo (criar → salvar → ver noutro sítio)

Marque **OK** só se: (1) mensagem de sucesso ao salvar; (2) registo visível no **outro** PC/browser; (3) modal **não** fecha ao clicar no fundo escuro com formulário aberto.

| Módulo | O que criar (exemplo) | Salvar | Vê no outro PC/web? | Modal fundo não fecha? | OK? |
|--------|------------------------|--------|---------------------|-------------------------|-----|
| **Fornecedores** | Fornecedor teste `GO-LIVE-01` | Salvar | [ ] | [ ] | [ ] |
| **Colaboradores** | Colaborador teste `GO-LIVE-02` | Salvar | [ ] | [ ] | [ ] |
| **Materiais** | Material teste `GO-LIVE-03` | Salvar material | [ ] | [ ] | [ ] |
| **Equipamentos** | Equipamento teste `GO-LIVE-04` | Salvar | [ ] | [ ] | [ ] |
| **Documentos** | Documento/planejamento teste | Salvar | [ ] | [ ] | [ ] |
| **Recebimentos** | Recebimento teste (1 item) | Salvar | [ ] | [ ] | [ ] |
| **Conferência** | Conferir recebimento de teste | Finalizar | [ ] | — | [ ] |
| **Atendimento** | Atendimento / saída teste | Salvar | [ ] | [ ] | [ ] |
| **Inventário** | Inventário teste | Salvar | [ ] | [ ] | [ ] |
| **RIR** | RIR teste (rascunho mínimo) | Salvar | [ ] | [ ] | [ ] |
| **RNC** | RNC teste | Salvar | [ ] | [ ] | [ ] |
| **Utilizadores** | Utilizador teste (perfil limitado) | Salvar | [ ] | [ ] | [ ] |
| **Relatório fotográfico** | RF teste com 1 foto | Salvar | [ ] | [ ] | [ ] |
| **Etiquetas** | Etiqueta teste `GO-LIVE-05` | Salvar | [ ] | [ ] | [ ] |
| **Relatório Final de Obra** | Pré-visualizar / gerar número | OK sem erro | [ ] | — | [ ] |

**Outros (fora do snapshot operacional principal):**

| Módulo | Referência | Teste mínimo | OK? |
|--------|------------|--------------|-----|
| **Configurações** | Local + invalida cache nuvem ao salvar Supabase | Alterar texto de obra → Salvar configurações | [ ] |
| **Mobile (dispositivos)** | Nuvem | Registar dispositivo teste | [ ] |

---

## C. Nuvem vs. PC (3 provas rápidas)

| # | Passos | Resultado esperado | OK? |
|---|--------|-------------------|-----|
| C1 | No **PC A**: criar `GO-LIVE-03` em Materiais e salvar | Sucesso | [ ] |
| C2 | No **PC B** (ou aba anónima): login igual → Materiais → Ctrl+F5 | Material aparece | [ ] |
| C3 | Desligar rede no PC A → tentar **novo** cadastro → Salvar | **Falha** ou aviso; **não** deve “fingir” que gravou na nuvem | [ ] |

---

## D. Conflito e proteções (opcional, 5 min)

| # | Testes | OK? |
|---|--------|-----|
| D1 | Abrir o **mesmo** módulo em PC e Campo; gravar quase ao mesmo tempo num registo | Um dos lados mostra **conflito**; após **Atualizar lista**, novo save funciona | [ ] |
| D2 | Modal “Novo …”: preencher 1 campo → clicar no **fundo escuro** | Modal **permanece aberto** | [ ] |
| D3 | Preencher 1 campo → **Fechar** ou **Cancelar** | Pede confirmacao antes de descartar | [ ] |
| D4 | Preencher 1 campo → tecla **Esc** | Pede confirmacao antes de descartar | [ ] |

---

## E. O que **não** fazer em produção

- [ ] Não usar **Limpar cadastros** / fábrica sem backup e sem alinhamento da equipa  
- [ ] Não trabalhar longamente **sem** Supabase em produção (build bloqueia gravação local só)  
- [ ] Não ignorar aviso de **conflito** — sempre atualizar lista e gravar de novo  
- [ ] Não ignorar primeira abertura de **Etiquetas** após upgrade (migração automática PC → nuvem se snapshot vazio)

---

## F. Fecho

| Item | OK? |
|------|-----|
| Todos os módulos críticos da obra marcados em B | [ ] |
| Provas C1–C3 passaram | [ ] |
| Registos de teste `GO-LIVE-*` apagados ou mantidos como referência (decisão da obra) | [ ] |
| Equipa informada: **nuvem = referência; Salvar = contrato; modal não perde rascunho ao clicar fora** | [ ] |

**Assinatura / data:** _________________________

---

*Checklist operacional completo (backups, RLS, mobile):* `CHECKLIST-OPERACOES.md`
