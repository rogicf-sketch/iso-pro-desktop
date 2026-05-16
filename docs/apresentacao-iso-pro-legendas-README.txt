I.S.O PRO — ficheiros de legenda (para apps de vídeo)
======================================================

Texto de apresentação em linguagem simples (frase + explicação por slide):
  apresentacao-iso-pro-frases-impacto.md

======================================================

O Markdown "apresentacao-iso-pro-roteiro-video.md" NÃO é formato de legenda.
Muitas apps só aceitam SRT, VTT ou CSV com tempos.

Ficheiros nesta pasta (docs):

0) apresentacao-iso-pro-legendas-video-156s.srt  (RECOMENDADO — storyboard ~156 s, abertura 0-9s)
   - 28 entradas: 0-9, 9-16, 16-22, ... 148-156s. Abertura alinhada ao slide "Apresentação / Abertura do sistema".

0b) apresentacao-iso-pro-legendas-video-123s.srt  (corte ~123 s, legado)
   - Tempos mais curtos por slide. Abertura já corrigida (sem "cadastro ao comprovante" no slide 1).

   Texto / notas: apresentacao-iso-pro-narracao-video-melhorada.md e apresentacao-iso-pro-roteiro-video.md

1) apresentacao-iso-pro-legendas-trailer.srt
   - 12 blocos de legenda, ~55 segundos no total.
   - Use se o vídeo for o "trailer" rápido (uma frase por bloco do roteiro).

2) apresentacao-iso-pro-legendas-28-slides.srt
   - 28 blocos (uma legenda curta por slide do deck), ~94 segundos no total.
   - Tempos = soma da tabela "Seg. VO" do roteiro (88 s + pequena folga no último).

3) apresentacao-iso-pro-legendas-trailer.vtt
   - Mesmo conteúdo do trailer, formato WebVTT (alguns players / web).

4) apresentacao-iso-pro-legendas-trailer.csv
   - Colunas: index, start_sec, end_sec, text — para importar em folha de cálculo ou ferramentas que peçam CSV.

Dica: no CapCut / DaVinci / Premiere importe o ficheiro .srt (Legendas > Importar).
Se o vídeo tiver outra duração, ajuste os tempos no editor ou peça para gerar novo SRT com a duração certa.

Codificação: UTF-8.
