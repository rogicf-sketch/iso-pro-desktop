import {
  abrirImpressaoHtmlRelatorio,
  cssInstitucionalRelatorio,
  escapeHtmlRelatorio,
  htmlBlocoLogoInstitucional,
} from '../../../lib/htmlRelatorioInstitucional';
import { resolverUrlLogoInstitucionalParaHtmlImpresso } from '../../../lib/logoInstitucional';
import type { RecebimentoItem } from '../../recebimentos/types/recebimento.types';
import type { EtiquetaCodigosOpcao, EtiquetaFormato, EtiquetaModelo } from '../types/etiqueta.types';
import { montarHtmlCodigosNaEtiqueta } from './etiquetaCodigosGraficos';

export type EtiquetasRecebimentoCabecalho = {
  notaFiscal: string;
  romaneio: string;
  fornecedor: string;
  dataRecebimento: string;
};

/** Quantidade na etiqueta: sempre a quantidade recebida registrada no recebimento (sistema). */
export function quantidadeExibidaEtiquetaItem(item: RecebimentoItem): number {
  const qr = Number(item.quantidadeRecebida);
  return Number.isFinite(qr) ? qr : 0;
}

function htmlLogoNaEtiquetaCard(logoUrl: string): string {
  if (logoUrl) {
    return `<div class="etiq-card-logo-mini"><img src="${escapeHtmlRelatorio(logoUrl)}" alt="" /></div>`;
  }
  return `<div class="etiq-card-logo-mini etiq-card-logo-placeholder" title="Logo em Configuracoes do sistema"><span class="etiq-card-logo-hint">Logo</span></div>`;
}

/**
 * Valor salvo em recebimento costuma ser "NF-7778869"; o layout ja imprime o rotulo **NF**,
 * entao removemos um prefixo NF duplicado para nao aparecer "NF NF-7778869".
 */
function notaFiscalSufixoParaRotuloEtiqueta(nf: string): string {
  const t = nf.trim();
  if (!t) return '—';
  const rest = t.replace(/^NF[-\s.:_]*/i, '').trim();
  return rest || t;
}

function montarPayloadQrRecebimento(item: RecebimentoItem, recebimento: EtiquetasRecebimentoCabecalho): string {
  return [
    `NF:${(recebimento.notaFiscal || '').trim() || '-'}`,
    `COD:${(item.codigoMaterial || '').trim() || '-'}`,
    `ROM:${(recebimento.romaneio || '').trim() || '-'}`,
    `LOC:${(item.localizacao || '').trim() || '-'}`,
  ].join('|');
}

function etiquetaModeloLegenda(modelo: EtiquetaModelo): string {
  const map: Record<EtiquetaModelo, string> = {
    simples: 'Simples',
    colorido: 'Neutro refinado',
    industrial: 'Industrial',
    cartao: 'Cartao',
    segregacao: 'Segregado',
    liberacao: 'Liberado',
  };
  return map[modelo];
}

/** Nome do modelo so na propria etiqueta para fluxos de qualidade (bloqueio / liberacao). */
function mostrarMarcadorModeloNaEtiqueta(modelo: EtiquetaModelo): boolean {
  return modelo === 'segregacao' || modelo === 'liberacao';
}

/** Reduz fonte do titulo quando a descricao e muito longa (evita empurrar codigos/barcode para fora do papel). */
function classeTituloPorTamanhoDescricao(descricao: string): string {
  const len = descricao.length;
  if (len > 220) return 'etiq-titulo etiq-titulo--extra';
  if (len > 90) return 'etiq-titulo etiq-titulo--compacto';
  return 'etiq-titulo';
}

/**
 * Monta HTML com uma etiqueta por item selecionado (repete copiasPorItem vezes cada uma).
 * Layout em grade no A4; termico em coluna unica.
 */
export async function montarHtmlEtiquetasItensRecebimento(params: {
  recebimento: EtiquetasRecebimentoCabecalho;
  itens: RecebimentoItem[];
  modelo: EtiquetaModelo;
  formato: EtiquetaFormato;
  larguraMm: number;
  alturaMm: number;
  copiasPorItem: number;
  codigos: EtiquetaCodigosOpcao;
  logoNaEtiqueta: boolean;
}): Promise<string> {
  const { recebimento, itens, modelo, formato, larguraMm, alturaMm, copiasPorItem, codigos, logoNaEtiqueta } = params;
  const logoUrl = resolverUrlLogoInstitucionalParaHtmlImpresso();
  const geradoEm = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const compacto = formato === 'termica_58' || formato === 'termica_80';
  const gridCols = formato === 'a4_2col' && !compacto ? 2 : 1;

  const tarefas: Promise<string>[] = [];
  for (const item of itens) {
    const copias = Math.max(1, Math.min(99, Math.floor(copiasPorItem)));
    for (let c = 0; c < copias; c++) {
      tarefas.push(
        blocoEtiquetaItemHtml({
          recebimento,
          item,
          modelo,
          copiaIndex: c + 1,
          copiasTotal: copias,
          codigos,
          logoNaEtiqueta,
          logoUrl,
          compacto,
        }),
      );
    }
  }
  const blocos = await Promise.all(tarefas);

  const gridClass = gridCols === 2 ? 'etiq-lote-grid etiq-lote-a4-2' : 'etiq-lote-grid etiq-lote-single';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>Etiquetas recebimento ${escapeHtmlRelatorio(recebimento.notaFiscal || '—')}</title>
  <style>
    ${cssInstitucionalRelatorio()}
    /* Pre-visualizacao no app (tema escuro): forcar leitura como impressao — papel claro, texto escuro */
    html { color-scheme: light; }
    body {
      background: #e8edf3 !important;
      color: #0f172a !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .inst-topbar, .inst-topbar span { color: #334155 !important; }
    .inst-topbar span:last-child { color: #0f172a !important; }
    h1 { color: #0f172a !important; border-bottom-color: #475569 !important; }
    .etiq-lote-top {
      margin-bottom: 16px;
      font-size: 11pt;
      color: #334155 !important;
      background: #f1f5f9;
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid #cbd5e1;
    }
    .etiq-lote-grid { display: grid; gap: 12px; }
    .etiq-lote-a4-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .etiq-lote-single { grid-template-columns: 1fr; max-width: ${compacto ? `${larguraMm}mm` : '720px'}; margin: 0 auto; }
    .etiq-card {
      border: 1px solid #94a3b8;
      border-radius: 8px;
      padding: 0;
      page-break-inside: avoid;
      min-height: ${Math.max(32, alturaMm * 0.35)}mm;
      background: #ffffff !important;
      color: #0f172a !important;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
    }
    /* Modelos: antes so industrial/segregacao/liberacao tinham destaque; os demais pareciam iguais. */
    .etiq-card.simples {
      border-left: 4px solid #64748b;
    }
    .etiq-card.simples .etiq-card-head {
      background: #f8fafc !important;
    }
    /* Colorido: neutro (slate), sem tons roxo — destaque só por barra e cabeçalho cinza */
    .etiq-card.colorido {
      border-left: 5px solid #475569;
      background: linear-gradient(180deg, #f8fafc 0%, #ffffff 55%) !important;
    }
    .etiq-card.colorido .etiq-card-head {
      background: #f1f5f9 !important;
      border-bottom-color: #cbd5e1;
    }
    .etiq-card.cartao {
      border-left: 5px solid #ea580c;
      border-radius: 12px;
      box-shadow: 0 4px 18px rgba(15, 23, 42, 0.12);
    }
    .etiq-card.cartao .etiq-card-head {
      background: linear-gradient(90deg, #fff7ed 0%, #ffedd5 100%) !important;
      border-bottom-color: #fdba74;
    }
    .etiq-card.industrial {
      border-left: 5px solid #0f766e;
    }
    .etiq-card.industrial .etiq-card-head {
      background: #ecfdf5 !important;
      border-bottom-color: #99f6e4;
    }
    .etiq-card.segregacao {
      border-left: 5px solid #b91c1c;
      background: #fff5f5 !important;
    }
    .etiq-card.segregacao .etiq-card-head {
      background: #fef2f2 !important;
      border-bottom-color: #fecaca;
    }
    .etiq-card.liberacao {
      border-left: 5px solid #1d4ed8;
      background: #f0f7ff !important;
    }
    .etiq-card.liberacao .etiq-card-head {
      background: #eff6ff !important;
      border-bottom-color: #bfdbfe;
    }
    .etiq-card-head {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 12px;
      align-items: flex-start;
      justify-content: space-between;
      padding: 8px 12px;
      font-size: 9pt;
      color: #475569 !important;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      border-radius: 7px 7px 0 0;
    }
    .etiq-card-head-leading {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: 8px 10px;
      flex: 1;
      min-width: 0;
    }
    .etiq-card-head .etiq-card-logo-mini {
      flex: 0 0 auto;
      align-self: flex-start;
    }
    .etiq-card-head .etiq-card-logo-mini img {
      max-height: 32px;
      max-width: 88px;
    }
    .etiq-card-head .etiq-card-logo-placeholder {
      min-height: 28px;
      min-width: 48px;
    }
    .etiq-card-head-main {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 12px;
      align-items: center;
      min-width: 0;
      flex: 1;
    }
    .etiq-modelo-pill {
      font-size: 7pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 3px 9px;
      border-radius: 999px;
      border: 1px solid #cbd5e1;
      background: #ffffff;
      color: #475569 !important;
      flex-shrink: 0;
    }
    .etiq-modelo-pill--segregacao { border-color: #f87171; background: #fef2f2; color: #991b1b !important; }
    .etiq-modelo-pill--liberacao { border-color: #60a5fa; background: #eff6ff; color: #1e40af !important; }
    .etiq-card-body { padding: 8px 12px 12px; }
    .etiq-card-texts { min-width: 0; }
    .etiq-card-logo-mini {
      flex: 0 0 auto;
      max-width: 100px;
    }
    .etiq-card-logo-mini img {
      max-height: 40px;
      max-width: 100px;
      width: auto;
      height: auto;
      object-fit: contain;
      display: block;
    }
    .etiq-card-logo-placeholder {
      min-height: 36px;
      min-width: 56px;
      border: 1px dashed #cbd5e1;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f8fafc;
    }
    .etiq-card-logo-hint { font-size: 7.5pt; color: #94a3b8; }
    .etiq-codigos-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 16px;
      align-items: flex-end;
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px dashed #e2e8f0;
    }
    .etiq-barcode-wrap {
      max-width: 100%;
      overflow-x: auto;
    }
    .etiq-barcode-wrap svg { max-width: 100%; height: auto; display: block; }
    .etiq-barcode-fallback {
      font-family: Consolas, 'Courier New', monospace;
      font-size: 10pt;
      color: #0f172a !important;
    }
    .etiq-qr-wrap { flex: 0 0 auto; }
    .etiq-qr-img {
      display: block;
      image-rendering: pixelated;
    }
    .etiq-codigo {
      font-family: Consolas, 'Courier New', monospace;
      font-size: 12pt;
      margin: 6px 0 8px;
      color: #0f172a !important;
      letter-spacing: 0.02em;
    }
    .etiq-titulo {
      font-size: 13pt;
      font-weight: 700;
      margin: 0 0 4px;
      line-height: 1.25;
      color: #0f172a !important;
      word-break: break-word;
      overflow-wrap: anywhere;
      hyphens: auto;
    }
    .etiq-titulo--compacto {
      font-size: 11pt;
      line-height: 1.2;
    }
    .etiq-titulo--extra {
      font-size: 9.5pt;
      line-height: 1.15;
      font-weight: 600;
    }
    .etiq-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 20px;
      font-size: 10.5pt;
      color: #334155 !important;
      margin-top: 4px;
    }
    .etiq-meta {
      font-size: 8.5pt;
      color: #64748b !important;
      margin-top: 8px;
      padding-top: 6px;
      border-top: 1px dashed #cbd5e1;
    }
    @media print {
      body { background: #fff !important; }
      .etiq-lote-top { background: transparent !important; border: none; padding-left: 0; padding-right: 0; }
      .etiq-card { box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="inst-topbar">
    <span>Gerado em: ${escapeHtmlRelatorio(geradoEm)}</span>
    <span>${escapeHtmlRelatorio(formato)} • ${escapeHtmlRelatorio(String(larguraMm))}×${escapeHtmlRelatorio(String(alturaMm))} mm • modelo ${escapeHtmlRelatorio(modelo)}</span>
  </div>
  <header class="inst-header">
    ${htmlBlocoLogoInstitucional(logoUrl, compacto)}
    <div class="inst-title-col">
      <h1>Etiquetas do recebimento</h1>
    </div>
  </header>
  <p class="etiq-lote-top">
    <strong>NF:</strong> ${escapeHtmlRelatorio(notaFiscalSufixoParaRotuloEtiqueta(recebimento.notaFiscal))}
    &nbsp;|&nbsp; <strong>Romaneio:</strong> ${escapeHtmlRelatorio(recebimento.romaneio || '—')}
    &nbsp;|&nbsp; <strong>Fornecedor:</strong> ${escapeHtmlRelatorio(recebimento.fornecedor || '—')}
    &nbsp;|&nbsp; <strong>Data:</strong> ${escapeHtmlRelatorio(recebimento.dataRecebimento || '—')}
  </p>
  <div class="${gridClass}">
    ${blocos.join('\n')}
  </div>
</body>
</html>`;
}

function classeModeloCard(modelo: EtiquetaModelo): string {
  const base = 'etiq-card';
  switch (modelo) {
    case 'segregacao':
      return `${base} segregacao`;
    case 'liberacao':
      return `${base} liberacao`;
    case 'industrial':
      return `${base} industrial`;
    case 'simples':
      return `${base} simples`;
    case 'colorido':
      return `${base} colorido`;
    case 'cartao':
      return `${base} cartao`;
    default:
      return `${base} simples`;
  }
}

async function blocoEtiquetaItemHtml(opts: {
  recebimento: EtiquetasRecebimentoCabecalho;
  item: RecebimentoItem;
  modelo: EtiquetaModelo;
  copiaIndex: number;
  copiasTotal: number;
  codigos: EtiquetaCodigosOpcao;
  logoNaEtiqueta: boolean;
  logoUrl: string;
  compacto: boolean;
}): Promise<string> {
  const { recebimento, item, modelo, copiaIndex, copiasTotal, codigos, logoNaEtiqueta, logoUrl, compacto } = opts;
  const cardClass = classeModeloCard(modelo);
  const qtd = quantidadeExibidaEtiquetaItem(item);
  const copiaLinha =
    copiasTotal > 1
      ? `<div class="etiq-meta">Copia ${escapeHtmlRelatorio(String(copiaIndex))} de ${escapeHtmlRelatorio(String(copiasTotal))}</div>`
      : '';

  const payloadBarcode = (item.codigoMaterial || '').trim() || '—';
  const payloadQr = montarPayloadQrRecebimento(item, recebimento);
  const trechoCodigos = await montarHtmlCodigosNaEtiqueta(codigos, payloadBarcode, payloadQr, compacto);

  const mostrarPill = mostrarMarcadorModeloNaEtiqueta(modelo);
  const pillHtml = mostrarPill
    ? `<span class="etiq-modelo-pill etiq-modelo-pill--${modelo}">${escapeHtmlRelatorio(etiquetaModeloLegenda(modelo))}</span>`
    : '';
  const tituloClass = classeTituloPorTamanhoDescricao(item.descricaoMaterial || '');
  const logoCabecalho = logoNaEtiqueta ? htmlLogoNaEtiquetaCard(logoUrl) : '';
  return `<div class="${cardClass}">
    <div class="etiq-card-head${mostrarPill ? ' etiq-card-head--com-marcador' : ''}">
      <div class="etiq-card-head-leading">
        ${logoCabecalho}
        <div class="etiq-card-head-main">
          <span><strong>Disciplina:</strong> ${escapeHtmlRelatorio(item.disciplina || '—')}</span>
          <span><strong>NF</strong> ${escapeHtmlRelatorio(notaFiscalSufixoParaRotuloEtiqueta(recebimento.notaFiscal))}</span>
        </div>
      </div>
      ${pillHtml}
    </div>
    <div class="etiq-card-body">
      <div class="etiq-card-texts">
        <div class="${tituloClass}">${escapeHtmlRelatorio(item.descricaoMaterial || 'Material')}</div>
        <div class="etiq-codigo">${escapeHtmlRelatorio(item.codigoMaterial)}</div>
        <div class="etiq-row">
          <span><strong>Qtd:</strong> ${escapeHtmlRelatorio(String(qtd))} ${escapeHtmlRelatorio(item.unidade)}</span>
          <span><strong>Local:</strong> ${escapeHtmlRelatorio(item.localizacao || '—')}</span>
        </div>
        ${copiaLinha}
      </div>
      ${trechoCodigos}
    </div>
  </div>`;
}

export function imprimirEtiquetasRecebimentoHtml(html: string): boolean {
  return abrirImpressaoHtmlRelatorio(html);
}
