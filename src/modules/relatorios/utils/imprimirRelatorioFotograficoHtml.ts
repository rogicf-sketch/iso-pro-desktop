import { imprimirRelatorioProfissional } from '../../../lib/relatorioProfissional';
import {
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
import type {
  RelatorioFotograficoAssinatura,
  RelatorioFotograficoFoto,
  RelatorioFotograficoPayload,
} from '../types/relatorioFotografico.types';

const FOTOS_POR_PAGINA = 4;
const TITULO_PADRAO = 'Relatório Fotográfico de Recebimento de Materiais';

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

/** Primeira linha = título curto; restante = detalhe (quebra longa). */
function partirLegenda(legenda: string): { titulo: string; detalhe: string } {
  const raw = legenda.replace(/\r\n/g, '\n').trim();
  if (!raw) return { titulo: '', detalhe: '' };
  const nl = raw.indexOf('\n');
  if (nl < 0) {
    if (raw.length <= 90) return { titulo: raw, detalhe: '' };
    return { titulo: raw.slice(0, 90).trim(), detalhe: raw };
  }
  return {
    titulo: raw.slice(0, nl).trim(),
    detalhe: raw.slice(nl + 1).trim(),
  };
}

function formatFotoNum(n: number): string {
  return String(n).padStart(2, '0');
}

function celulaFoto(f: RelatorioFotograficoFoto, indiceGlobal: number): string {
  const num = formatFotoNum(indiceGlobal + 1);
  const { titulo, detalhe } = partirLegenda(f.legenda);
  const etiqueta = f.etiqueta.trim();
  const mostrarTexto = f.mostrarLegendaImpressao;
  const tituloNorm = titulo.trim();
  const etiquetaNorm = etiqueta.trim();
  // Evita "Foto 01 — BOBINA 01" + badge BOBINA 01 (duplicado).
  const tituloIgualEtiqueta =
    tituloNorm.length > 0 &&
    etiquetaNorm.length > 0 &&
    tituloNorm.toLowerCase() === etiquetaNorm.toLowerCase();

  let tituloLinha = `Foto ${num}`;
  if (mostrarTexto && tituloNorm && !tituloIgualEtiqueta) {
    tituloLinha = `Foto ${num} — ${escapeHtmlRelatorio(tituloNorm)}`;
  }

  const badge = etiquetaNorm
    ? `<span class="rf-foto-tag">${escapeHtmlRelatorio(etiquetaNorm)}</span>`
    : '';

  let detalheHtml = '';
  if (mostrarTexto) {
    if (detalhe) {
      detalheHtml = `<p class="rf-foto-detalhe">${escapeHtmlRelatorio(detalhe).replace(/\n/g, '<br>')}</p>`;
    } else if (tituloNorm && !tituloIgualEtiqueta && !etiquetaNorm) {
      // só título curto já está na linha; sem detalhe extra
      detalheHtml = '';
    }
  }

  return `
    <div class="rf-celula">
      <div class="rf-foto-wrap">
        <img class="rf-foto-img" src="${escapeHtmlRelatorio(f.dataUrl ?? '')}" alt="" />
      </div>
      <div class="rf-foto-meta">
        <div class="rf-foto-meta-top">
          <div class="rf-foto-titulo">${tituloLinha}</div>
          ${badge}
        </div>
        ${detalheHtml}
      </div>
    </div>`;
}

function htmlBlocoAssinatura(
  papel: string,
  a: RelatorioFotograficoAssinatura,
): string {
  const nome = a.nome.trim();
  const data = a.data.trim();
  const visto = nome
    ? `<div class="rf-ass-visto">Visto digital</div>
       <div class="rf-ass-nome">${escapeHtmlRelatorio(nome)}</div>
       <div class="rf-ass-data">${escapeHtmlRelatorio(data || '—')}</div>`
    : `<div class="rf-ass-pendente">Pendente</div>
       <div class="rf-ass-linha" aria-hidden="true"></div>
       <div class="rf-ass-data">Nome / data</div>`;
  return `
    <div class="rf-ass-box">
      <div class="rf-ass-papel">${escapeHtmlRelatorio(papel)}</div>
      ${visto}
    </div>`;
}

function htmlAssinaturasCompactas(p: RelatorioFotograficoPayload): string {
  if (!p.incluirAssinaturasImpressao) return '';
  return `
  <div class="rf-assinaturas-inline" aria-label="Assinaturas">
    <div class="rf-assin-h2">Assinaturas / visto digital</div>
    <div class="rf-ass-grid">
      ${htmlBlocoAssinatura('Recebimento / Almoxarifado', p.assinaturaRecebimento)}
      ${htmlBlocoAssinatura('Inspetor de Qualidade', p.assinaturaQualidade)}
      ${htmlBlocoAssinatura('Fiscalização / Cliente', p.assinaturaFiscalizacao)}
    </div>
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
  const tituloPrincipal = p.titulo.trim() || TITULO_PADRAO;
  const numeroDoc = p.numeroRelatorio.trim();
  const totalFotos = p.fotos.length;
  const comAssinaturas = p.incluirAssinaturasImpressao;
  const totalPaginasFotos = Math.max(1, Math.ceil(Math.max(totalFotos, 1) / FOTOS_POR_PAGINA));
  // Assinaturas vão na última página de fotos (sem página em branco).
  const totalPaginasDoc = totalFotos === 0 ? 1 : totalPaginasFotos;

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
            <p class="rf-kicker">Evidência fotográfica · Recebimento</p>
            <h1 class="rf-titulo-principal">${tituloDoc}</h1>
          </div>
          <div class="rf-capa-col rf-capa-col--num">${numeroHtml}</div>
        </div>`;

  const capaQuadroRepeatHtml = `<div class="rf-quadro rf-quadro--capa rf-quadro--capa--repeat">${capaLinhaInterna}</div>`;

  const blocoObraLinhas = [
    linhaCampo('Cliente', clienteImpressao),
    linhaCampo('Projeto', projetoImpressao),
    linhaCampo('Local', localImpressao),
  ].filter(Boolean);
  const blocoObra =
    blocoObraLinhas.length > 0
      ? `<div class="rf-linhas-compactas"><div class="rf-grid-obra-3">${blocoObraLinhas.join('')}</div></div>`
      : '';

  const blocoRecebimento = `
    <div class="rf-linhas-compactas">
      <div class="rf-grid-receb-nf-rom">
        ${linhaCampoOuTraco('Nota fiscal', p.notaFiscal)}
        ${linhaCampo('Romaneio', p.romaneio)}
      </div>
      ${linhaCampoOuTraco('Fornecedor', p.fornecedor)}
      ${linhaCampo('Fotos neste relatório', totalFotos > 0 ? String(totalFotos) : '')}
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

  const temObra = blocoObra.trim() !== '';
  const cabecalhoCampos = `
    <div class="rf-dados-stack">
      ${blocoObra}
      ${temObra ? '<div class="rf-dados-separador" role="presentation"></div>' : ''}
      ${blocoRecebimento}
    </div>
    ${blocoExtra}`;

  const dadosInteriorHtml =
    cabecalhoCampos.trim() ||
    '<p class="rf-campo-val" style="margin:0;font-size:9pt;color:#64748b;">(Preencha os dados do recebimento antes de imprimir.)</p>';

  const dadosQuadroRepeatHtml = `<div class="rf-quadro rf-quadro--dados rf-quadro--dados--repeat">${dadosInteriorHtml}</div>`;

  const topbarGeradoHtml = `<div class="inst-topbar inst-topbar--repeat"><span>Gerado em: ${escapeHtmlRelatorio(geradoEm)}</span><span class="rf-topbar-meta">${escapeHtmlRelatorio(numeroDoc || 'RF')}</span></div>`;

  const cabecalhoPaginaRepetidoHtml = `${topbarGeradoHtml}${capaQuadroRepeatHtml}${dadosQuadroRepeatHtml}`;

  const grupos = chunk(p.fotos, FOTOS_POR_PAGINA);
  const assinaturasHtml = htmlAssinaturasCompactas(p);
  const blocosPaginas = grupos
    .map((grupo, pagIdx) => {
      const celulas = grupo
        .map((f, i) => celulaFoto(f, pagIdx * FOTOS_POR_PAGINA + i))
        .join('');
      const isLast = pagIdx === grupos.length - 1;
      const comAssinNestaPagina = isLast && comAssinaturas;
      const gridClass = [
        'rf-grid4',
        grupo.length < FOTOS_POR_PAGINA ? 'rf-grid4--parcial' : '',
        comAssinNestaPagina ? 'rf-grid4--com-assin' : '',
      ]
        .filter(Boolean)
        .join(' ');
      const repetirCabecalho = pagIdx > 0 ? cabecalhoPaginaRepetidoHtml : '';
      const pageNo = pagIdx + 1;
      return `
  <section class="rf-pagina-fotos${comAssinNestaPagina ? ' rf-pagina-fotos--com-assin' : ''}" aria-label="Página ${pageNo}">
    ${repetirCabecalho}
    <div class="${gridClass}">${celulas}</div>
    ${comAssinNestaPagina ? assinaturasHtml : ''}
    <div class="rf-page-foot">Página ${pageNo} de ${totalPaginasDoc} · ${escapeHtmlRelatorio(numeroDoc || 'RF')}</div>
  </section>`;
    })
    .join('');

  const paginaSoAssinaturas =
    p.fotos.length === 0 && comAssinaturas
      ? `
  <section class="rf-pagina-fotos rf-pagina-fotos--com-assin" aria-label="Assinaturas">
    ${assinaturasHtml}
    <div class="rf-page-foot">Página 1 de 1 · ${escapeHtmlRelatorio(numeroDoc || 'RF')}</div>
  </section>`
      : '';

  const rodapeInst = `Documento gerado eletronicamente pelo I.S.O PRO Desktop${segRodapeInst}.`;

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
      justify-content: space-between;
      margin-bottom: 6px;
      font-size: 8.5pt;
      gap: 12px;
    }
    .rf-topbar-meta { font-variant-numeric: tabular-nums; color: #64748b; }
    .inst-topbar--repeat {
      margin-bottom: 6px;
      page-break-after: avoid;
    }
    .rf-quadro {
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 8px 10px;
      margin-bottom: 8px;
      background: #fafbfc;
      page-break-inside: avoid;
      page-break-after: avoid;
    }
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
    .rf-kicker {
      margin: 0 0 4px;
      font-size: 7.5pt;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #64748b;
    }
    h1.rf-titulo-principal {
      border: none;
      padding: 0;
      margin: 0;
      font-size: 1.15rem;
      font-weight: 800;
      color: #0f172a;
      line-height: 1.2;
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
    .rf-quadro--capa--repeat .rf-capa-linha { min-height: 46px; }
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
    .rf-linhas-compactas .rf-campo-linha { margin-bottom: 2px; }
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
      overflow-wrap: anywhere;
      font-size: 8.5pt;
      line-height: 1.3;
    }
    .rf-secao-extra {
      margin-top: 8px;
      padding-top: 6px;
      border-top: 1px solid #e2e8f0;
    }
    .rf-secao-extra .rf-campo-linha { grid-template-columns: 100px 1fr; }
    .rf-pagina-fotos {
      width: 100%;
    }
    .rf-pagina-fotos + .rf-pagina-fotos {
      page-break-before: always;
    }
    .rf-grid4 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-auto-rows: minmax(72mm, 80mm);
      gap: 7px;
      width: 100%;
      align-items: stretch;
    }
    .rf-grid4--com-assin {
      grid-auto-rows: minmax(58mm, 64mm);
      gap: 6px;
    }
    .rf-grid4--parcial { align-content: start; }
    .rf-celula {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 5px;
      background: #fff;
      display: grid;
      grid-template-rows: minmax(0, 1fr) auto;
      align-items: stretch;
      min-height: 0;
      min-width: 0;
      height: 100%;
      page-break-inside: avoid;
    }
    .rf-foto-wrap {
      min-height: 0;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f1f5f9;
      border-radius: 4px;
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
    .rf-foto-meta {
      margin-top: 4px;
      min-width: 0;
    }
    .rf-foto-meta-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
    }
    .rf-foto-titulo {
      font-size: 8pt;
      font-weight: 700;
      color: #0f172a;
      line-height: 1.25;
      overflow-wrap: anywhere;
      word-break: break-word;
      min-width: 0;
      flex: 1;
    }
    .rf-foto-tag {
      flex-shrink: 0;
      font-size: 7pt;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #1e3a5f;
      background: #e8eef5;
      border: 1px solid #c5d4e8;
      border-radius: 4px;
      padding: 2px 6px;
      max-width: 42%;
      overflow-wrap: anywhere;
    }
    .rf-foto-detalhe {
      margin: 3px 0 0;
      font-size: 7.5pt;
      text-align: left;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      word-break: break-word;
      color: #475569;
      line-height: 1.3;
      max-height: 12mm;
      overflow: hidden;
    }
    .rf-page-foot {
      margin-top: 6px;
      font-size: 7.5pt;
      color: #64748b;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .rf-assinaturas-inline {
      margin-top: 8px;
      padding: 8px 10px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #fff;
      page-break-inside: avoid;
    }
    .rf-assin-h2 {
      margin: 0 0 8px;
      font-size: 9pt;
      font-weight: 800;
      color: #1e3a5f;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border: none;
      padding: 0;
    }
    .rf-ass-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
    }
    .rf-ass-box {
      border: 1px dashed #94a3b8;
      border-radius: 6px;
      padding: 8px;
      min-height: 62px;
      background: #f8fafc;
    }
    .rf-ass-papel {
      font-size: 7pt;
      font-weight: 800;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #475569;
      margin-bottom: 6px;
    }
    .rf-ass-visto {
      font-size: 7.5pt;
      font-weight: 700;
      color: #1e3a5f;
      margin-bottom: 2px;
    }
    .rf-ass-pendente {
      font-size: 7.5pt;
      font-weight: 700;
      color: #b54708;
      margin-bottom: 4px;
    }
    .rf-ass-nome {
      font-size: 10pt;
      font-weight: 600;
      color: #0f172a;
      font-family: "Segoe Script", "Brush Script MT", cursive, "Segoe UI", sans-serif;
      line-height: 1.2;
      overflow-wrap: anywhere;
    }
    .rf-ass-linha {
      margin: 10px 0 4px;
      border-bottom: 1px solid #94a3b8;
      height: 14px;
    }
    .rf-ass-data {
      margin-top: 4px;
      font-size: 7.5pt;
      color: #64748b;
      font-variant-numeric: tabular-nums;
    }
    .rf-empty {
      padding: 16px;
      text-align: center;
      color: #64748b;
      border: 1px dashed #94a3b8;
      border-radius: 6px;
      font-size: 9pt;
    }
    .rf-rodape-doc {
      margin-top: 8px;
      font-size: 7.5pt;
      color: #64748b;
    }
    ${cssBarraPreVisualizacaoImpressaoHtml()}
    @media print {
      body { padding: 7mm 9mm; }
      .rf-quadro, .rf-foto-wrap, .rf-foto-tag, .rf-ass-box {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
    @media screen and (max-width: 560px) {
      .rf-capa-linha { grid-template-columns: 1fr; text-align: center; }
      .rf-capa-col--logo, .rf-capa-col--num { justify-self: center; text-align: center; }
      .rf-grid-obra-3, .rf-grid-receb-nf-rom, .rf-ass-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body class="rf-print-body">
  ${htmlBarraPreVisualizacaoImpressao()}
  <div class="rf-doc">
    <div class="inst-topbar">
      <span>Gerado em: ${escapeHtmlRelatorio(geradoEm)}</span>
      <span class="rf-topbar-meta">${escapeHtmlRelatorio(numeroDoc || 'RF')} · ${totalFotos} foto(s)</span>
    </div>

    <header class="rf-cabecalho-doc" aria-label="Cabeçalho do relatório">
      <div class="rf-quadro rf-quadro--capa">${capaLinhaInterna}</div>
      <div class="rf-quadro rf-quadro--dados">${dadosInteriorHtml}</div>
    </header>

    ${
      p.fotos.length === 0
        ? `${paginaSoAssinaturas || '<div class="rf-empty">Nenhuma foto neste relatório.</div>'}`
        : blocosPaginas
    }

    <p class="rf-rodape-doc">${rodapeInst} Até 4 fotos por página${comAssinaturas ? ' · assinaturas na última página' : ''}.</p>
  </div>
  ${scriptBarraPreVisualizacaoImpressao()}
</body>
</html>`;
}

export async function imprimirRelatorioFotograficoHtml(html: string, fileName = 'relatorio-fotografico.pdf'): Promise<boolean> {
  return imprimirRelatorioProfissional({ html, fileName, tipoNuvem: 'relatorio_fotografico' });
}
