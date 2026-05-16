# I.S.O PRO — Roteiro para vídeo (legendas / narração)

Documento de apoio ao deck **`apresentacao-iso-pro-slides.html`** / **`apresentacao-iso-pro-slides-embedded.html`** (28 slides, ordem do menu).

**Versão longa (o que o sistema faz + blocos para colar nos slides):** ver **`apresentacao-iso-pro-roteiro-sistema-elaborado.md`** na mesma pasta `docs/`.

**Como usar**

- **Legenda curta:** linhas marcadas como *Legenda* — cabem em 1–2 linhas no editor de vídeo (CapCut, DaVinci, etc.).
- **Narração:** bloco *Fala* — pode alongar ou cortar conforme o tempo alvo por slide (sugestão: 20–45 s por slide de módulo; 10–15 s em transições).
- Gravar com o HTML em **modo vídeo** (`class="prep-gravacao-video"` no `<body>`): mais espaço para as capturas; legendas no vídeo vêm deste ficheiro ou do teu editor.

**Tempo sugerido (pré-preenchido):** valores na coluna abaixo somam ~**88 s** de voz útil para um **tour rápido** slide a slide (VO apertado). Ajusta ao teu locutor: +15–25% se quiseres pausas naturais.

---

## Roteiro VO contínuo — trailer (~52–56 s)

Uma única leitura, em **12 planos** (cortar o vídeo ou saltar slides no editor conforme a coluna «Slides»). Tom: direto, foco em *resultado*. Para ficar nos **~49 s** originais, funde as duas últimas linhas da tabela (temas + encerramento) num único plano e corta adjetivos nas linhas do meio.

| Seg. aprox. | Slides (deck) | Narração (PT-BR) |
|-------------|---------------|------------------|
| 0–5 | 1 | «I.S.O PRO — Gestão de Materiais. Apresentação pelo menu: acesso, operação, qualidade, relatórios e campo.» |
| 5–9 | 2–3 | «Acesso por perfil e um painel que mostra o pulso da operação: armazenamento, nuvem e o que precisa de atenção.» |
| 9–14 | 4–6 | «Cadastros que sustentam tudo: fornecedores, equipas e o catálogo de materiais — base para NF, etiquetas e baixa.» |
| 14–19 | 7–8 | «No planejamento, cada documento leva a demanda até à execução. Nos recebimentos, a entrada amarra NF, romaneio e stock.» |
| 19–23 | 9–10 | «Conferência valida antes de libertar material. Etiquetas ligam o físico ao mesmo código que o campo vai ler.» |
| 23–29 | 11–14 | «Atendimento com rasto e recibo para auditoria. Inventário — também no mobile — fecha a posição; equipamentos apoiam o património da obra.» |
| 29–34 | 15–18 | «Qualidade integrada: RIR e RNC, do registo ao relatório para arquivo e fornecedor.» |
| 34–39 | 19–21 | «Relatórios gerenciais e relatório fotográfico: indicadores no desktop e evidência por NF quando a obra precisa provar.» |
| 39–45 | 22–23 | «No desktop autorizas os telemóveis; no Campo, o app usa o mesmo snapshot — conferência, atendimento, documentos, inventário.» |
| 45–50 | 24–26 | «Utilizadores, licenças e configurações fecham a governança: quem faz o quê, onde está instalado e como se apresenta o sistema.» |
| 50–53 | 27 | «E ainda: vários temas visuais — escolhe o que a tua equipa prefere para operar.» |
| 53–55 | 28 | «I.S.O PRO no Campo — começa no desktop, desempenha na obra.» |

---

## Roteiro VO contínuo — tour menu (~88 s, slide a slide)

Texto corrido para gravar **numa só tomada** enquanto avanças o HTML (ajusta respirações entre frases). Alinha com a ordem `data-slide` 1…28.

«I.S.O PRO — gestão de materiais: uma linha só do cadastro à prova no arquivo. Entramos com login por perfil; no painel vês armazenamento, Supabase e o estado da operação. Fornecedores e colaboradores dão contexto a NF e a quem retira material; o cadastro de materiais sustenta planeamento, etiquetas e atendimento. No planejamento, documentos e linhas levam a demanda até execução; nos recebimentos amarras NF e romaneio ao stock. A conferência trava divergências antes de libertar; as etiquetas ligam o físico ao código que o mobile lê. Atendimento com leitor e lotes, e recibo para arquivo. Inventário — rotativo ou geral — pode contar no telemóvel. Equipamentos apoiam o património da obra. RIR e RNC fecham o lado qualidade: inspeção de recebimento e não conformidade, cada um com relatório. Relatórios gerenciais resumem tudo; o relatório fotográfico junta imagens ao recebimento. No desktop governas dispositivos mobile; no app, o mesmo dado no Campo. Utilizadores e permissões, licenças das máquinas, configurações e temas. Fechamos na visão mobile: atalhos para o que o operador usa todos os dias.»

---

## Tabela de tempos sugeridos (28 slides → ~88 s)

| Slide | Rota resumida | Seg. VO |
|:-----:|---------------|--------:|
| 1 | Abertura | 5 |
| 2 | `/login` | 3 |
| 3 | `/dashboard` | 4 |
| 4 | `/fornecedores` | 2 |
| 5 | `/colaboradores` | 2 |
| 6 | `/materiais` | 4 |
| 7 | `/documentos` | 5 |
| 8 | `/recebimentos` | 4 |
| 9 | `/conferencia` | 4 |
| 10 | `/etiquetas` | 3 |
| 11 | `/atendimento` | 4 |
| 12 | `/atendimento` · recibo | 3 |
| 13 | `/inventario` | 3 |
| 14 | `/equipamentos` | 2 |
| 15 | `/rir` | 3 |
| 16 | `/rir` · relatório | 3 |
| 17 | `/rnc` | 3 |
| 18 | `/rnc` · relatório | 3 |
| 19 | `/relatorios` | 3 |
| 20 | `/relatorio-fotografico` | 3 |
| 21 | `/relatorio-fotografico` · documento | 3 |
| 22 | `/mobile` | 3 |
| 23 | `iso_pro_mobile` | 5 |
| 24 | `/usuarios` | 3 |
| 25 | `/licencas-desktop` | 2 |
| 26 | `/configuracoes` | 3 |
| 27 | Aparência | 4 |
| 28 | `iso_pro_mobile` encerramento | 5 |
| | **Total** | **88** |

---

## Slide 1 — Abertura · I.S.O PRO — Gestão de materiais

**Rota:** Abertura  
**Tempo:** 5 s

**Legenda:** Apresentação do I.S.O PRO — Gestão de Materiais; tour pelo menu do sistema.

**Fala:** Bem-vindo. I.S.O PRO é a plataforma de gestão de materiais para escritório e obra. Nesta apresentação seguimos a ordem do menu — login, operações, qualidade, relatórios e dispositivos mobile. O slide de temas mostra opções de aparência. No primeiro slide evite já explicar o fluxo “cadastro ao comprovante”: isso casa melhor com os módulos seguintes.

---

## Slide 2 — Login e acesso

**Rota:** `/login`  
**Tempo:** 3 s

**Legenda:** Entrada segura por perfil — Administrador, Planejamento, Operação, Consulta.

**Fala:** O login garante acesso controlado ao desktop, alinhado a permissões e à governança da equipa.

---

## Slide 3 — Painel

**Rota:** `/dashboard`  
**Tempo:** 4 s

**Legenda:** Visão geral: armazenamento local, Supabase e indicadores da operação.

**Fala:** O painel consolida o estado da operação: saúde do armazenamento, ligação à nuvem Supabase e leitura rápida do que está a acontecer.

---

## Slide 4 — Fornecedores

**Rota:** `/fornecedores`  
**Tempo:** 2 s

**Legenda:** Cadastro base para NF, recebimentos e qualidade — com CSV.

**Fala:** Fornecedores normalizados, com importação e exportação CSV e sincronização quando a nuvem está ativa.

---

## Slide 5 — Colaboradores

**Rota:** `/colaboradores`  
**Tempo:** 2 s

**Legenda:** Quem retira material e quem opera — rasto humano.

**Fala:** Colaboradores internos ou externos, ligados a atendimento, inventário e relatórios.

---

## Slide 6 — Materiais (cadastro)

**Rota:** `/materiais`  
**Tempo:** 4 s

**Legenda:** Catálogo mestre: códigos de barras, disciplinas, base para o resto do fluxo.

**Fala:** O cadastro de materiais é a base: EAN-13 opcional, saldos, exportação — suporta planeamento, etiquetas e atendimento.

---

## Slide 7 — Planejamento de materiais

**Rota:** `/documentos` (menu: Planejamento)  
**Tempo:** 5 s

**Legenda:** Documentos de necessidade e linhas até à execução.

**Fala:** Planeamento por documento com estados — pendente, parcial, recebido, atendido — com rastreio até ao requerente. No mobile o separador equivalente chama-se Documentos.

---

## Slide 8 — Recebimentos

**Rota:** `/recebimentos`  
**Tempo:** 4 s

**Legenda:** NF, romaneio e itens alinhados ao stock.

**Fala:** Entrada de material com travas, importação em massa e ligação à conferência e às etiquetas.

---

## Slide 9 — Conferência

**Rota:** `/conferencia`  
**Tempo:** 4 s

**Legenda:** Validar recebimentos antes de libertar stock.

**Fala:** Conferência com tratamento de divergências antes da liberação definitiva para o armazém. O mesmo conceito existe no app mobile.

---

## Slide 10 — Etiquetas

**Rota:** `/etiquetas`  
**Tempo:** 3 s

**Legenda:** Impressão a partir de recebimentos — ligação física ao código.

**Fala:** Etiquetas alinhadas ao recebimento, para o mobile e o inventário lerem o mesmo código.

---

## Slide 11 — Atendimento (módulo)

**Rota:** `/atendimento`  
**Tempo:** 4 s

**Legenda:** Atendimento por documento — leitor USB e rasto na lista de lotes.

**Fala:** Ecrã principal de atendimento. No slide seguinte mostramos o recibo de retirada. No mobile há o separador Atendimento.

---

## Slide 12 — Atendimento — recibo

**Rota:** `/atendimento` · recibo  
**Tempo:** 3 s

**Legenda:** Comprovativo de retirada — arquivo e auditoria.

**Fala:** Recibo com itens, quantidades e identificação do lote — útil para impressão, PDF e auditoria. A seguir no menu vem Inventário.

---

## Slide 13 — Inventário

**Rota:** `/inventario`  
**Tempo:** 3 s

**Legenda:** Rotativo ou geral — integração com contagem no mobile.

**Fala:** Inventários com estados, exportação e opção de contagem pelo I.S.O PRO Mobile.

---

## Slide 14 — Equipamentos

**Rota:** `/equipamentos`  
**Tempo:** 2 s

**Legenda:** Equipamentos ligados à operação e rasto patrimonial quando aplicável.

**Fala:** Registo de equipamentos para apoio à obra conforme o vosso processo.

---

## Slide 15 — RIR — módulo

**Rota:** `/rir`  
**Tempo:** 3 s

**Legenda:** Inspeção de recebimento — vínculo a NF e listas.

**Fala:** RIR com vínculo a nota fiscal, procedimentos e listas — preparação para o relatório no slide seguinte.

---

## Slide 16 — RIR — relatório

**Rota:** `/rir` · relatório  
**Tempo:** 3 s

**Legenda:** Relatório RIR para arquivo e impressão.

**Fala:** Documento gerado no fluxo para arquivo e auditoria. Depois segue o módulo RNC no menu.

---

## Slide 17 — RNC — módulo

**Rota:** `/rnc`  
**Tempo:** 3 s

**Legenda:** Não conformidade ligada à NF — com evidências.

**Fala:** Registo de RNC com segregação e evidências. O próximo slide mostra o relatório.

---

## Slide 18 — RNC — relatório

**Rota:** `/rnc` · relatório  
**Tempo:** 3 s

**Legenda:** Relatório RNC — fornecedor, arquivo, auditoria.

**Fala:** Documento de não conformidade para arquivo e partilha com o fornecedor. A seguir: Relatórios no menu.

---

## Slide 19 — Relatórios

**Rota:** `/relatorios`  
**Tempo:** 3 s

**Legenda:** Indicadores e exportações gerenciais — visão resumida.

**Fala:** Painel resumido: materiais, recebimentos, qualidade, mobile e licenças — sem sobrecarregar o operador.

---

## Slide 20 — Relatório fotográfico — módulo

**Rota:** `/relatorio-fotografico`  
**Tempo:** 3 s

**Legenda:** Arquivo por NF/romaneio — fotos ligadas a recebimentos.

**Fala:** Módulo com compressão e ligação aos recebimentos. No slide seguinte, o documento com grelha de fotos.

---

## Slide 21 — Relatório fotográfico — documento

**Rota:** `/relatorio-fotografico` · documento  
**Tempo:** 3 s

**Legenda:** Relatório HTML com fotos — obra e arquivo.

**Fala:** Saída para impressão ou PDF com grelha de fotos. Depois: Dispositivos mobile no menu.

---

## Slide 22 — Dispositivos mobile — módulo (desktop)

**Rota:** `/mobile`  
**Tempo:** 3 s

**Legenda:** Autorizar, bloquear e revogar telemóveis que acedem ao snapshot.

**Fala:** No desktop governa-se quais aparelhos acedem ao mesmo dado do Campo — segurança e conformidade. Não mostrar chaves nem URLs sensíveis em vídeo.

---

## Slide 23 — Dispositivos mobile — app no Campo

**Rota:** `iso_pro_mobile`  
**Tempo:** 5 s

**Legenda:** Mesmo snapshot no telemóvel — Documentos, conferência, atendimento, inventário.

**Fala:** Após autorização no desktop, o operador usa o app no Campo com o mesmo dado: conferência, atendimento, documentos e inventário.

---

## Slide 24 — Usuários e permissões

**Rota:** `/usuarios`  
**Tempo:** 3 s

**Legenda:** Contas, perfis e ativo/inativo — cada ação atribuível.

**Fala:** Administração de utilizadores do desktop e perfis de permissão.

---

## Slide 25 — Licenças desktop

**Rota:** `/licencas-desktop`  
**Tempo:** 2 s

**Legenda:** Licenças, expiração e identificação da máquina.

**Fala:** Visibilidade para TI ou gestão: licenças instaladas, risco de expiração e identificação do equipamento.

---

## Slide 26 — Configurações

**Rota:** `/configuracoes`  
**Tempo:** 3 s

**Legenda:** Tema, numeração, cliente/projeto, integrações — central administrativa.

**Fala:** Parâmetros gerais e aparência; o tema Neon é o recomendado para demos coerentes no restante deck.

---

## Slide 27 — Temas do sistema (quatro capturas)

**Rota:** Aparência · Configurações  
**Tempo:** 4 s

**Legenda (curta):** Quatro temas: Neon e azul em cima; Verde e Claro em baixo.

**Legenda (alternativa longa):** Linha 1: Neon e tema clássico azul. Linha 2: Tema Verde e Tema Claro — todos configuráveis em Configurações.

**Fala:** Aqui comparamos quatro referências visuais. Na narrativa do dia a dia convém manter um só tema nos restantes slides; este slide serve para mostrar variedade de aparência sem misturar no meio do tour pelo menu.

---

## Slide 28 — I.S.O PRO no Campo (encerramento)

**Rota:** `iso_pro_mobile`  
**Tempo:** 5 s

**Legenda:** O mesmo snapshot no telemóvel — início, conferência, atendimento, documentos, inventário.

**Fala:** Fechamos com a visão mobile: atalhos para o que o operador mais usa no Campo. Projeto `iso_pro_mobile`. Podes deixar dois a três segundos de silêncio ou logótipo no fim do vídeo.

---

## Notas finais para edição

- Exportar áudio separado do ecrã facilita ajustar legendas.
- Renovar capturas: pasta `docs/apresentacao-assets/`, depois `gerar-apresentacao-slides-embedded.ps1` se usares o HTML embutido.
- Roteiro em Markdown: podes duplicar este ficheiro por versão (`roteiro-v2.md`) quando o produto evoluir.
