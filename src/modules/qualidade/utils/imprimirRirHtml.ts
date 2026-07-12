import { montarDocumentoHtmlInstitucionalPaged } from '../../../lib/relatorioPagedDocument';
import type { RelatorioPdfMeta } from '../../../lib/relatorioPdfMeta';
import {
  abrirPreVisualizacaoHtmlRelatorio,
  escapeHtmlRelatorio,
  segmentoInstituicaoRodapeEletronico,
} from '../../../lib/htmlRelatorioInstitucional';
import { resolverUrlLogoInstitucionalParaHtmlImpresso } from '../../../lib/logoInstitucional';
import { LOGO_INSTITUCIONAL_PADRAO_FABRICA } from '../../../lib/logoInstitucional.constants';
import { LOGO_INSTITUCIONAL_PRINT_PNG } from '../pdf/rirPdfLogo';
import { readConfiguracoes } from '../../configuracoes/services/configuracoes.service';
import type { RirRegistro } from '../types/qualidade.types';
import { rirObraDefaultsFromConfig } from './rirConfigDefaults';
import { formatarDisciplinaExibicaoRir, resolverDisciplinaRir } from './rirDisciplina';
import { formatarQuantidadeRir } from './rirDescricaoCompacta';

/** v73 — fluxo contínuo; rodapé na tabela para repetir cabeçalho na folha de assinaturas. */
const DOC_VERSION = '73';

export type CabecalhoRirParams = {
  logoBlock: string;
  escopoLinha: string;
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
  disciplina: string;
  obsCurta: string;
  inspecaoQuantitativa: boolean;
  inspecaoQualitativa: boolean;
  inspecaoDimensional: boolean;
  folhaAtual?: number;
  totalFolhas?: number;
};

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
  if (l === 'reprovado') return 'REPROVADO';
  if (l === 'observacoes') return 'APROVADO CONFORME OBSERVAÇÕES';
  return 'APROVADO';
}

function laudoClasseCss(l: RirRegistro['laudo']): string {
  if (l === 'reprovado') return 'rir-laudo-pill--reprovado';
  if (l === 'observacoes') return 'rir-laudo-pill--obs';
  return 'rir-laudo-pill--aprovado';
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

function mkTagInspecao(label: string, on: boolean): string {
  return `<span class="rir-tag${on ? ' rir-tag--on' : ' rir-tag--off'}">${on ? '✓' : '☐'} ${label}</span>`;
}

function folhaMetaHtml(params: CabecalhoRirParams): string {
  const folha =
    params.folhaAtual && params.totalFolhas
      ? `<div class="rir-hdr-date">Folha: <strong>${params.folhaAtual}/${params.totalFolhas}</strong></div>`
      : '';
  return `<div class="rir-hdr-meta">
      <div class="rir-hdr-rir-num">${escapeHtmlRelatorio(params.codigo)}</div>
      <div class="rir-hdr-date">Data: ${escapeHtmlRelatorio(params.dataRegistro)}</div>
      <div class="rir-hdr-date">Emitido: ${escapeHtmlRelatorio(params.emitidoEm)}</div>
      ${folha}
    </div>`;
}

/** Faixa titulo (logo + titulo + meta) — padrão INS institucional. */
export function montarFaixaTituloInstitucionalRirHtml(params: CabecalhoRirParams): string {
  return `<header class="rir-hdr">
    <div class="rir-hdr-logo">${params.logoBlock}</div>
    <div class="rir-hdr-title">
      <h1>RELATÓRIO DE INSPEÇÃO DE RECEBIMENTO</h1>
      <div class="rir-hdr-badge">RIR · ${escapeHtmlRelatorio(params.escopoLinha)}</div>
    </div>
    ${folhaMetaHtml(params)}
  </header>`;
}

function montarCelulaInfoRir(label: string, valor: string): string {
  return `<div class="rir-info-cell"><span class="rir-info-label">${escapeHtmlRelatorio(label)}</span><span class="rir-info-value">${valor || '—'}</span></div>`;
}

function montarBlocoInfoRir(params: CabecalhoRirParams): string {
  const obsHtml = params.obsCurta.trim()
    ? `<div class="rir-info-cell rir-info-cell--full"><span class="rir-info-label">Obs.</span><span class="rir-info-value">${escapeHtmlRelatorio(params.obsCurta)}</span></div>`
    : '';
  return `<div class="rir-info-grid">
    ${montarCelulaInfoRir('UO (Obra/Depto)', escapeHtmlRelatorio(params.uoExibir))}
    ${montarCelulaInfoRir('Local', escapeHtmlRelatorio(params.localExibir))}
    ${montarCelulaInfoRir('Contrato', escapeHtmlRelatorio(params.contratoExibir))}
    ${montarCelulaInfoRir('Nota Fiscal', escapeHtmlRelatorio(params.nf))}
    ${montarCelulaInfoRir('Fornecedor', escapeHtmlRelatorio(params.fornecedor))}
    ${montarCelulaInfoRir('Romaneio', escapeHtmlRelatorio(params.romaneio))}
    ${montarCelulaInfoRir('Nº Procedimento', escapeHtmlRelatorio(params.procedimento))}
    ${montarCelulaInfoRir('Sol. compra / Pack-list', params.solCompra ? escapeHtmlRelatorio(params.solCompra) : '—')}
    ${montarCelulaInfoRir('Disciplina', escapeHtmlRelatorio(params.disciplina))}
    ${obsHtml}
  </div>
  <div class="rir-inspecao-tags">
    ${mkTagInspecao('Quantitativa', params.inspecaoQuantitativa)}
    ${mkTagInspecao('Qualitativa', params.inspecaoQualitativa)}
    ${mkTagInspecao('Dimensional', params.inspecaoDimensional)}
  </div>`;
}

/** Folha 1 — cabeçalho completo agrupado. */
export function montarCabecalhoInspecaoRirHtml(params: CabecalhoRirParams): string {
  return `${montarFaixaTituloInstitucionalRirHtml(params)}${montarBlocoInfoRir(params)}`;
}

/** Folhas 2+ — cabeçalho compacto (menos espaço vertical). */
export function montarCabecalhoFolhaContinuacaoRirHtml(params: CabecalhoRirParams): string {
  const folha =
    params.folhaAtual && params.totalFolhas
      ? `<div class="rir-hdr-date">Folha <strong>${params.folhaAtual}/${params.totalFolhas}</strong></div>`
      : '';
  return `<header class="rir-hdr rir-hdr--compact">
    <div class="rir-hdr-logo">${params.logoBlock}</div>
    <div class="rir-hdr-title rir-hdr-title--compact">
      <h1>${escapeHtmlRelatorio(params.codigo)}</h1>
      <p>NF ${escapeHtmlRelatorio(params.nf) || '—'} · ${escapeHtmlRelatorio(params.fornecedor)} · ${escapeHtmlRelatorio(params.localExibir) || '—'}</p>
    </div>
    <div class="rir-hdr-meta">
      ${folha}
      <div class="rir-hdr-date">Data: ${escapeHtmlRelatorio(params.dataRegistro)}</div>
    </div>
  </header>`;
}

function montarLinhasTabelaRir(itens: NonNullable<RirRegistro['itensRir']>, indiceInicial: number): string {
  if (itens.length === 0) {
    return '<tr><td colspan="6" class="rir-empty-row">Nenhum item registrado neste relatório.</td></tr>';
  }
  return itens
    .map(
      (it, i) => `<tr class="rir-item-row">
      <td class="rir-c-item">${indiceInicial + i + 1}</td>
      <td class="rir-c-cod">${escapeHtmlRelatorio(it.codigoMaterial)}</td>
      <td class="rir-c-desc">${escapeHtmlRelatorio(it.descricaoMaterial).replace(/\n/g, '<br>')}</td>
      <td class="rir-c-q">${escapeHtmlRelatorio(formatarQuantidadeRir(it.quantidade))}</td>
      <td class="rir-c-u">${escapeHtmlRelatorio(it.unidade)}</td>
      <td class="rir-c-cert">${escapeHtmlRelatorio((it.certificado || 'N/A').trim() || 'N/A')}</td>
    </tr>`,
    )
    .join('');
}

/** Thead: colunas (sem grade vertical). */
export function montarTheadRirInspecao(): string {
  return `<tr class="rir-thead-cols">
    <th scope="col">Item</th>
    <th scope="col">Código</th>
    <th scope="col">Descrição</th>
    <th scope="col">Qtd.</th>
    <th scope="col">Unid.</th>
    <th scope="col">Certificado</th>
  </tr>`;
}

function montarTabelaMaterialRir(cabecalhoHtml: string, linhas: string, rodapeHtml: string): string {
  const linhaRodape = `<tr class="rir-footer-row">
    <td colspan="6" class="rir-footer-cell">${rodapeHtml}</td>
  </tr>`;
  return `<div class="rir-table-wrap">
    <table class="rir-table">
      <colgroup>
        <col class="rir-col-item" />
        <col class="rir-col-cod" />
        <col class="rir-col-desc" />
        <col class="rir-col-q" />
        <col class="rir-col-u" />
        <col class="rir-col-cert" />
      </colgroup>
      <thead>
        <tr class="rir-thead-repeat">
          <td colspan="6" class="rir-thead-repeat-cell">${cabecalhoHtml}</td>
        </tr>
        ${montarTheadRirInspecao()}
      </thead>
      <tbody>${linhas}${linhaRodape}</tbody>
    </table>
  </div>`;
}

function montarRodapeRir(params: {
  r: RirRegistro;
  laudo: RirRegistro['laudo'];
  laudoTxt: string;
  statusTxt: string;
  refReceb: string;
  segRodapeInst: string;
}): string {
  const { r, laudo, laudoTxt, statusTxt, refReceb, segRodapeInst } = params;
  const obs = escapeHtmlRelatorio(r.observacoesQc || '—');
  return `<div class="rir-print-tail">
  <div class="rir-laudo-block">
    <div class="rir-laudo-pill ${laudoClasseCss(laudo)}"><span>${escapeHtmlRelatorio(laudoTxt)}</span></div>
    <div class="rir-laudo-box">
      <div class="rir-laudo-obs">
        <strong>Observações da inspeção:</strong>
        <p>${obs.replace(/\n/g, '<br>')}</p>
      </div>
    </div>
  </div>
  <div class="rir-trace">
    <strong>Rastreabilidade:</strong>
    ID recebimento <code>${refReceb}</code>
    · ID RIR <code>${escapeHtmlRelatorio(r.id)}</code>
    · Estado: <strong>${escapeHtmlRelatorio(statusTxt)}</strong>
    · Relatório v${DOC_VERSION}
  </div>
  <div class="rir-signatures">
    <div class="rir-sign-card">
      <div class="rir-sign-space"></div>
      <div class="rir-sign-line"></div>
      <div class="rir-sign-role">Responsável — recebimento</div>
      <div class="rir-sign-name">${escapeHtmlRelatorio(r.assinaturaRecebimento.nome)}</div>
      <div class="rir-sign-date">${r.assinaturaRecebimento.data ? formatDatePt(r.assinaturaRecebimento.data) : '—'}</div>
    </div>
    <div class="rir-sign-card">
      <div class="rir-sign-space"></div>
      <div class="rir-sign-line"></div>
      <div class="rir-sign-role">Controle de qualidade</div>
      <div class="rir-sign-name">${escapeHtmlRelatorio(r.assinaturaCq.nome)}</div>
      <div class="rir-sign-date">${r.assinaturaCq.data ? formatDatePt(r.assinaturaCq.data) : '—'}</div>
    </div>
    <div class="rir-sign-card">
      <div class="rir-sign-space"></div>
      <div class="rir-sign-line"></div>
      <div class="rir-sign-role">Cliente</div>
      <div class="rir-sign-name">${escapeHtmlRelatorio(r.assinaturaCliente.nome)}</div>
      <div class="rir-sign-date">${r.assinaturaCliente.data ? formatDatePt(r.assinaturaCliente.data) : '—'}</div>
    </div>
  </div>
  <div class="rir-doc-foot">
    Documento gerado eletronicamente pelo I.S.O PRO Desktop${segRodapeInst}. Conteúdo para arquivo e auditoria. Referência: ${escapeHtmlRelatorio(r.codigo)}.
  </div>
</div>`;
}

function cssEstilosRelatorioRir(): string {
  return `
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@page {
  size: A4;
  margin: 7.5mm 7.5mm 10mm 7.5mm;
}
body.rir-print-body,
body.rir-print-body.iso-report-native-body {
  margin: 0 !important;
  padding: 0 !important;
  width: 100%;
  font-family: 'Segoe UI', Inter, system-ui, -apple-system, sans-serif;
  color: #0f172a;
  font-size: 9pt;
  line-height: 1.2;
}
.rir-doc { max-width: none; width: 100%; margin: 0; padding: 0; }
.rir-doc * { box-sizing: border-box; }
.rir-print-main { display: block; width: 100%; }
.rir-thead-repeat-cell {
  padding: 0 !important;
  border: none !important;
  background: #fff !important;
  vertical-align: top;
}
.rir-hdr {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  flex-wrap: nowrap;
  padding-bottom: 8px;
  margin-bottom: 4mm;
  border-bottom: 2px solid #0f172a;
}
.rir-hdr--compact {
  margin-bottom: 2mm;
  padding-bottom: 5px;
  border-bottom-color: #e2e8f0;
}
.rir-hdr-logo { flex: 0 0 auto; max-width: 170px; min-width: 80px; }
.rir-logo-badge {
  display: inline-block;
  background: #0f172a;
  border-radius: 8px;
  padding: 6px 10px 5px;
  line-height: 1.1;
}
.rir-logo-badge--img { background: transparent; padding: 0; border-radius: 0; }
.rir-logo-iso { color: #fff; font-weight: 800; font-size: 11pt; letter-spacing: 0.05em; white-space: nowrap; }
.rir-logo-pro { color: #22c55e; }
.rir-logo-sep { color: #64748b; margin: 0 1px; font-weight: 600; }
.rir-logo-sub { display: block; color: #22c55e; font-size: 7pt; font-weight: 700; margin-top: 2px; letter-spacing: 0.03em; }
.rir-logo-img { display: block; height: 44px; width: auto; max-width: 165px; object-fit: contain; }
.rir-hdr-title { flex: 1 1 220px; text-align: center; min-width: 0; }
.rir-hdr-title h1 {
  margin: 0;
  font-size: 11pt;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #0f172a;
  line-height: 1.2;
}
.rir-hdr-badge {
  margin-top: 4px;
  display: inline-block;
  background: #dbeafe;
  color: #1e40af;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 8pt;
  font-weight: 600;
  max-width: 100%;
  line-height: 1.35;
}
.rir-hdr-title--compact h1 { font-size: 11pt; text-transform: none; font-weight: 700; }
.rir-hdr-title--compact p {
  margin: 3px 0 0;
  font-size: 9pt;
  color: #475569;
  font-weight: 500;
  line-height: 1.3;
}
.rir-hdr-meta { flex: 0 0 auto; text-align: right; min-width: 110px; }
.rir-hdr-rir-num { font-weight: 800; font-size: 11pt; color: #2563eb; line-height: 1.2; }
.rir-hdr-date { font-size: 8.5pt; color: #64748b; margin-top: 2px; line-height: 1.3; }
.rir-hdr-date strong { color: #0f172a; }
.rir-info-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px 10px;
  background: #f8fafc;
  padding: 6px 10px;
  border-radius: 6px;
  margin-bottom: 3mm;
  border: 1px solid #e2e8f0;
}
.rir-info-cell { display: flex; flex-direction: column; min-width: 0; }
.rir-info-cell--full { grid-column: 1 / -1; }
.rir-info-label {
  font-size: 7pt;
  font-weight: 700;
  text-transform: uppercase;
  color: #64748b;
  letter-spacing: 0.04em;
  line-height: 1.2;
}
.rir-info-value {
  font-size: 9pt;
  font-weight: 600;
  color: #0f172a;
  margin-top: 1px;
  word-break: break-word;
  line-height: 1.25;
}
.rir-inspecao-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
  align-items: center;
}
.rir-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 8.5pt;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  background: #f1f5f9;
  padding: 3px 10px;
  border-radius: 4px;
  color: #64748b;
}
.rir-tag--on { background: #dcfce7; color: #166534; }
.rir-tag--off { background: #fff; color: #94a3b8; border: 1px solid #e2e8f0; }
.rir-table-wrap {
  overflow: visible;
  width: 100%;
  max-width: 100%;
  margin-bottom: 4px;
}
.rir-table {
  width: 100%;
  max-width: 100%;
  border-collapse: collapse;
  font-size: 9pt;
  table-layout: fixed;
}
.rir-col-item { width: 6%; }
.rir-col-cod { width: 16%; }
.rir-col-desc { width: 45%; }
.rir-col-q { width: 9%; }
.rir-col-u { width: 7%; }
.rir-col-cert { width: 17%; }
.rir-table thead tr.rir-thead-cols th {
  background: #0f172a !important;
  color: #fff !important;
  padding: 8px 10px !important;
  font-weight: 600;
  font-size: 8pt;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border: none !important;
}
.rir-table thead tr.rir-thead-cols th:nth-child(1),
.rir-table thead tr.rir-thead-cols th:nth-child(5) { text-align: center; }
.rir-table thead tr.rir-thead-cols th:nth-child(1) {
  padding-left: 5px !important;
  padding-right: 5px !important;
}
.rir-table thead tr.rir-thead-cols th:nth-child(4) { text-align: right; }
.rir-table td,
.rir-table th {
  padding: 7px 10px;
  border: none;
  border-bottom: 1px solid #e2e8f0;
}
.rir-table td {
  color: #334155;
  vertical-align: middle;
  line-height: 1.35;
  white-space: normal;
  word-break: break-word;
  overflow-wrap: anywhere;
}
.rir-table tbody tr.rir-item-row:nth-child(even) { background: #f8fafc; }
.rir-table tbody tr.rir-item-row {
  break-inside: avoid;
  page-break-inside: avoid;
}
.rir-footer-cell {
  padding: 12px 0 0 !important;
  border: none !important;
  border-bottom: none !important;
  vertical-align: top;
  background: #fff !important;
}
.rir-table tbody tr.rir-footer-row {
  break-inside: avoid;
  page-break-inside: avoid;
}
.rir-table tbody td.rir-c-item,
.rir-table tbody td.rir-c-u { text-align: center; }
.rir-table tbody td.rir-c-q { text-align: right; font-variant-numeric: tabular-nums; }
.rir-c-item {
  font-weight: 600;
  color: #64748b;
  font-size: 9pt;
  white-space: nowrap;
  word-break: normal;
  overflow-wrap: normal;
  font-variant-numeric: tabular-nums;
  padding-left: 5px !important;
  padding-right: 5px !important;
}
.rir-c-q { font-weight: 600; color: #0f172a; font-size: 9pt; }
.rir-c-u { font-size: 9pt; color: #64748b; }
.rir-c-desc {
  line-height: 1.3;
  font-size: 8.5pt;
  font-weight: 400;
  vertical-align: top;
  word-break: break-word;
  overflow-wrap: anywhere;
}
.rir-c-cod {
  font-weight: 600;
  color: #0f172a;
  font-size: 8.5pt;
  line-height: 1.25;
  word-break: break-all;
  vertical-align: top;
}
.rir-c-cert {
  font-weight: 600;
  color: #0f172a;
  font-size: 8.5pt;
  line-height: 1.25;
  word-break: break-all;
  vertical-align: top;
}
.rir-norms-disclaimer { display: none; }
.rir-empty-row { text-align: center; color: #94a3b8; padding: 12px !important; font-style: italic; }
.rir-laudo-block {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 5px;
  break-inside: avoid;
  page-break-inside: avoid;
}
.rir-laudo-box {
  width: 100%;
  background: #fefce8;
  border: 1px solid #fde047;
  border-radius: 8px;
  padding: 7px 10px;
}
.rir-laudo-obs { min-width: 0; }
.rir-laudo-obs strong { font-size: 9.5pt; color: #854d0e; display: block; margin-bottom: 2px; }
.rir-laudo-obs p { margin: 0; font-size: 9pt; color: #854d0e; line-height: 1.35; white-space: pre-wrap; }
.rir-laudo-pill {
  text-align: center;
  padding: 4px 14px;
  border-radius: 20px;
  flex-shrink: 0;
  break-inside: avoid;
  page-break-inside: avoid;
}
.rir-laudo-pill span { color: #fff; font-weight: 800; font-size: 8.5pt; letter-spacing: 0.02em; line-height: 1.2; }
.rir-laudo-pill--aprovado { background: #16a34a; }
.rir-laudo-pill--reprovado { background: #dc2626; }
.rir-laudo-pill--obs { background: #d97706; }
.rir-trace {
  background: #f1f5f9;
  padding: 5px 8px;
  border-radius: 6px;
  margin-top: 6px;
  font-size: 8.5pt;
  color: #475569;
  border-left: 4px solid #2563eb;
}
.rir-trace code { font-family: ui-monospace, monospace; background: #e2e8f0; padding: 1px 4px; border-radius: 3px; font-size: 7.5pt; }
.rir-signatures {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 8px;
  padding-bottom: 3px;
  border-bottom: 2px solid #2563eb;
  break-inside: avoid;
  page-break-inside: avoid;
}
.rir-sign-card { text-align: center; padding: 0 6px 2px; }
.rir-sign-space { min-height: 38px; }
.rir-sign-line { width: 88%; border-top: 1px dashed #94a3b8; margin: 0 auto 6px; }
.rir-sign-role { font-size: 9pt; font-weight: 700; color: #2563eb; margin-bottom: 4px; }
.rir-sign-name { font-weight: 800; font-size: 10.5pt; color: #0f172a; margin-bottom: 3px; }
.rir-sign-date { font-size: 8.5pt; color: #64748b; }
.rir-doc-foot { margin-top: 4px; margin-bottom: 0; font-size: 7.5pt; color: #94a3b8; text-align: center; line-height: 1.35; }
.rir-print-tail {
  margin-top: 6px;
  padding-top: 4px;
  padding-bottom: 0;
}
@media print {
  .iso-pro-doc-preview-toolbar { display: none !important; }
  body.rir-print-body,
  body.rir-print-body.iso-report-native-body {
    margin: 0 !important;
    padding: 0 !important;
    width: 100% !important;
  }
  .rir-doc {
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    box-sizing: border-box;
  }
  .rir-table thead {
    display: table-header-group;
  }
  .rir-footer-cell {
    border: none !important;
    background: #fff !important;
    padding-bottom: 0 !important;
  }
  .rir-table tbody tr.rir-footer-row {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .rir-table thead tr.rir-thead-cols th {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .rir-table tbody tr.rir-item-row:nth-child(even) {
    background: #f8fafc !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .rir-signatures {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .rir-laudo-block {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .rir-tag--on {
    background: #dcfce7 !important;
    color: #166534 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .rir-table-wrap {
    overflow: visible !important;
    border: none;
    border-radius: 0;
    width: 100%;
  }
  script { display: none !important; }
}
@media screen {
  .rir-doc {
    max-width: 210mm;
    margin: 0 auto 18px;
    padding: 12mm 10mm 14mm;
    background: #fff;
    box-shadow: 0 6px 20px rgba(15, 23, 42, 0.14);
    box-sizing: border-box;
  }
}
`;
}

function isLogoFabricaOuSemCustom(url: string): boolean {
  const u = url.toLowerCase();
  if (!u) return true;
  return (
    u.includes('logo-institutional') ||
    u.endsWith(LOGO_INSTITUCIONAL_PADRAO_FABRICA.replace('./', ''))
  );
}

function montarLogoBlockRir(paraPdf: boolean): string {
  const texto = `<div class="rir-logo-badge"><span class="rir-logo-iso">I · S · O <span class="rir-logo-sep">|</span> <span class="rir-logo-pro">PRO</span></span><small class="rir-logo-sub">GESTÃO DE MATERIAIS</small></div>`;
  const logo = resolverUrlLogoInstitucionalParaHtmlImpresso();
  if (!logo && !paraPdf) return texto;
  if (logo.startsWith('data:')) {
    return `<div class="rir-logo-badge rir-logo-badge--img"><img class="rir-logo-img" src="${escapeHtmlRelatorio(logo)}" alt="Logo" decoding="async" /></div>`;
  }
  if (paraPdf) {
    if (/^https?:/i.test(logo)) return texto;
    if (isLogoFabricaOuSemCustom(logo)) {
      return `<div class="rir-logo-badge rir-logo-badge--img"><img class="rir-logo-img" src="${LOGO_INSTITUCIONAL_PRINT_PNG}" alt="Logo I.S.O PRO" decoding="async" /></div>`;
    }
    return texto;
  }
  if (logo) {
    return `<div class="rir-logo-badge rir-logo-badge--img"><img class="rir-logo-img" src="${escapeHtmlRelatorio(logo)}" alt="Logo" decoding="async" /></div>`;
  }
  return texto;
}

function montarConteudoRir(r: RirRegistro, opts?: { paraPdf?: boolean }): string {
  const paraPdf = opts?.paraPdf === true;
  const cfg = readConfiguracoes();
  const segRodapeInst = segmentoInstituicaoRodapeEletronico(cfg.documentoRodapeNome, cfg.documentoRodapeCnpj);
  const clienteNome = cfg.cliente || '';
  const projetoNome = cfg.projeto || '';
  const obCfg = rirObraDefaultsFromConfig(cfg);
  const uoExibir = (r.uo || '').trim() || obCfg.uo;
  const localExibir = (r.localObra || '').trim() || obCfg.localObra;
  const contratoExibir = (r.contratoNumero || '').trim() || obCfg.contratoNumero;
  const laudo = r.laudo || 'aprovado';
  const laudoTxt = laudoLabel(laudo);
  const statusTxt = statusTratativaLabel(r.status);
  const solCompra = (r.solCompraPackList ?? '').trim();
  const itens = r.itensRir ?? [];
  const disciplinaSigla =
    (r.disciplina ?? '').trim() ||
    resolverDisciplinaRir({
      procedimentoNumero: r.procedimentoNumero,
      codigo: r.codigo,
      itensRir: itens,
    });
  const disciplinaExibir = formatarDisciplinaExibicaoRir(disciplinaSigla);
  const logoBlock = montarLogoBlockRir(paraPdf);
  const escopoPartes = [clienteNome, projetoNome, uoExibir].filter((s) => !!String(s).trim());
  const escopoLinha =
    [...new Set(escopoPartes.map((s) => String(s).trim()))].join(' · ') || uoExibir || '—';
  const refReceb = r.recebimentoId ? escapeHtmlRelatorio(r.recebimentoId) : '—';

  const cabecalhoParams: CabecalhoRirParams = {
    logoBlock,
    escopoLinha,
    codigo: r.codigo,
    dataRegistro: formatDatePt(r.dataRegistro),
    emitidoEm: formatDateTimePt(),
    uoExibir,
    localExibir,
    contratoExibir,
    fornecedor: r.fornecedorNome,
    nf: r.recebimentoNotaFiscal ?? '',
    romaneio: r.recebimentoRomaneio ?? '',
    procedimento: r.procedimentoNumero,
    solCompra,
    disciplina: disciplinaExibir,
    obsCurta: r.obsCurta,
    inspecaoQuantitativa: !!r.inspecaoQuantitativa,
    inspecaoQualitativa: !!r.inspecaoQualitativa,
    inspecaoDimensional: !!r.inspecaoDimensional,
  };

  const cabecalho = montarCabecalhoInspecaoRirHtml(cabecalhoParams);
  const linhas = montarLinhasTabelaRir(itens, 0);
  const rodapeParams = { r, laudo, laudoTxt, statusTxt, refReceb, segRodapeInst };

  return `<div class="rir-doc" lang="pt-BR">
<div class="rir-print-main">
${montarTabelaMaterialRir(cabecalho, linhas, montarRodapeRir(rodapeParams))}
</div>
</div>`;
}

function montarPdfMetaRir(r: RirRegistro, escopoLinha: string): RelatorioPdfMeta {
  return {
    headerTitle: 'RELATÓRIO DE INSPEÇÃO DE RECEBIMENTO',
    headerSub: escopoLinha,
    headerCode: (r.codigo || '').trim() || '—',
    footerPrefix: 'Folha',
    footerOnly: true,
  };
}

export function montarDocumentoHtmlImpressaoRir(
  registro: RirRegistro,
  opts?: { paraPdf?: boolean },
): string {
  const codigo = (registro.codigo || '').trim() || '—';
  const cfg = readConfiguracoes();
  const clienteNome = cfg.cliente || '';
  const projetoNome = cfg.projeto || '';
  const obCfg = rirObraDefaultsFromConfig(cfg);
  const uoExibir = (registro.uo || '').trim() || obCfg.uo;
  const escopoPartes = [clienteNome, projetoNome, uoExibir].filter((s) => !!String(s).trim());
  const escopoLinha =
    [...new Set(escopoPartes.map((s) => String(s).trim()))].join(' · ') || uoExibir || '—';

  return montarDocumentoHtmlInstitucionalPaged({
    title: `I.S.O PRO — RIR ${codigo}`,
    bodyClass: 'rir-print-body',
    reportStyles: cssEstilosRelatorioRir(),
    contentHtml: montarConteudoRir(registro, { paraPdf: opts?.paraPdf }),
    usePagedJs: false,
    includeToolbar: !opts?.paraPdf,
    pdfMeta: montarPdfMetaRir(registro, escopoLinha),
  });
}

export function montarHtmlRelatorioRirCompleto(registro: RirRegistro): string {
  return montarDocumentoHtmlImpressaoRir(registro);
}

/** HTML optimizado para printToPDF / Playwright (sem barra de pré-visualização). */
export function montarHtmlRelatorioRirParaPdf(registro: RirRegistro): string {
  return montarDocumentoHtmlImpressaoRir(registro, { paraPdf: true });
}

/**
 * Motor oficial RIR — HTML institucional + paginação explícita + Chromium (Playwright / printToPDF).
 * Ver `imprimirRirPdf.ts`.
 */
export async function preVisualizarRirRelatorioHtmlLegado(
  registro: RirRegistro,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return abrirPreVisualizacaoHtmlRelatorio(montarDocumentoHtmlImpressaoRir(registro));
}
