import { imprimirRelatorioProfissional } from '../../../lib/relatorioProfissional';
import {
  cssBarraPreVisualizacaoImpressaoHtml,
  cssFontesNotoRelatorioInline,
  escapeHtmlRelatorio,
  htmlBarraPreVisualizacaoImpressao,
  scriptBarraPreVisualizacaoImpressao,
} from '../../../lib/htmlRelatorioInstitucional';
import {
  cssLogoInstitucionalImpressaoDaConfig,
  resolverUrlLogoInstitucionalParaHtmlImpresso,
} from '../../../lib/logoInstitucional';
import {
  cssRodapeInstitucionalControle,
  dataUrlQrDocumentoControle,
  htmlRodapeInstitucionalControle,
} from '../../../lib/relatorioDocControle';
import { readConfiguracoes } from '../../configuracoes/services/configuracoes.service';
import type {
  RelatorioFotograficoAssinatura,
  RelatorioFotograficoFoto,
  RelatorioFotograficoPayload,
} from '../types/relatorioFotografico.types';

const DOC_VERSION = '8';
const FOTOS_POR_PAGINA = 4;
const TITULO_PADRAO = 'Relatório fotográfico';

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

function montarLogoBlockRf(incluirLogo: boolean, logoUrl: string): string {
  const badge = `<div class="rf-logo-badge"><span class="rf-logo-iso">I · S · O <span class="rf-logo-sep">|</span> <span class="rf-logo-pro">PRO</span></span><small class="rf-logo-sub">GESTÃO DE MATERIAIS</small></div>`;
  if (!incluirLogo) return '';
  if (logoUrl) {
    return `<div class="rf-logo-badge rf-logo-badge--img"><img class="rf-logo-img" src="${escapeHtmlRelatorio(logoUrl)}" alt="Logo" decoding="async" /></div>`;
  }
  return badge;
}

/** data:/https: escapados; nome de ficheiro relativo (EXE) sem alterar. */
function srcImagemRelatorioFotografico(raw: string | undefined): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (/^[a-zA-Z0-9._-]+$/.test(s)) return s;
  return escapeHtmlRelatorio(s);
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
    }
  }

  return `
    <figure class="rf-celula">
      <div class="rf-foto-frame">
        <img class="rf-foto-img" src="${srcImagemRelatorioFotografico(f.dataUrl)}" alt="${escapeHtmlRelatorio(tituloLinha)}" decoding="async" />
      </div>
      <figcaption class="rf-foto-meta">
        <div class="rf-foto-meta-top">
          <div class="rf-foto-titulo">${tituloLinha}</div>
          ${badge}
        </div>
        ${detalheHtml}
      </figcaption>
    </figure>`;
}

function formatDateAssinaturaPt(raw: string): string {
  const t = raw.trim();
  if (!t) return '—';
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
    const d = new Date(`${t.slice(0, 10)}T12:00:00`);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('pt-BR');
  }
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('pt-BR');
  return t;
}

/** Mesmo padrão visual do RIR: espaço + linha + função + nome + data (sem «visto digital»). */
function htmlBlocoAssinatura(
  papel: string,
  a: RelatorioFotograficoAssinatura,
): string {
  const nome = a.nome.trim();
  const dataFmt = a.data.trim() ? formatDateAssinaturaPt(a.data) : '—';
  return `
    <div class="rf-sign-card">
      <div class="rf-sign-space"></div>
      <div class="rf-sign-line"></div>
      <div class="rf-sign-role">${escapeHtmlRelatorio(papel)}</div>
      <div class="rf-sign-name">${escapeHtmlRelatorio(nome || '—')}</div>
      <div class="rf-sign-date">${escapeHtmlRelatorio(dataFmt)}</div>
    </div>`;
}

function htmlAssinaturasCompactas(p: RelatorioFotograficoPayload): string {
  if (!p.incluirAssinaturasImpressao) return '';
  return `
  <div class="rf-signatures" aria-label="Assinaturas">
    ${htmlBlocoAssinatura('Responsável — recebimento', p.assinaturaRecebimento)}
    ${htmlBlocoAssinatura('Controle de qualidade', p.assinaturaQualidade)}
    ${htmlBlocoAssinatura('Cliente', p.assinaturaFiscalizacao)}
  </div>`;
}

function cssEstilosRelatorioFotografico(): string {
  return `
${cssLogoInstitucionalImpressaoDaConfig()}
${cssRodapeInstitucionalControle()}
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@page { size: A4; margin: 10mm 11mm 12mm 11mm; }
body.rf-print-body {
  margin: 0 !important;
  padding: 0 !important;
  width: 100%;
  /* Noto Sans embute limpo no PDF (Segoe UI no Chromium corrompe I/l/hífen). */
  font-family: 'Noto Sans', Arial, Helvetica, sans-serif;
  color: #1c1917;
  font-size: 10pt;
  line-height: 1.4;
  font-synthesis: none;
  text-rendering: geometricPrecision;
  -webkit-font-smoothing: auto;
  hyphens: none;
}
.rf-doc {
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 0;
  position: relative;
}
.rf-doc::before {
  content: '';
  display: block;
  height: 3px;
  margin: 0 0 10px;
  border-radius: 2px;
  background: linear-gradient(90deg, #047857 0%, #86efac 42%, #1c1917 100%);
}
.rf-doc * { box-sizing: border-box; }
.rf-topbar {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 7.5pt;
  color: #a8a29e;
  font-variant-numeric: tabular-nums;
}
.rf-topbar-meta { color: #78716c; }
.rf-hdr {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding-bottom: 10px;
  margin-bottom: 10px;
  border-bottom: 1px solid #d6d3d1;
}
.rf-hdr-logo { flex: 0 0 auto; max-width: 150px; }
.rf-logo-badge {
  display: inline-block;
  background: linear-gradient(135deg, #1c1917 0%, #292524 100%);
  border-radius: 3px;
  padding: 7px 11px 6px;
  line-height: 1.1;
  box-shadow: 0 1px 0 rgba(255,255,255,0.08) inset;
}
.rf-logo-badge--img { background: transparent; padding: 0; box-shadow: none; }
.rf-logo-iso { color: #fff; font-weight: 700; font-size: 10pt; letter-spacing: 0.08em; white-space: nowrap; }
.rf-logo-pro { color: #86efac; }
.rf-logo-sep { color: #a8a29e; margin: 0 2px; font-weight: 600; }
.rf-logo-sub { display: block; color: #86efac; font-size: 6.5pt; font-weight: 700; margin-top: 3px; letter-spacing: 0.06em; }
.rf-logo-img { display: block; width: auto; height: auto; max-width: var(--iso-logo-slot-w, 178px); max-height: var(--iso-logo-slot-h, 68px); object-fit: contain; }
.rf-hdr-title { flex: 1 1 auto; text-align: center; min-width: 0; }
.rf-hdr-eyebrow {
  margin: 0 0 5px;
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #047857;
}
.rf-hdr-title h1 {
  margin: 0;
  font-size: 13pt;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: #1c1917;
  line-height: 1.2;
}
.rf-hdr-sub {
  margin: 5px 0 0;
  font-size: 7.5pt;
  font-weight: 400;
  color: #78716c;
}
.rf-hdr-meta {
  flex: 0 0 auto;
  text-align: right;
  min-width: 118px;
}
.rf-hdr-code {
  font-weight: 700;
  font-size: 11pt;
  color: #1c1917;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
}
.rf-hdr-code--pendente {
  font-weight: 400;
  font-size: 8pt;
  color: #a8a29e;
  max-width: 120px;
  white-space: normal;
}
.rf-hdr-date { font-size: 7.5pt; color: #78716c; margin-top: 4px; line-height: 1.35; }
.rf-dados-wrap {
  margin: 0 0 12px;
  padding: 10px 12px;
  background: #fafaf9;
  border: 1px solid #e7e5e4;
  border-radius: 4px;
  page-break-inside: avoid;
  page-break-after: avoid;
}
.rf-dados-label {
  display: block;
  margin: 0 0 6px;
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #a8a29e;
}
.rf-dados-stack { display: block; }
.rf-dados-separador {
  height: 0;
  margin: 7px 0;
  border: 0;
  border-top: 1px solid #e7e5e4;
}
.rf-linhas-compactas .rf-campo-linha { margin-bottom: 3px; }
.rf-grid-obra-3 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 2px 10px;
  align-items: start;
}
.rf-grid-obra-3 .rf-campo-linha {
  grid-template-columns: minmax(52px, 0.35fr) 1fr;
}
.rf-grid-receb-nf-rom {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px 10px;
  margin-bottom: 2px;
}
.rf-grid-receb-nf-rom .rf-campo-linha {
  grid-template-columns: minmax(64px, 0.4fr) 1fr;
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
  color: #78716c;
  font-size: 7.5pt;
}
.rf-campo-val {
  color: #1c1917;
  word-break: normal;
  overflow-wrap: break-word;
  hyphens: none;
  font-size: 9pt;
  line-height: 1.35;
  font-weight: 400;
}
.rf-secao-extra {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px solid #e7e5e4;
}
.rf-secao-extra .rf-campo-linha { grid-template-columns: 100px 1fr; }
.rf-pagina-fotos { width: 100%; }
.rf-pagina-fotos + .rf-pagina-fotos { page-break-before: always; }
.rf-grid4 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-auto-rows: minmax(72mm, 80mm);
  gap: 8px;
  width: 100%;
  align-items: stretch;
}
.rf-grid4--com-assin {
  grid-auto-rows: minmax(56mm, 62mm);
  gap: 6px;
}
.rf-grid4--parcial { align-content: start; }
.rf-celula {
  margin: 0;
  border: 1px solid #d6d3d1;
  border-radius: 0;
  padding: 4px;
  background: #fff;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  align-items: stretch;
  min-height: 0;
  min-width: 0;
  height: 100%;
  page-break-inside: avoid;
}
.rf-foto-frame {
  min-height: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fafaf9;
  border-radius: 0;
  overflow: hidden;
  border: 1px solid #e7e5e4;
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
  margin-top: 5px;
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
  color: #1c1917;
  line-height: 1.25;
  overflow-wrap: break-word;
  word-break: normal;
  hyphens: none;
  min-width: 0;
  flex: 1;
}
.rf-foto-tag {
  flex-shrink: 0;
  font-size: 6.5pt;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #047857;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 999px;
  padding: 2px 7px;
  max-width: 42%;
  overflow-wrap: anywhere;
}
.rf-foto-detalhe {
  margin: 3px 0 0;
  font-size: 7.5pt;
  text-align: left;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: normal;
  hyphens: none;
  color: #78716c;
  line-height: 1.3;
  max-height: 12mm;
  overflow: hidden;
}
.rf-page-foot {
  margin-top: 8px;
  font-size: 7pt;
  color: #a8a29e;
  text-align: right;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}
.rf-signatures {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid #d6d3d1;
  page-break-inside: avoid;
  break-inside: avoid;
}
.rf-sign-card { text-align: center; padding: 0 6px; }
.rf-sign-space { min-height: 28px; }
.rf-sign-line { width: 85%; border-top: 1.5px solid #1c1917; margin: 0 auto 8px; }
.rf-sign-role {
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #44403c;
  margin-bottom: 4px;
}
.rf-sign-name {
  font-weight: 700;
  font-size: 10pt;
  color: #1c1917;
  margin-bottom: 3px;
  overflow-wrap: break-word;
  word-break: normal;
  hyphens: none;
}
.rf-sign-date { font-size: 7.5pt; color: #78716c; font-variant-numeric: tabular-nums; }
.rf-empty {
  padding: 16px;
  text-align: center;
  color: #78716c;
  border: 1px dashed #d6d3d1;
  border-radius: 4px;
  font-size: 9pt;
}
.rf-hdr--repeat { margin-bottom: 8px; padding-bottom: 8px; }
.rf-dados-wrap--repeat { margin-bottom: 10px; padding: 8px 10px; }
@media print {
  .rf-doc {
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  .rf-hdr { break-after: avoid; }
  .rf-dados-wrap { break-inside: avoid; }
  .rf-celula { break-inside: avoid; }
  .rf-signatures { break-inside: avoid; }
}
@media screen {
  body.rf-print-body {
    background: #e7e5e4;
    padding: 16px 12px 24px;
  }
  .rf-doc {
    max-width: 210mm;
    margin: 0 auto 18px;
    padding: 12mm 10mm 14mm;
    background: #fff;
    box-shadow: 0 6px 20px rgba(28, 25, 23, 0.12);
    box-sizing: border-box;
  }
}
@media screen and (max-width: 560px) {
  .rf-hdr { flex-direction: column; align-items: center; text-align: center; }
  .rf-hdr-meta { text-align: center; }
  .rf-grid-obra-3, .rf-grid-receb-nf-rom, .rf-signatures { grid-template-columns: 1fr; }
}
`;
}

export async function montarHtmlRelatorioFotografico(p: RelatorioFotograficoPayload): Promise<string> {
  const cfg = readConfiguracoes();
  const clienteImpressao = cfg.cliente.trim() || p.centroCusto.trim();
  const projetoImpressao = cfg.projeto.trim() || p.projeto.trim();
  const localImpressao = cfg.local.trim() || p.localObra.trim();
  const logo = resolverUrlLogoInstitucionalParaHtmlImpresso(cfg.logoInstitucionalUrl);
  const geradoEm = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const tituloPrincipal = p.titulo.trim() || TITULO_PADRAO;
  const numeroDoc = p.numeroRelatorio.trim();
  const totalFotos = p.fotos.length;
  const comAssinaturas = p.incluirAssinaturasImpressao;
  const totalPaginasFotos = Math.max(1, Math.ceil(Math.max(totalFotos, 1) / FOTOS_POR_PAGINA));
  const totalPaginasDoc = totalFotos === 0 ? 1 : totalPaginasFotos;
  const fontesCss = await cssFontesNotoRelatorioInline();
  const qrDataUrl = await dataUrlQrDocumentoControle({
    tipo: 'RF',
    codigo: numeroDoc || 'RF',
    emitidoEm: new Date().toISOString(),
    versaoDoc: DOC_VERSION,
  });
  const rodapeInstitucionalHtml = htmlRodapeInstitucionalControle({
    nomeEmpresa: cfg.documentoRodapeNome,
    cnpj: cfg.documentoRodapeCnpj,
    codigo: numeroDoc || 'RF',
    versaoDoc: DOC_VERSION,
    qrDataUrl,
    extra: comAssinaturas ? 'Assinaturas na última página.' : undefined,
  });

  const logoBlock = montarLogoBlockRf(p.incluirLogoImpressao, logo);
  const tituloDoc = escapeHtmlRelatorio(tituloPrincipal);
  const numeroHtml = numeroDoc
    ? `<div class="rf-hdr-code">${escapeHtmlRelatorio(numeroDoc)}</div>`
    : '<div class="rf-hdr-code rf-hdr-code--pendente">Nº (definido ao salvar)</div>';

  const capaLinhaInterna = `
    <header class="rf-hdr">
      <div class="rf-hdr-logo">${logoBlock || '<span aria-hidden="true"></span>'}</div>
      <div class="rf-hdr-title">
        <p class="rf-hdr-eyebrow">Evidência fotográfica · Recebimento</p>
        <h1>${tituloDoc}</h1>
        <p class="rf-hdr-sub">Documento oficial de evidência fotográfica</p>
      </div>
      <div class="rf-hdr-meta">
        ${numeroHtml}
        <div class="rf-hdr-date">${totalFotos} foto(s)</div>
        <div class="rf-hdr-date">Emitido ${escapeHtmlRelatorio(geradoEm)}</div>
      </div>
    </header>`;

  const capaRepeatHtml = `<header class="rf-hdr rf-hdr--repeat">
      <div class="rf-hdr-logo">${logoBlock || '<span aria-hidden="true"></span>'}</div>
      <div class="rf-hdr-title">
        <p class="rf-hdr-eyebrow">Evidência fotográfica · Recebimento</p>
        <h1>${tituloDoc}</h1>
      </div>
      <div class="rf-hdr-meta">${numeroHtml}</div>
    </header>`;

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
  const dadosInteriorHtml = `
    <span class="rf-dados-label">Contexto do recebimento</span>
    <div class="rf-dados-stack">
      ${blocoObra}
      ${temObra ? '<div class="rf-dados-separador" role="presentation"></div>' : ''}
      ${blocoRecebimento}
      ${blocoExtra}
    </div>`;

  const dadosQuadroHtml = `<div class="rf-dados-wrap">${dadosInteriorHtml}</div>`;
  const dadosRepeatHtml = `<div class="rf-dados-wrap rf-dados-wrap--repeat">${dadosInteriorHtml}</div>`;

  const topbarGeradoHtml = `<div class="rf-topbar"><span>Gerado em: ${escapeHtmlRelatorio(geradoEm)}</span><span class="rf-topbar-meta">${escapeHtmlRelatorio(numeroDoc || 'RF')} · ${totalFotos} foto(s)</span></div>`;

  const cabecalhoPaginaRepetidoHtml = `${topbarGeradoHtml}${capaRepeatHtml}${dadosRepeatHtml}`;

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
    <div class="rf-page-foot">Página ${pageNo} de ${totalPaginasDoc} · ${escapeHtmlRelatorio(numeroDoc || 'RF')} · v${DOC_VERSION}</div>
  </section>`;
    })
    .join('');

  const paginaSoAssinaturas =
    p.fotos.length === 0 && comAssinaturas
      ? `
  <section class="rf-pagina-fotos rf-pagina-fotos--com-assin" aria-label="Assinaturas">
    ${assinaturasHtml}
    <div class="rf-page-foot">Página 1 de 1 · ${escapeHtmlRelatorio(numeroDoc || 'RF')} · v${DOC_VERSION}</div>
  </section>`
      : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${tituloDoc}</title>
  <style>
    ${fontesCss}
    ${cssEstilosRelatorioFotografico()}
    ${cssBarraPreVisualizacaoImpressaoHtml()}
  </style>
</head>
<body class="rf-print-body">
  ${htmlBarraPreVisualizacaoImpressao()}
  <div class="rf-doc">
    ${topbarGeradoHtml}
    ${capaLinhaInterna}
    ${dadosQuadroHtml}

    ${
      p.fotos.length === 0
        ? `${paginaSoAssinaturas || '<div class="rf-empty">Nenhuma foto neste relatório.</div>'}`
        : blocosPaginas
    }

    ${rodapeInstitucionalHtml}
  </div>
  ${scriptBarraPreVisualizacaoImpressao()}
</body>
</html>`;
}

export async function imprimirRelatorioFotograficoHtml(html: string, fileName = 'relatorio-fotografico.pdf'): Promise<boolean> {
  return imprimirRelatorioProfissional({ html, fileName, tipoNuvem: 'relatorio_fotografico' });
}
