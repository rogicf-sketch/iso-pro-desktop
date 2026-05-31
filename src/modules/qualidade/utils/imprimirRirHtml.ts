import { readConfiguracoes } from '../../configuracoes/services/configuracoes.service';
import {
  abrirImpressaoHtmlRelatorio,
  cssBarraPreVisualizacaoImpressaoHtml,
  escapeHtmlRelatorio,
  htmlBarraPreVisualizacaoImpressao,
  segmentoInstituicaoRodapeEletronico,
  scriptBarraPreVisualizacaoImpressao,
} from '../../../lib/htmlRelatorioInstitucional';
import { resolverUrlLogoInstitucionalParaHtmlImpresso } from '../../../lib/logoInstitucional';
import type { RirRegistro } from '../types/qualidade.types';
import { rirObraDefaultsFromConfig } from './rirConfigDefaults';

const DOC_VERSION = '23';

function formatDatePt(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

function formatDateTimePt(): string {
  return new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function laudoLabel(l: RirRegistro['laudo']): string {
  if (l === 'reprovado') return 'Reprovado';
  if (l === 'observacoes') return 'Conforme observações';
  return 'Aprovado';
}

function statusTratativaLabel(s: RirRegistro['status']): string {
  const m: Record<RirRegistro['status'], string> = {
    aberto: 'Em aberto',
    em_analise: 'Em análise',
    tratado: 'Tratado',
    cancelado: 'Cancelado',
  };
  return m[s] ?? s;
}

function mkIns(on: boolean): string {
  return on ? '<span class="rir-pill ok">✓</span>' : '<span class="rir-pill off">—</span>';
}

function celRotuloValor(rotulo: string, valor: string): string {
  return `<td class="rir-hform-cell"><span class="rir-hform-lbl">${rotulo}</span> ${valor || '—'}</td>`;
}

/** Cabecalho compacto em grelha (repete em cada folha dentro do thead da tabela de itens). */
function montarCabecalhoRirCompactoHtml(params: {
  logoBlock: string;
  escopoLinha: string;
  localCfg: string;
  codigo: string;
  dataRegistro: string;
  uoExibir: string;
  localExibir: string;
  contratoExibir: string;
  fornecedor: string;
  nf: string;
  romaneio: string;
  procedimento: string;
  solCompra: string;
  obsCurta: string;
  inspecaoQuantitativa: boolean;
  inspecaoQualitativa: boolean;
  inspecaoDimensional: boolean;
}): string {
  const escopo =
    params.escopoLinha || params.localCfg
      ? `<div class="rir-hform-escopo">${escapeHtmlRelatorio(params.escopoLinha)}${params.localCfg ? ` · ${escapeHtmlRelatorio(params.localCfg)}` : ''}</div>`
      : '';

  return `<table class="rir-hform" cellspacing="0" cellpadding="0">
    <tr>
      <td class="rir-hform-logo" rowspan="4">${params.logoBlock}</td>
      <td class="rir-hform-title" colspan="4">
        Relatório de inspeção de recebimento (RIR)
        ${escopo}
      </td>
      <td class="rir-hform-meta"><span class="rir-hform-lbl">Nº RIR</span><br>${escapeHtmlRelatorio(params.codigo)}</td>
      <td class="rir-hform-meta"><span class="rir-hform-lbl">Data</span><br>${escapeHtmlRelatorio(params.dataRegistro)}</td>
      <td class="rir-hform-meta rir-hform-folha"><span class="rir-hform-lbl">Folha</span><br><span class="rir-pagenum"></span></td>
    </tr>
    <tr>
      ${celRotuloValor('UO (Obra / Depto)', escapeHtmlRelatorio(params.uoExibir))}
      ${celRotuloValor('Local', escapeHtmlRelatorio(params.localExibir))}
      ${celRotuloValor('Contrato Nº', escapeHtmlRelatorio(params.contratoExibir))}
      <td class="rir-hform-cell rir-hform-cell--wide" colspan="4"><span class="rir-hform-lbl">Fornecedor</span> ${escapeHtmlRelatorio(params.fornecedor) || '—'}</td>
    </tr>
    <tr>
      ${celRotuloValor('Nº Nota Fiscal', escapeHtmlRelatorio(params.nf))}
      ${celRotuloValor('Nº Romaneio', escapeHtmlRelatorio(params.romaneio))}
      ${celRotuloValor('Nº Procedimento', escapeHtmlRelatorio(params.procedimento))}
      <td class="rir-hform-cell rir-hform-cell--wide" colspan="4"><span class="rir-hform-lbl">Sol. compra / Pack-list</span> ${params.solCompra ? escapeHtmlRelatorio(params.solCompra) : '—'}</td>
    </tr>
    <tr>
      <td class="rir-hform-cell" colspan="3">
        <span class="rir-hform-lbl">Inspeção</span>
        ${mkIns(params.inspecaoQuantitativa)} Quant. ${mkIns(params.inspecaoQualitativa)} Qual. ${mkIns(params.inspecaoDimensional)} Dim.
      </td>
      <td class="rir-hform-cell rir-hform-cell--wide" colspan="5"><span class="rir-hform-lbl">Obs.</span> ${escapeHtmlRelatorio(params.obsCurta) || '—'}</td>
    </tr>
  </table>`;
}

/**
 * Relatorio RIR — cabecalho compacto em grelha; titulo repete em cada folha; numeracao Folha X/Y na impressao.
 */
export function montarHtmlRelatorioRirCompleto(r: RirRegistro): string {
  const cfg = readConfiguracoes();
  const segRodapeInst = segmentoInstituicaoRodapeEletronico(cfg.documentoRodapeNome, cfg.documentoRodapeCnpj);
  const logo = resolverUrlLogoInstitucionalParaHtmlImpresso();
  const clienteNome = cfg.cliente || '';
  const projetoNome = cfg.projeto || '';
  const localCfg = cfg.local || '';
  const obCfg = rirObraDefaultsFromConfig(cfg);
  const uoExibir = (r.uo || '').trim() || obCfg.uo;
  const localExibir = (r.localObra || '').trim() || obCfg.localObra;
  const contratoExibir = (r.contratoNumero || '').trim() || obCfg.contratoNumero;
  const laudo = r.laudo || 'aprovado';
  const laudoTxt = laudoLabel(laudo);
  const statusTxt = statusTratativaLabel(r.status);
  const solCompra = (r.solCompraPackList ?? '').trim();

  let rows = '';
  (r.itensRir ?? []).forEach((it, i) => {
    rows += `<tr>
      <td class="rir-c-item">${i + 1}</td>
      <td>${escapeHtmlRelatorio(it.codigoMaterial)}</td>
      <td class="rir-c-q">${escapeHtmlRelatorio(String(it.quantidade))}</td>
      <td>${escapeHtmlRelatorio(it.unidade)}</td>
      <td class="rir-c-desc">${escapeHtmlRelatorio(it.descricaoMaterial).replace(/\n/g, '<br>')}</td>
      <td class="rir-c-cert">${escapeHtmlRelatorio(it.certificado)}</td>
    </tr>`;
  });
  if (!rows) rows = '<tr><td colspan="6" class="rir-empty-row">Nenhum item registrado neste relatório.</td></tr>';

  const logoBlock = logo
    ? `<img class="rir-logo" src="${escapeHtmlRelatorio(logo)}" alt="Logo" />`
    : `<div class="rir-brand-fallback">${escapeHtmlRelatorio(clienteNome || 'I.S.O PRO')}</div>`;

  const escopoLinha = [clienteNome, projetoNome].filter(Boolean).join(' · ') || '';
  const refReceb = r.recebimentoId ? escapeHtmlRelatorio(r.recebimentoId) : '—';
  const emitidoEm = formatDateTimePt();

  const cabecalhoCompacto = montarCabecalhoRirCompactoHtml({
    logoBlock,
    escopoLinha,
    localCfg,
    codigo: r.codigo,
    dataRegistro: formatDatePt(r.dataRegistro),
    uoExibir,
    localExibir,
    contratoExibir,
    fornecedor: r.fornecedorNome,
    nf: r.recebimentoNotaFiscal ?? '',
    romaneio: r.recebimentoRomaneio ?? '',
    procedimento: r.procedimentoNumero,
    solCompra,
    obsCurta: r.obsCurta,
    inspecaoQuantitativa: !!r.inspecaoQuantitativa,
    inspecaoQualitativa: !!r.inspecaoQualitativa,
    inspecaoDimensional: !!r.inspecaoDimensional,
  });

  return `<div class="rir-doc rir-doc--classic" lang="pt-BR">
<style>
html {
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
body.rir-print-body {
  margin: 0;
  padding: 0;
}
.rir-doc--classic {
  font-family: Tahoma, 'Segoe UI', Verdana, Arial, sans-serif;
  color: #0f172a;
  font-size: 10pt;
  line-height: 1.35;
  background: #f1f5f9;
  padding: 10px;
  max-width: 960px;
  margin: 0 auto;
  text-rendering: geometricPrecision;
  font-synthesis: none;
}
.rir-doc--classic * { box-sizing: border-box; }
.rir-doc-inner {
  background: #fff;
  border: 1px solid #334155;
  padding: 10px 12px 14px;
}
.rir-logo {
  display: block;
  max-height: 42px;
  max-width: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  margin: 0 auto;
}
.rir-brand-fallback { font-size: 11px; font-weight: 700; color: #0f172a; text-align: center; line-height: 1.2; }
.rir-hform {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid #334155;
  font-size: 8.5pt;
  table-layout: fixed;
}
.rir-hform td {
  border: 1px solid #64748b;
  padding: 3px 5px;
  vertical-align: middle;
  word-break: break-word;
  line-height: 1.3;
}
.rir-hform-logo {
  width: 88px;
  min-width: 72px;
  text-align: center;
  vertical-align: middle;
  padding: 4px 3px !important;
}
.rir-hform-title {
  text-align: center;
  font-weight: 700;
  font-size: 9.5pt;
  line-height: 1.25;
  padding: 4px 6px !important;
}
.rir-hform-escopo {
  margin-top: 2px;
  font-size: 7.5pt;
  font-weight: 400;
  color: #475569;
}
.rir-hform-meta {
  width: 72px;
  min-width: 64px;
  text-align: center;
  font-size: 8pt;
  padding: 3px 4px !important;
}
.rir-hform-folha { width: 56px; min-width: 48px; }
.rir-hform-lbl {
  font-weight: 600;
  font-size: 7pt;
  color: #475569;
  text-transform: none;
}
.rir-hform-cell--wide { font-size: 8pt; }
.rir-pagenum::before { content: "—"; }
.rir-pill { display: inline; font-weight: 600; margin: 0 1px; }
.rir-pill.ok { color: #047857; }
.rir-pill.off { color: #94a3b8; }
.rir-sheet-table {
  width: 100%;
  border-collapse: collapse;
  border-spacing: 0;
  margin-top: 6px;
  font-size: 9pt;
}
.rir-sheet-table > thead > tr.rir-thead-banner > td {
  padding: 0;
  border: none;
  vertical-align: top;
}
.rir-sheet-table > thead > tr.rir-thead-cols > th {
  background: #e5e7eb;
  color: #0f172a;
  padding: 4px 5px;
  font-weight: 600;
  font-size: 8pt;
  border: 1px solid #64748b;
  text-align: center;
}
.rir-sheet-table > thead > tr.rir-thead-cols > th:nth-child(2),
.rir-sheet-table > thead > tr.rir-thead-cols > th:nth-child(5) {
  text-align: left;
}
.rir-sheet-table tbody td {
  padding: 3px 5px;
  vertical-align: top;
  border: 1px solid #94a3b8;
  font-weight: 400;
  font-size: 8.5pt;
  line-height: 1.35;
}
.rir-sheet-table tbody td:nth-child(1),
.rir-sheet-table tbody td:nth-child(3),
.rir-sheet-table tbody td:nth-child(4),
.rir-sheet-table tbody td:nth-child(6) {
  text-align: center;
}
.rir-sheet-table tbody td:nth-child(2),
.rir-sheet-table tbody td:nth-child(5) {
  text-align: left;
}
.rir-c-item { width: 32px; font-weight: 500; }
.rir-c-q { font-variant-numeric: tabular-nums; width: 48px; }
.rir-c-desc { min-width: 140px; word-break: break-word; }
.rir-c-cert { min-width: 72px; }
.rir-empty-row { text-align: center; color: #94a3b8; padding: 10px !important; font-style: italic; }
.rir-tail { margin-top: 8px; }
.rir-classic-bar {
  margin: 8px 0 4px 0;
  padding: 4px 7px;
  background: #e5e7eb;
  border: 1px solid #94a3b8;
  font-size: 8pt;
  font-weight: 600;
  color: #1e293b;
}
.rir-block {
  border: 1px solid #cbd5e1;
  padding: 6px 8px;
  margin: 4px 0;
  background: #fafafa;
  font-size: 9pt;
  line-height: 1.45;
  white-space: pre-wrap;
}
.rir-block h3 {
  margin: 0 0 4px 0;
  font-size: 8pt;
  color: #475569;
  font-weight: 600;
}
.rir-laudo-wrap { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 4px; }
.rir-laudo-badge { padding: 6px 12px; border-radius: 6px; font-weight: 600; font-size: 10pt; display: inline-block; }
.rir-laudo-badge.aprovado { background: #ecfdf5; color: #047857; border: 2px solid #34d399; }
.rir-laudo-badge.reprovado { background: #fef2f2; color: #b91c1c; border: 2px solid #f87171; }
.rir-laudo-badge.obs { background: #fffbeb; color: #b45309; border: 2px solid #fcd34d; }
.rir-laudo-note { font-size: 8.5pt; color: #64748b; margin: 0; max-width: 480px; line-height: 1.4; }
.rir-sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 14px; page-break-inside: avoid; }
.rir-sign > div { text-align: center; }
.rir-sign .line { border-top: 1px dashed #64748b; margin: 24px 6px 6px 6px; }
.rir-sign .role { font-size: 8pt; color: #64748b; font-weight: 600; }
.rir-sign .nome { font-size: 10pt; margin-top: 4px; color: #0f172a; font-weight: 500; }
.rir-sign .data { font-size: 8pt; color: #94a3b8; margin-top: 2px; }
.rir-foot {
  margin-top: 10px;
  padding-top: 6px;
  border-top: 1px solid #cbd5e1;
  font-size: 7.5pt;
  color: #94a3b8;
  line-height: 1.4;
}
.rir-strip-mini {
  font-size: 8pt;
  color: #475569;
  margin: 6px 0 0;
  padding: 4px 6px;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
}
.rir-print-sign-foot { display: block; }
@media print {
  @page {
    size: A4;
    margin: 8mm 9mm 10mm 9mm;
  }
  html, body.rir-print-body {
    width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    height: auto !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .rir-doc--classic {
    background: #fff !important;
    padding: 0 !important;
    max-width: none !important;
    width: 100% !important;
    font-size: 10pt !important;
    margin: 0 !important;
  }
  .rir-doc-inner {
    border: none !important;
    padding: 0 !important;
    width: 100% !important;
  }
  .rir-pagenum::before {
    content: counter(page) " / " counter(pages);
  }
  .rir-sheet-table thead {
    display: table-header-group;
  }
  .rir-sheet-table tbody tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .rir-sheet-table > thead > tr.rir-thead-cols > th,
  .rir-sheet-table tbody td,
  .rir-hform td,
  .rir-classic-bar,
  .rir-block,
  .rir-laudo-badge {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .rir-tail {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .rir-sign {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .rir-print-sign-foot {
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }
}
</style>
<div class="rir-doc-inner">
  <table class="rir-sheet-table">
    <thead>
      <tr class="rir-thead-banner">
        <td colspan="6">${cabecalhoCompacto}</td>
      </tr>
      <tr class="rir-thead-cols">
        <th>Item</th>
        <th>Código</th>
        <th>Qtd.</th>
        <th>Unid.</th>
        <th>Descrição</th>
        <th>Certificado</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="rir-tail">
    <div class="rir-classic-bar">Inspeção de recebimento</div>
    <div class="rir-block">
      <h3>Observações da inspeção</h3>
      ${escapeHtmlRelatorio(r.observacoesQc || '—')}
    </div>

    <div class="rir-classic-bar">Laudo</div>
    <div class="rir-laudo-wrap">
      <span class="rir-laudo-badge ${laudo === 'reprovado' ? 'reprovado' : laudo === 'observacoes' ? 'obs' : 'aprovado'}">${escapeHtmlRelatorio(laudoTxt)}</span>
      <p class="rir-laudo-note">Em caso de reprovação ou conforme observações, siga o procedimento interno (segregação, nova conferência, etc.).</p>
    </div>

    <div class="rir-strip-mini">
      <strong>Rastreio:</strong> ID recebimento ${refReceb} · ID RIR ${escapeHtmlRelatorio(r.id)} · Estado: ${escapeHtmlRelatorio(statusTxt)} · Emitido ${escapeHtmlRelatorio(emitidoEm)} · Relatório v${DOC_VERSION}
    </div>

    <div class="rir-classic-bar">Assinaturas</div>
    <div class="rir-print-sign-foot">
      <div class="rir-sign">
        <div><div class="line"></div><div class="role">Responsável — recebimento</div><div class="nome">${escapeHtmlRelatorio(r.assinaturaRecebimento.nome)}</div><div class="data">${r.assinaturaRecebimento.data ? formatDatePt(r.assinaturaRecebimento.data) : '—'}</div></div>
        <div><div class="line"></div><div class="role">Controle de qualidade</div><div class="nome">${escapeHtmlRelatorio(r.assinaturaCq.nome)}</div><div class="data">${r.assinaturaCq.data ? formatDatePt(r.assinaturaCq.data) : '—'}</div></div>
        <div><div class="line"></div><div class="role">Cliente</div><div class="nome">${escapeHtmlRelatorio(r.assinaturaCliente.nome)}</div><div class="data">${r.assinaturaCliente.data ? formatDatePt(r.assinaturaCliente.data) : '—'}</div></div>
      </div>
      <div class="rir-foot">
        Documento gerado eletronicamente pelo I.S.O PRO Desktop${segRodapeInst}. Conteúdo para arquivo e auditoria. Referência: ${escapeHtmlRelatorio(r.codigo)}.
      </div>
    </div>
  </div>
</div>
</div>`;
}

export function montarDocumentoHtmlImpressaoRir(registro: RirRegistro): string {
  const titulo = `I.S.O PRO — RIR ${(registro.codigo || '').trim() || '—'}`;
  const inner = montarHtmlRelatorioRirCompleto(registro);
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtmlRelatorio(titulo)}</title>
<style>${cssBarraPreVisualizacaoImpressaoHtml()}</style>
</head>
<body class="rir-print-body">
${htmlBarraPreVisualizacaoImpressao()}
${inner}
${scriptBarraPreVisualizacaoImpressao()}
</body>
</html>`;
}

export function imprimirRirHtml(registro: RirRegistro): boolean {
  return abrirImpressaoHtmlRelatorio(montarDocumentoHtmlImpressaoRir(registro));
}
