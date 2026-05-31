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

const DOC_VERSION = '24';

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

/** Bloco superior original do RIR — repetido em cada folha via thead da tabela de itens. */
function montarBlocoCabecalhoRirRepetivel(params: {
  logoBlock: string;
  escopoLinha: string;
  localCfg: string;
  codigo: string;
  dataRegistro: string;
  emitidoEm: string;
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
  return `<header class="rir-classic-top">
    <div class="rir-brand">${params.logoBlock}</div>
    <div class="rir-title-block">
      <h1 class="rir-title-main">Relatório de inspeção de recebimento (RIR)</h1>
      <p class="rir-title-sub">${escapeHtmlRelatorio(params.escopoLinha)}${params.localCfg ? ` · ${escapeHtmlRelatorio(params.localCfg)}` : ''}</p>
    </div>
    <div class="rir-meta-box">
      <div><strong>Nº RIR</strong>${escapeHtmlRelatorio(params.codigo)}</div>
      <div class="rir-meta-line"><strong>Data</strong>${escapeHtmlRelatorio(params.dataRegistro)}</div>
      <div class="rir-meta-line"><strong>Folha</strong><span class="rir-pagenum"></span></div>
      <div class="rir-meta-line"><strong>Emitido</strong>${escapeHtmlRelatorio(params.emitidoEm)}</div>
    </div>
  </header>
  <div class="rir-classic-grid">
    <div class="rir-fld"><label>UO (Obra / Depto)</label><span>${escapeHtmlRelatorio(params.uoExibir) || '—'}</span></div>
    <div class="rir-fld"><label>Local</label><span>${escapeHtmlRelatorio(params.localExibir) || '—'}</span></div>
    <div class="rir-fld"><label>Contrato Nº</label><span>${escapeHtmlRelatorio(params.contratoExibir) || '—'}</span></div>
  </div>
  <div class="rir-ins-row">
    <span class="rir-ins-label">Inspeção:</span>
    ${mkIns(params.inspecaoQuantitativa)} <span>Quantitativa</span>
    ${mkIns(params.inspecaoQualitativa)} <span>Qualitativa</span>
    ${mkIns(params.inspecaoDimensional)} <span>Dimensional</span>
  </div>
  <div class="rir-classic-bar">Documentos</div>
  <div class="rir-doc-campos">
    <div class="rir-fld rir-doc-campos__nf"><label>Nº Nota Fiscal</label><span>${escapeHtmlRelatorio(params.nf) || '—'}</span></div>
    <div class="rir-fld rir-doc-campos__forn"><label>Fornecedor</label><span>${escapeHtmlRelatorio(params.fornecedor)}</span></div>
    <div class="rir-fld rir-doc-campos__proc"><label>Nº Procedimento</label><span>${escapeHtmlRelatorio(params.procedimento)}</span></div>
    <div class="rir-fld rir-doc-campos__rom"><label>Nº Romaneio</label><span>${escapeHtmlRelatorio(params.romaneio) || '—'}</span></div>
    <div class="rir-fld rir-doc-campos__sol"><label>Sol. compra / Pack-list</label><span>${params.solCompra ? escapeHtmlRelatorio(params.solCompra) : '—'}</span></div>
    <div class="rir-fld rir-doc-campos__full"><label>Obs.</label><span>${escapeHtmlRelatorio(params.obsCurta) || '—'}</span></div>
  </div>
  <div class="rir-classic-bar">Material recebido (nota fiscal)</div>`;
}

/**
 * Relatorio RIR — layout original; cabecalho sobe levemente e repete em cada folha na impressao.
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
  const emitidoEm = formatDateTimePt();

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

  const escopoLinha = [clienteNome, projetoNome].filter(Boolean).join(' · ') || '—';
  const refReceb = r.recebimentoId ? escapeHtmlRelatorio(r.recebimentoId) : '—';

  const cabecalhoRepetivel = montarBlocoCabecalhoRirRepetivel({
    logoBlock,
    escopoLinha,
    localCfg,
    codigo: r.codigo,
    dataRegistro: formatDatePt(r.dataRegistro),
    emitidoEm,
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
  font-size: 10.5pt;
  line-height: 1.45;
  background: #f1f5f9;
  padding: 14px;
  max-width: 960px;
  margin: 0 auto;
  text-rendering: geometricPrecision;
  font-synthesis: none;
  font-variant-ligatures: no-common-ligatures;
  -webkit-text-stroke: 0;
}
.rir-doc--classic * { box-sizing: border-box; }
.rir-doc-inner {
  background: #fff;
  border: 1px solid #334155;
  padding: 14px 18px 18px;
}
.rir-classic-top {
  display: grid;
  grid-template-columns: minmax(120px, 210px) minmax(0, 1fr) minmax(108px, 168px);
  gap: 10px 14px;
  align-items: start;
  border-bottom: 2px solid #0f172a;
  padding-bottom: 8px;
  margin-bottom: 0;
}
.rir-brand {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  min-width: 0;
  max-width: 210px;
}
.rir-logo {
  display: block;
  max-height: 58px;
  max-width: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
}
.rir-brand-fallback { font-size: 16px; font-weight: 700; color: #0f172a; letter-spacing: normal; }
.rir-title-block {
  text-align: center;
  padding: 2px 4px;
  min-width: 0;
  overflow-wrap: anywhere;
  word-wrap: break-word;
}
.rir-title-main {
  margin: 0;
  font-size: 11pt;
  font-weight: 600;
  letter-spacing: 0.01em;
  text-transform: none;
  color: #0f172a;
  line-height: 1.3;
}
.rir-title-sub {
  margin: 4px 0 0 0;
  font-size: 11px;
  color: #475569;
  line-height: 1.35;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.rir-meta-box {
  font-size: 11px;
  text-align: right;
  line-height: 1.45;
  color: #334155;
  min-width: 0;
}
.rir-meta-box strong {
  display: block;
  font-size: 9px;
  letter-spacing: 0.02em;
  text-transform: none;
  color: #64748b;
  margin-bottom: 1px;
  font-weight: 600;
}
.rir-meta-line { margin-top: 5px; }
.rir-pagenum::before { content: "—"; }
.rir-classic-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px 12px;
  margin-top: 8px;
  font-size: 11px;
}
.rir-fld label {
  display: block;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: none;
  color: #64748b;
  margin-bottom: 2px;
}
.rir-fld span {
  font-size: 12px;
  font-weight: 400;
  color: #0f172a;
  word-break: break-word;
  line-height: 1.4;
}
.rir-doc-campos {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
  gap: 5px 18px;
  margin-top: 0;
  font-size: 11px;
  align-items: start;
  max-width: 32rem;
  width: 100%;
}
.rir-doc-campos__nf { grid-column: 1; grid-row: 1; }
.rir-doc-campos__forn { grid-column: 2; grid-row: 1; }
.rir-doc-campos__proc { grid-column: 1; grid-row: 2; }
.rir-doc-campos__rom { grid-column: 2; grid-row: 2; }
.rir-doc-campos__sol { grid-column: 1; grid-row: 3; }
.rir-doc-campos__full { grid-column: 1 / -1; grid-row: 4; }
.rir-classic-bar {
  margin: 10px 0 6px 0;
  padding: 6px 10px;
  background: #e5e7eb;
  border: 1px solid #94a3b8;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: none;
  color: #1e293b;
  font-family: Tahoma, 'Segoe UI', Verdana, Arial, sans-serif;
}
.rir-ins-row { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; margin-top: 6px; font-size: 11px; }
.rir-ins-label {
  font-weight: 600;
  font-size: 10px;
  letter-spacing: 0.02em;
  color: #475569;
}
.rir-pill { display: inline-flex; align-items: center; gap: 4px; padding: 2px 0; font-weight: 500; }
.rir-pill.ok { color: #047857; }
.rir-pill.off { color: #94a3b8; }
.rir-classic-table-wrap {
  margin: 0 0 12px;
  overflow: hidden;
  border: none;
  background: transparent;
}
.rir-classic-table {
  width: 100%;
  border-collapse: collapse;
  border-spacing: 0;
  font-size: 10.5px;
  border: 1px solid #334155;
  table-layout: auto;
  font-family: Tahoma, 'Segoe UI', Verdana, Arial, sans-serif;
}
.rir-thead-repeat-cell {
  padding: 0 0 4px 0 !important;
  border: none !important;
  background: #fff !important;
  vertical-align: top;
}
.rir-classic-table th {
  background: #e5e7eb;
  color: #0f172a;
  padding: 6px 8px;
  font-weight: 600;
  text-transform: none;
  letter-spacing: normal;
  font-size: 10px;
  border: 1px solid #64748b;
}
.rir-classic-table thead th:nth-child(1),
.rir-classic-table thead th:nth-child(3),
.rir-classic-table thead th:nth-child(4),
.rir-classic-table thead th:nth-child(6) {
  text-align: center;
}
.rir-classic-table thead th:nth-child(2),
.rir-classic-table thead th:nth-child(5) {
  text-align: left;
}
.rir-classic-table td {
  padding: 6px 8px;
  vertical-align: top;
  border: 1px solid #94a3b8;
  font-weight: 400;
}
.rir-classic-table tbody td:nth-child(1),
.rir-classic-table tbody td:nth-child(3),
.rir-classic-table tbody td:nth-child(4),
.rir-classic-table tbody td:nth-child(6) {
  text-align: center;
}
.rir-classic-table tbody td:nth-child(2),
.rir-classic-table tbody td:nth-child(5) {
  text-align: left;
}
.rir-c-item { width: 36px; font-weight: 500; }
.rir-c-q { font-variant-numeric: tabular-nums; width: 56px; }
.rir-c-desc { min-width: 200px; line-height: 1.45; word-break: break-word; font-weight: 400; }
.rir-c-cert { min-width: 88px; font-weight: 400; }
.rir-empty-row { text-align: center; color: #94a3b8; padding: 16px !important; font-style: italic; }
.rir-block {
  border: 1px solid #cbd5e1;
  padding: 10px 12px;
  margin: 8px 0;
  background: #fafafa;
  font-size: 11px;
  line-height: 1.55;
  white-space: pre-wrap;
}
.rir-block h3 {
  margin: 0 0 6px 0;
  font-size: 9px;
  text-transform: none;
  letter-spacing: 0.02em;
  color: #475569;
  font-weight: 600;
}
.rir-laudo-wrap { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-top: 8px; }
.rir-laudo-badge { padding: 10px 16px; border-radius: 8px; font-weight: 600; font-size: 12px; display: inline-block; }
.rir-laudo-badge.aprovado { background: #ecfdf5; color: #047857; border: 2px solid #34d399; }
.rir-laudo-badge.reprovado { background: #fef2f2; color: #b91c1c; border: 2px solid #f87171; }
.rir-laudo-badge.obs { background: #fffbeb; color: #b45309; border: 2px solid #fcd34d; }
.rir-laudo-note { font-size: 11px; color: #64748b; margin: 0; max-width: 480px; line-height: 1.45; }
.rir-sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 28px; page-break-inside: avoid; }
.rir-sign > div { text-align: center; }
.rir-sign .line { border-top: 1px dashed #64748b; margin: 36px 8px 8px 8px; }
.rir-sign .role {
  font-size: 9px;
  text-transform: none;
  letter-spacing: 0.02em;
  color: #64748b;
  font-weight: 600;
}
.rir-sign .nome { font-size: 12px; margin-top: 6px; color: #0f172a; font-weight: 500; }
.rir-sign .data { font-size: 10px; color: #94a3b8; margin-top: 3px; }
.rir-foot {
  margin-top: 22px;
  padding-top: 10px;
  border-top: 1px solid #cbd5e1;
  font-size: 9px;
  color: #94a3b8;
  line-height: 1.45;
}
.rir-strip-mini {
  font-size: 10px;
  color: #475569;
  margin: 8px 0 0;
  padding: 6px 8px;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
}
.rir-print-main { display: block; width: 100%; }
.rir-print-sign-foot { display: block; }
@media print {
  @page {
    size: A4;
    margin: 10mm 11mm 14mm 11mm;
    @bottom-center {
      content: "Página " counter(page) " de " counter(pages);
      font-size: 8pt;
      font-family: Tahoma, 'Segoe UI', Verdana, Arial, sans-serif;
      color: #64748b;
    }
  }
  html,
  body.rir-print-body {
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
    font-size: 10.5pt !important;
    font-family: Tahoma, 'Segoe UI', Verdana, Arial, sans-serif !important;
    text-rendering: geometricPrecision !important;
    font-synthesis: none !important;
    margin: 0 !important;
  }
  .rir-pagenum::before {
    content: counter(page) " / " counter(pages);
  }
  .rir-classic-table thead {
    display: table-header-group;
  }
  .rir-classic-table td {
    font-weight: 400 !important;
  }
  .rir-classic-table th {
    font-weight: 600 !important;
  }
  .rir-classic-table .rir-c-item {
    font-weight: 500 !important;
  }
  .rir-doc-inner {
    border: none !important;
    padding: 14px 14px 10px !important;
    box-shadow: none !important;
    width: 100% !important;
    max-width: none !important;
  }
  .rir-classic-top {
    grid-template-columns: minmax(120px, 210px) minmax(0, 1fr) minmax(108px, 168px) !important;
    gap: 10px 14px !important;
  }
  .rir-title-block {
    min-width: 0 !important;
  }
  .rir-brand {
    max-width: 210px !important;
  }
  .rir-classic-top,
  .rir-meta-box,
  .rir-classic-bar,
  .rir-block,
  .rir-strip-mini,
  .rir-doc-campos,
  .rir-classic-table th,
  .rir-classic-table td,
  .rir-laudo-badge {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .rir-classic-grid {
    width: 100%;
  }
  .rir-doc-campos {
    max-width: 32rem;
    width: 100%;
  }
  .rir-classic-table tbody tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .rir-classic-table-wrap {
    overflow: visible !important;
  }
  .rir-classic-table {
    width: 100% !important;
    border-collapse: collapse !important;
    border-spacing: 0 !important;
    border: 1px solid #334155 !important;
    font-size: 10.5px !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .rir-classic-table th,
  .rir-classic-table td {
    border: 1px solid #94a3b8 !important;
  }
  .rir-classic-table th {
    border-color: #64748b !important;
  }
  .rir-thead-repeat-cell {
    border: none !important;
  }
  .rir-classic-bar {
    margin: 8px 0 5px 0 !important;
    padding: 5px 8px !important;
  }
  .rir-block {
    margin: 6px 0 !important;
    padding: 8px 10px !important;
  }
  .rir-laudo-wrap {
    margin-top: 6px !important;
  }
  .rir-strip-mini {
    margin-top: 6px !important;
    padding: 4px 6px !important;
  }
  .rir-sign {
    margin-top: 14px !important;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .rir-sign .line {
    margin: 22px 8px 6px 8px !important;
  }
  .rir-foot {
    margin-top: 8px !important;
    padding-top: 8px !important;
    page-break-before: avoid !important;
    break-before: avoid !important;
  }
  .rir-print-sign-foot {
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }
}
</style>
<div class="rir-doc-inner">
  <div class="rir-print-main">
  <div class="rir-classic-table-wrap">
    <table class="rir-classic-table">
      <thead>
        <tr class="rir-thead-repeat">
          <td colspan="6" class="rir-thead-repeat-cell">${cabecalhoRepetivel}</td>
        </tr>
        <tr>
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
  </div>

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
    <strong>Rastreio:</strong> ID recebimento ${refReceb} · ID RIR ${escapeHtmlRelatorio(r.id)} · Estado: ${escapeHtmlRelatorio(statusTxt)} · Relatório v${DOC_VERSION}
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
