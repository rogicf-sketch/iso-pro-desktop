# I.S.O PRO — Roteiro elaborado: o que o sistema faz (para slides e narração)

Este documento descreve **de forma completa** o que o **I.S.O PRO — Gestão de materiais** entrega na operação. Serve para:

- redigir **legendas** e **caixas de texto** nos slides HTML (`apresentacao-iso-pro-slides.html`);
- preparar **narração** ou **speaker notes** em qualquer ferramenta;
- alinhar equipa comercial, implantação e suporte numa **única narrativa**.

Para legendas curtas por slide, podes cruzar com **`apresentacao-iso-pro-roteiro-video.md`**.

---

## 1. O produto em uma frase

O **I.S.O PRO** é uma linha de software para **cadastrar, planear, receber, conferir, etiquetar, entregar e inventariar materiais** na obra — com **rasto** (quem, quando, quanto, em que documento ou NF), **relatórios** gerenciais e **qualidade** (RIR e RNC), no **desktop** e no **campo** (app mobile), opcionalmente sincronizado na **nuvem (Supabase)**.

---

## 2. Para quem é e que problema resolve

**Público:** almoxarifados, planeamento de materiais, obra, qualidade, TI e gestão que precisam de **uma fonte de verdade** sobre o que foi pedido, o que chegou, o que foi validado, o que foi retirado e o que ainda está em stock lógico.

**Problemas que endereça:**

- Pedidos e necessidades **espalhados** em planilhas ou e-mail sem estado claro.
- Recebimento **sem amarração** a NF, romaneio e itens do catálogo.
- Conferência **informal**, sem registo de divergências antes de libertar material.
- Etiquetas **desligadas** do recebimento e do código que o campo lê.
- Atendimento **sem comprovativo** auditável (recibo).
- Inventário **desconectado** da contagem no terreno.
- Qualidade **reactive** sem relatórios padronizados (RIR / RNC).
- **Vários telemóveis** a aceder ao mesmo dado sem governo (autorização / bloqueio / revogação).
- **Instalações desktop** sem visibilidade de licença ou expiração.

---

## 3. Arquitetura em três camadas (como explicar num slide)

1. **Desktop (Electron + React)** — operação pesada: cadastros, planeamento, recebimentos, conferência, etiquetas, atendimento com leitor USB, inventário, relatórios, administração de utilizadores, licenças e configurações.
2. **Campo (`iso_pro_mobile`)** — o **mesmo snapshot** operacional: documentos/planeamento equivalente, conferência, atendimento, inventário e documentos no terreno, após **autorização** no desktop.
3. **Nuvem (Supabase, opcional)** — quando configurada, sincroniza dados e reforça políticas no servidor (RLS). Sem Supabase, o desktop pode seguir em **modo local** para desenvolvimento ou contingência.

**Licenciamento:** o desktop suporta **licenças assinadas** por máquina (par de chaves RSA), para controlar instalações autorizadas e prazos.

---

## 4. Fluxo operacional do material (história de ponta a ponta)

Use este bloco como **narrativa única** num slide de “visão do processo” ou como introdução oral antes de entrar módulo a módulo.

1. **Define-se quem fornece e quem retira** (fornecedores, colaboradores) e **o que é material** (cadastro, códigos de barras, disciplinas).
2. **Planeamento** regista **documentos de necessidade** e linhas até à execução, com estados (pendente → parcial → recebido → atendido).
3. **Recebimentos** amarram NF, romaneio e itens ao stock esperado, com travas e importação em massa quando necessário.
4. **Conferência** valida o que chegou **antes** de libertar definitivamente para o armazém; divergências ficam tratadas no fluxo.
5. **Etiquetas** ligam o **objeto físico** ao registo do recebimento — o mesmo código acompanha o mobile e o inventário.
6. **Atendimento** executa a retirada por documento, com **recibo** (impressão / PDF) para arquivo e auditoria.
7. **Inventário** (rotativo ou geral) reconcilia stock com contagem, incluindo **contagem pelo app** quando permitido.
8. **Qualidade** (RIR / RNC) documenta inspeção de recebimento e não conformidades com **relatórios** para fornecedor e arquivo.
9. **Relatórios** e **relatório fotográfico** fecham a visão gerencial e documental com exportações e grelhas de fotos por NF.

---

## 5. Módulos: o que cada um faz (texto para slides ou voz)

### Login e perfis

Acesso por **perfil** (Administrador, Planejamento, Operação, Consulta): cada ecrã respeita permissões, reduzindo erro humano e garantindo **rasto por utilizador** nas ações sensíveis.

### Painel

**Visão consolidada:** saúde do armazenamento local do perfil da aplicação, ligação Supabase, indicadores resumidos e leitura rápida do “estado da casa” sem abrir cada módulo.

### Fornecedores

Cadastro **normalizado** de fornecedores, base para NF, recebimentos e qualidade; suporta **importação/exportação CSV** e sincronização com nuvem quando ativa.

### Colaboradores

Quem **opera no sistema** e quem **retira material** no atendimento — liga pessoas a processos e relatórios, reforçando responsabilização.

### Materiais (cadastro)

**Catálogo mestre:** códigos, disciplinas, opcionalmente **EAN-13**, saldos e exportação. É a base técnica para planeamento, recebimentos, etiquetas e atendimento falarem a mesma língua sobre “o quê”.

### Planejamento de materiais (`/documentos`)

Documentos de necessidade com **linhas** e **estados** até conclusão; rastreio até ao requerente. No mobile, o separador equivalente aparece como **Documentos** — mesmo conceito operacional com outro rótulo no telemóvel.

### Recebimentos

Entrada formal de material: **NF**, romaneio, itens alinhados ao catálogo; **travas** de negócio e importação em massa; ligação natural à **conferência** e às **etiquetas**.

### Conferência

**Gate** antes de libertar stock: validação do recebido, tratamento de **divergências** e registo explícito da decisão — reduz material “fantasma” ou liberado por engano.

### Etiquetas

Impressão a partir de **recebimentos** e histórico: a etiqueta **prova** a ligação física ao lote/código que o inventário e o campo vão ler.

### Atendimento e recibo

Atendimento por **documento**, com suporte a **leitor USB** e rasto na lista de lotes. O **recibo** fecha o ciclo com comprovativo de retirada (itens, quantidades, identificação) para arquivo e auditoria.

### Inventário

Ciclos **rotativos ou gerais**, estados, exportação e opção de **contagem pelo mobile** quando a política do inventário permitir — aproxima o stock sistémico da contagem física.

### Equipamentos

Registo de **equipamentos** ligados à operação e, quando faz sentido para o processo do cliente, apoio a **rasto patrimonial**.

### RIR (inspeção de recebimento)

Do **registo** à **lista** com vínculo a NF e procedimentos; geração de **relatório de inspeção de recebimento** para arquivo e qualidade.

### RNC (não conformidade)

Registo de não conformidade **ligado à NF**, com segregação e evidências; **relatório RNC** para fornecedor, arquivo e auditoria externa.

### Relatórios

Painel **resumido** (materiais, recebimentos, qualidade, mobile, licenças) para gestão — informação suficiente sem sobrecarregar o operador do dia a dia.

### Relatório fotográfico

Arquivo por **NF/romaneio** com compressão e ligação a recebimentos; **documento HTML** com grelha de fotos para obra e arquivo.

### Dispositivos mobile (desktop)

**Governo dos telemóveis:** listar, **autorizar**, **bloquear** e **revogar** aparelhos que acedem ao snapshot — segurança e conformidade no acesso ao campo.

### App no Campo (`iso_pro_mobile`)

Após autorização, o operador acede ao **mesmo dado**: conferência, atendimento, documentos/planeamento e inventário — **continuidade** entre escritório e obra.

### Usuários e permissões

Administração de **contas**, perfis e estado ativo/inativo: cada ação relevante no desktop pode ser **atribuída** a um utilizador.

### Licenças desktop

Visibilidade para **TI ou gestão**: licenças instaladas, **expiração**, identificação da **máquina** — reduz risco de uso não licenciado ou desalinhado com contrato.

### Configurações

Central de **tema**, numeração, cliente/projeto, logo institucional (recibos e relatórios HTML), integrações **Supabase** e parâmetros gerais — um só sítio para “como o sistema se comporta”.

### Temas (slide dedicado)

Vários modos visuais (**Neon**, padrão escuro, escuro, claro, verde, …). O deck de apresentação recomenda **consistência** (ex.: Neon) nos slides de módulo e usa um slide específico para **comparar** quatro capturas (Neon, azul clássico, Verde, Claro) sem misturar temas no meio do tour.

### Encerramento — I.S.O PRO no Campo

Reforço da mensagem: **mesmo snapshot**, atalhos para o que o operador mais usa no telemóvel — ponte entre o que foi mostrado no desktop e a realidade da obra.

---

## 6. Blocos prontos para colar nos slides (28 × “Legenda longa”)

Cada bloco pode ir para `<p class="legenda">…</p>` (podes encurtar) ou para notas de apresentador. Ajusta nomes de cliente/projeto se falares em contexto específico.

**Slide 1 — Abertura**  
O I.S.O PRO reúne numa só linha de produto o cadastro, o movimento e a prova dos materiais na obra: do pedido ao recibo, passando por recebimento, conferência, etiquetas e inventário, com relatórios e qualidade integrados. O mesmo raciocínio liga o desktop ao campo.

**Slide 2 — Login**  
O acesso ao desktop é feito com perfis claros — administrador, planejamento, operação ou consulta — para que cada pessoa veja só o que precisa e para que as ações fiquem alinhadas à governança e às permissões definidas pela organização.

**Slide 3 — Painel**  
O painel oferece uma fotografia imediata da operação: espaço reservado à aplicação neste computador, estado da ligação à nuvem Supabase quando configurada, e indicadores que ajudam a perceber se o sistema está saudável antes de mergulhar nos módulos.

**Slide 4 — Fornecedores**  
O cadastro de fornecedores é a base mestre para notas fiscais, recebimentos e processos de qualidade. Importação e exportação em CSV e sincronização com a nuvem permitem manter o cadastro alinhado entre equipas e sistemas.

**Slide 5 — Colaboradores**  
Aqui define-se quem retira material no atendimento e quem aparece como operador nos fluxos. Isso cria rasto humano: não basta saber o que mudou no stock, importa saber **quem** estava ligado à decisão.

**Slide 6 — Materiais**  
O catálogo de materiais concentra códigos, disciplinas e, quando necessário, códigos de barras EAN-13. Saldos e exportações alimentam planeamento, etiquetas e atendimento com a mesma definição de item.

**Slide 7 — Planejamento**  
Os documentos de necessidade traduzem pedidos em linhas executáveis, com estados que acompanham o ciclo de vida — pendente, parcial, recebido e atendido — até fecho junto do requerente. No telemóvel, o mesmo conceito aparece no separador Documentos.

**Slide 8 — Recebimentos**  
O recebimento formaliza a entrada: NF, romaneio e itens amarrados ao catálogo, com regras que impedem atalhos perigosos e com suporte a importação em massa quando a operação recebe muitas linhas de uma vez.

**Slide 9 — Conferência**  
Antes de libertar material para o armazém, a conferência valida o que chegou. Divergências são tratadas no fluxo, reduzindo erro de baixa e aumentando a confiança do stock sistémico.

**Slide 10 — Etiquetas**  
As etiquetas conectam o objeto físico ao registo sistémico do recebimento. Isso é o que permite ao campo e ao inventário ler o mesmo código e falar do mesmo lote sem ambiguidade.

**Slide 11 — Atendimento (módulo)**  
O atendimento organiza a retirada por documento, com leitor USB e visibilidade dos lotes. É o ponto onde o plano encontra a pessoa que leva o material para a obra.

**Slide 12 — Recibo**  
O recibo fecha o ato de retirada: itens, quantidades e identificação do lote num documento pronto para impressão ou PDF, útil para arquivo interno, auditoria ou acordo simples com a equipa de obra.

**Slide 13 — Inventário**  
Inventários rotativos ou gerais permitem reconciliar o stock com a contagem física. Quando a política do inventário permite, a contagem pode ser feita pelo app mobile, aproximando o escritório do que foi realmente contado no terreno.

**Slide 14 — Equipamentos**  
O registo de equipamentos apoia a operação e, quando o processo do cliente exige, o rasto patrimonial dos bens ligados à obra.

**Slide 15 — RIR (módulo)**  
O relatório de inspeção de recebimento começa no registo estruturado: vínculo à NF, listas e procedimentos que alimentam o relatório formal que veremos a seguir.

**Slide 16 — RIR (relatório)**  
O relatório de inspeção de recebimento é a peça de arquivo e comunicação com qualidade e fornecedor — saída padronizada a partir do fluxo, sem recriar o caso em Word fora do sistema.

**Slide 17 — RNC (módulo)**  
A não conformidade fica ligada à nota fiscal, com segregação de informação e espaço para evidências — base para exigência de resposta do fornecedor e para trilho de auditoria.

**Slide 18 — RNC (relatório)**  
O relatório de não conformidade consolida o caso para arquivo, envio ao fornecedor e revisão gerencial, com a mesma seriedade documental do RIR.

**Slide 19 — Relatórios**  
O módulo de relatórios entrega uma visão gerencial resumida — materiais, recebimentos, qualidade, mobile e licenças — para decisão sem sobrecarregar quem opera o dia a dia nos ecrãs transacionais.

**Slide 20 — Relatório fotográfico (módulo)**  
O arquivo fotográfico por NF ou romaneio guarda imagens comprimidas e ligadas ao recebimento, provando visualmente o estado da carga recebida.

**Slide 21 — Relatório fotográfico (documento)**  
O documento com grelha de fotos traduz esse arquivo numa peça única para obra, cliente ou auditoria — pronta para impressão ou PDF conforme o fluxo interno.

**Slide 22 — Dispositivos mobile (desktop)**  
No desktop, a equipa de TI ou o administrador governa quais telemóveis podem aceder ao snapshot: autorização explícita, bloqueio e revogação. Isso reduz risco de acessos paralelos não controlados ao mesmo dado.

**Slide 23 — App no Campo**  
Depois de autorizado no desktop, o operador no terreno usa o app com o **mesmo** conjunto de dados: conferência, atendimento, documentos e inventário — continuidade real entre escritório e obra.

**Slide 24 — Usuários**  
A administração de utilizadores e perfis garante que contas ativas correspondam a pessoas reais e que permissões reflitam funções — essencial para auditoria e para reduzir superfície de erro.

**Slide 25 — Licenças desktop**  
A visão de licenças por máquina e por prazo ajuda gestão e TI a alinhar instalações ao contrato, antecipar renovações e identificar equipamentos não autorizados.

**Slide 26 — Configurações**  
Configurações concentram tema, numerações, identidade visual em relatórios e recibos, e integrações Supabase. É onde se define “como o sistema se apresenta e a que nuvem fala”.

**Slide 27 — Temas**  
O sistema oferece vários temas visuais; este slide compara quatro referências — Neon e azul clássico na primeira linha, Verde e Claro na segunda — para decisão de marca ou acessibilidade sem misturar capturas inconsistentes no resto da apresentação.

**Slide 28 — I.S.O PRO no Campo**  
O telemóvel resume o que o operador mais precisa no campo: atalhos para conferência, atendimento, inventário e documentos, sobre o mesmo snapshot que o desktop governa e licencia.

---

## 7. Sugestão de ordem ao gravar ou apresentar

1. Abertura + **fluxo** (secção 4) em voz alta ou num slide único de “pipeline”.  
2. Percorrer o menu **na ordem dos slides** (já espelha o produto).  
3. Pares **módulo + documento** (atendimento/recibo, RIR/relatório, RNC/relatório, relatório fotográfico/documento) como “fecho” de cada história.  
4. **Mobile** depois de **desktop** nos dispositivos, para a narrativa “primeiro governo, depois uso”.  
5. **Configurações + temas** antes do encerramento Campo, ou logo após relatórios — conforme preferires enfatizar governança vs operação.

---

## 8. Manutenção

Quando o produto ganhar módulos ou mudar nomes de menu, atualiza este ficheiro e, em paralelo, os textos `<p class="legenda">` / `<p class="notes">` no HTML dos slides para não ficarem divergentes.

**Ficheiros relacionados**

- `apresentacao-iso-pro-slides.html` — deck principal  
- `apresentacao-iso-pro-slides-embedded.html` — mesmas imagens embutidas (`gerar-apresentacao-slides-embedded.ps1`)  
- `apresentacao-iso-pro-roteiro-video.md` — legendas curtas e tempos por slide  
