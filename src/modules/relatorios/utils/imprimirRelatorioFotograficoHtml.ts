import {
  abrirImpressaoHtmlRelatorio,
  cssBarraPreVisualizacaoImpressaoHtml,
  cssInstitucionalRelatorio,
  escapeHtmlRelatorio,
  htmlBarraPreVisualizacaoImpressao,
  htmlBlocoLogoInstitucional,
  segmentoInstituicaoRodapeEletronico,
  scriptBarraPreVisualizacaoImpressao,
} from '../../../lib/htmlRelatorioInstitucional';
import { resolverUrlLogoInstitucionalParaHtmlImpresso } from '../../../lib/logoInstitucional';
import { readConfiguracoes } from '../../configuracoes/services/configuracoes.service';
import type { RelatorioFotograficoFoto, RelatorioFotograficoPayload } from '../types/relatorioFotografico.types';

const FOTOS_POR_PAGINA = 4;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function linhaCampo(rotulo: string, valor: string): string {
  const v = valor.trim();
  if (!v) return '';
  return `<div class="rf-campo-linha"><span class="rf-campo-rot">${escapeHtmlRelatorio(rotulo)}</span><span class="rf-campo-val">${escapeHtmlRelatorio(v)}</span></div>`;
}

function linhaCampoOuTraco(rotulo: string, valor: string): string {
  const v = valor.trim() || '—';
  return `<div class="rf-campo-linha"><span class="rf-campo-rot">${escapeHtmlRelatorio(rotulo)}</span><span class="rf-campo-val">${escapeHtmlRelatorio(v)}</span></div>`;
}

function celulaFoto(f: RelatorioFotograficoFoto, indiceGlobal: number): string {
  const legendaHtml =
    f.mostrarLegendaImpressao && f.legenda.trim()
      ? `<p class="rf-foto-legenda">${escapeHtmlRelatorio(f.legenda).replace(/\n/g, '<br>')}</p>`
      : '';
  return `
    <div class="rf-celula">
      <div class="rf-foto-num">Foto ${indiceGlobal + 1}</div>
      <div class="rf-foto-wrap">
        <img class="rf-foto-img" src="${escapeHtmlRelatorio(f.dataUrl ?? '')}" alt="" />
      </div>
      ${legendaHtml}
    </div>`;
}

export function montarHtmlRelatorioFotografico(p: RelatorioFotograficoPayload): string {
  const cfg = readConfiguracoes();
  const clienteImpressao = cfg.cliente.trim() || p.centroCusto.trim();
  const projetoImpressao = cfg.projeto.trim() || p.projeto.trim();
  const localImpressao = cfg.local.trim() || p.localObra.trim();
  const logo = resolverUrlLogoInstitucionalParaHtmlImpresso(cfg.logoInstitucionalUrl);
  const segRodapeInst = segmentoInstituicaoRodapeEletronico(cfg.documentoRodapeNome, cfg.documentoRodapeCnpj);
  const geradoEm = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const tituloPrincipal = p.titulo.trim() || 'Relatório fotográfico';
  const numeroDoc = p.numeroRelatorio.trim();

  const logoCol =
    p.incluirLogoImpressao && logo
      ? htmlBlocoLogoInstitucional(logo)
      : p.incluirLogoImpressao
        ? htmlBlocoLogoInstitucional('')
        : '';

  const tituloDoc = escapeHtmlRelatorio(tituloPrincipal);
  const numeroHtml = numeroDoc
    ? `<div class="rf-numero-doc">Nº ${escapeHtmlRelatorio(numeroDoc)}</div>`
    : '<div class="rf-numero-doc rf-numero-doc--pendente">Nº (definido ao salvar)</div>';

  const capaLogoHtml = logoCol
    ? `<div class="rf-capa-col rf-capa-col--logo">${logoCol}</div>`
    : '<div class="rf-capa-col rf-capa-col--logo" aria-hidden="true"></div>';

  const capaLinhaInterna = `
        <div class="rf-capa-linha">
          ${capaLogoHtml}
          <div class="rf-capa-col rf-capa-col--titulo">
            <h1 class="rf-titulo-principal">${tituloDoc}</h1>
          </div>
          <div class="rf-capa-col rf-capa-col--num">${numeroHtml}</div>
        </div>`;

  const capaQuadroRepeatHtml = `<div class="rf-quadro rf-quadro--capa rf-quadro--capa--repeat">${capaLinhaInterna}</div>`;

  /** Em cima: obra (Config.). Em baixo: NF do recebimento — fornecedor só uma vez (linha única). */
  const blocoObra = `
    <div class="rf-linhas-compactas">
      <div class="rf-grid-obra-3">
        ${linhaCampoOuTraco('Cliente', clienteImpressao)}
        ${linhaCampoOuTraco('Projeto', projetoImpressao)}
        ${linhaCampoOuTraco('Local', localImpressao)}
      </div>
    </div>`;

  const blocoRecebimento = `
    <div class="rf-linhas-compactas">
      <div class="rf-grid-receb-nf-rom">
        ${linhaCampoOuTraco('Nota fiscal', p.notaFiscal)}
        ${linhaCampoOuTraco('Romaneio', p.romaneio)}
      </div>
      ${linhaCampoOuTraco('Fornecedor', p.fornecedor)}
    </div>`;

  const secExtra = [
    linhaCampo('RIR (referência)', p.rirCodigo),
    p.observacoes.trim()
      ? `<div class="rf-campo-linha rf-campo-linha--bloco"><span class="rf-campo-rot">Observações</span><span class="rf-campo-val">${escapeHtmlRelatorio(p.observacoes).replace(/\n/g, '<br>')}</span></div>`
      : '',
  ]
    .filter(Boolean)
    .join('');

  const blocoExtra =
    secExtra.trim() !== ''
      ? `<div class="rf-secao-extra">${secExtra}</div>`
      : '';

  const cabecalhoCampos = `
    <div class="rf-dados-stack">
      ${blocoObra}
      <div class="rf-dados-separador" role="presentation"></div>
      ${blocoRecebimento}
    </div>
    ${blocoExtra}`;

  const dadosInteriorHtml =
    cabecalhoCampos.trim() ||
    '<p class="rf-campo-val" style="margin:0;font-size:9pt;color:#64748b;">(Preencha os dados do recebimento antes de imprimir.)</p>';

  const dadosQuadroRepeatHtml = `<div class="rf-quadro rf-quadro--dados rf-quadro--dados--repeat">${dadosInteriorHtml}</div>`;

  const topbarGeradoHtml = `<div class="inst-topbar inst-topbar--repeat"><span>Gerado em: ${escapeHtmlRelatorio(geradoEm)}</span></div>`;

  const cabecalhoPaginaRepetidoHtml = `${topbarGeradoHtml}${capaQuadroRepeatHtml}${dadosQuadroRepeatHtml}`;

  const grupos = chunk(p.fotos, FOTOS_POR_PAGINA);
  const blocosPaginas = grupos
    .map((grupo, pagIdx) => {
      const celulas = grupo
        .map((f, i) => celulaFoto(f, pagIdx * FOTOS_POR_PAGINA + i))
        .join('');
      const gridClass = grupo.length === FOTOS_POR_PAGINA ? 'rf-grid4' : 'rf-grid4 rf-grid4--parcial';
      const repetirCabecalho = pagIdx > 0 ? cabecalhoPaginaRepetidoHtml : '';
      return `
  <section class="rf-pagina-fotos" aria-label="Página ${pagIdx + 1} de fotos">
    ${repetirCabecalho}
    <div class="${gridClass}">${celulas}</div>
  </section>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${tituloDoc} — I.S.O PRO</title>
  <style>
    ${cssInstitucionalRelatorio()}
    .rf-doc { max-width: 210mm; margin: 0 auto; }
    .rf-doc .inst-topbar {
      justify-content: flex-start;
      margin-bottom: 6px;
      font-size: 8.5pt;
    }
    .rf-doc .inst-topbar span:last-child { font-weight: 400; color: #444; }
    .inst-topbar--repeat {
      margin-bottom: 6px;
      page-break-after: avoid;
    }
    .rf-quadro {
      border: 1px solid #334155;
      border-radius: 5px;
      padding: 8px 10px;
      margin-bottom: 8px;
      background: #fafbfc;
      page-break-inside: avoid;
      page-break-after: avoid;
      box-shadow: 0 1px 0 rgba(15, 23, 42, 0.05);
    }
    /* Logo | título (só este centralizado) | número */
    .rf-capa-linha {
      display: grid;
      grid-template-columns: minmax(100px, 1fr) minmax(0, 2.4fr) minmax(100px, 1fr);
      align-items: center;
      gap: 8px 10px;
      min-height: 52px;
    }
    .rf-capa-col--logo {
      justify-self: start;
      display: flex;
      align-items: center;
    }
    .rf-capa-col--logo .inst-logo-col {
      flex: 0 0 auto;
      min-height: 48px;
    }
    .rf-capa-col--titulo {
      text-align: center;
      justify-self: stretch;
      min-width: 0;
    }
    h1.rf-titulo-principal {
      border: none;
      padding: 0;
      margin: 0;
      font-size: 1.2rem;
      font-weight: 800;
      color: #0f172a;
      line-height: 1.15;
      letter-spacing: -0.02em;
    }
    .rf-capa-col--num {
      justify-self: end;
      text-align: right;
      align-self: center;
    }
    .rf-numero-doc {
      margin: 0;
      font-size: 9.5pt;
      font-weight: 600;
      color: #475569;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.03em;
      line-height: 1.2;
      white-space: nowrap;
    }
    .rf-numero-doc--pendente { color: #94a3b8; font-weight: 500; font-size: 8.5pt; white-space: normal; max-width: 120px; }
    .rf-quadro--capa--repeat {
      margin-bottom: 6px;
      padding-top: 6px;
      padding-bottom: 6px;
    }
    .rf-quadro--capa--repeat .rf-capa-linha {
      min-height: 46px;
    }
    .rf-quadro--dados--repeat {
      margin-bottom: 8px;
      page-break-inside: avoid;
    }
    .rf-quadro--dados {
      font-size: 8.5pt;
      padding: 8px 10px;
    }
    .rf-dados-stack { display: block; }
    .rf-dados-separador {
      height: 0;
      margin: 6px 0;
      border: 0;
      border-top: 1px solid #e2e8f0;
    }
    .rf-linhas-compactas .rf-campo-linha {
      margin-bottom: 2px;
    }
    .rf-grid-obra-3 {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 2px 10px;
      align-items: start;
    }
    .rf-grid-obra-3 .rf-campo-linha {
      grid-template-columns: minmax(52px, 0.35fr) 1fr;
      margin-bottom: 2px;
    }
    .rf-grid-receb-nf-rom {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2px 10px;
      margin-bottom: 2px;
    }
    .rf-grid-receb-nf-rom .rf-campo-linha {
      grid-template-columns: minmax(64px, 0.4fr) 1fr;
      margin-bottom: 2px;
    }
    .rf-campo-linha {
      display: grid;
      grid-template-columns: 76px 1fr;
      gap: 4px 6px;
      margin-bottom: 2px;
      align-items: baseline;
    }
    .rf-campo-linha--bloco {
      grid-template-columns: 1fr;
      margin-top: 4px;
    }
    .rf-campo-rot {
      font-weight: 700;
      color: #475569;
      font-size: 8pt;
    }
    .rf-campo-val {
      color: #0f172a;
      word-break: break-word;
      font-size: 8.5pt;
      line-height: 1.25;
    }
    .rf-secao-extra {
      margin-top: 8px;
      padding-top: 6px;
      border-top: 1px solid #e2e8f0;
    }
    .rf-secao-extra .rf-campo-linha {
      grid-template-columns: 100px 1fr;
    }
    .rf-pagina-fotos {
      page-break-inside: avoid;
      width: 100%;
    }
    .rf-pagina-fotos + .rf-pagina-fotos {
      page-break-before: always;
    }
    .rf-grid4 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-auto-rows: 86mm;
      gap: 6px;
      width: 100%;
      align-items: stretch;
    }
    .rf-grid4--parcial {
      align-content: start;
    }
    /* Três faixas: rótulo | área de imagem (sempre igual na mesma linha) | legenda */
    .rf-celula {
      border: 1px solid #cbd5e1;
      border-radius: 3px;
      padding: 4px;
      background: #fff;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      align-items: stretch;
      min-height: 0;
      min-width: 0;
      height: 100%;
      max-height: 86mm;
      page-break-inside: avoid;
    }
    .rf-foto-num {
      font-size: 7.5pt;
      font-weight: 700;
      color: #475569;
      width: 100%;
      margin-bottom: 2px;
      line-height: 1.1;
    }
    .rf-foto-wrap {
      min-height: 0;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f1f5f9;
      border-radius: 2px;
      overflow: hidden;
    }
    .rf-foto-img {
      width: 100%;
      height: 100%;
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      object-position: center;
      display: block;
    }
    .rf-foto-legenda {
      margin: 4px 0 0;
      font-size: 8pt;
      width: 100%;
      text-align: center;
      white-space: pre-wrap;
      color: #0f172a;
      line-height: 1.2;
      max-height: 14mm;
      overflow: hidden;
    }
    .rf-empty {
      padding: 16px;
      text-align: center;
      color: #64748b;
      border: 1px dashed #94a3b8;
      border-radius: 6px;
      font-size: 9pt;
    }
    ${cssBarraPreVisualizacaoImpressaoHtml()}
    @media print {
      body { padding: 7mm 9mm; }
      .rf-quadro { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-shadow: none; }
      .rf-foto-wrap { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    @media screen and (max-width: 560px) {
      .rf-capa-linha {
        grid-template-columns: 1fr;
        text-align: center;
      }
      .rf-capa-col--logo { justify-self: center; }
      .rf-capa-col--num { justify-self: center; text-align: center; }
      .rf-grid-obra-3 { grid-template-columns: 1fr; }
      .rf-grid-receb-nf-rom { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  ${htmlBarraPreVisualizacaoImpressao()}
  <div class="rf-doc">
    <div class="inst-topbar">
      <span>Gerado em: ${escapeHtmlRelatorio(geradoEm)}</span>
    </div>

    <header class="rf-cabecalho-doc" aria-label="Cabeçalho do relatório">
      <div class="rf-quadro rf-quadro--capa">${capaLinhaInterna}</div>
      <div class="rf-quadro rf-quadro--dados">${dadosInteriorHtml}</div>
    </header>

    ${
      p.fotos.length === 0
        ? '<div class="rf-empty">Nenhuma foto neste relatório.</div>'
        : blocosPaginas
    }

    <p style="margin-top:10px;font-size:8pt;color:#64748b;">Documento gerado eletronicamente pelo I.S.O PRO Desktop${segRodapeInst}. Layout: 4 fotos por página quando possível.</p>
  </div>
  ${scriptBarraPreVisualizacaoImpressao()}
</body>
</html>`;
}

export function imprimirRelatorioFotograficoHtml(html: string): boolean {
  return abrirImpressaoHtmlRelatorio(html);
}
