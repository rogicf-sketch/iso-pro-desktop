import { montarDocumentoHtmlInstitucionalPaged } from '../../../lib/relatorioPagedDocument';
import type { RelatorioPdfMeta } from '../../../lib/relatorioPdfMeta';
import {
  abrirPreVisualizacaoHtmlRelatorio,
  cssFontesNotoRelatorioInline,
  escapeHtmlRelatorio,
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
import { LOGO_INSTITUCIONAL_PADRAO_FABRICA } from '../../../lib/logoInstitucional.constants';
import { LOGO_INSTITUCIONAL_PRINT_PNG } from '../pdf/rirPdfLogo';
import { readConfiguracoes } from '../../configuracoes/services/configuracoes.service';
import type { RirRegistro } from '../types/qualidade.types';
import { rirObraDefaultsFromConfig } from './rirConfigDefaults';
import { formatarDisciplinaExibicaoRir, resolverDisciplinaRir } from './rirDisciplina';
import { formatarQuantidadeRir } from './rirDescricaoCompacta';
import { juntarEscopoLinhaRir } from './rirEscopoLinha';

export { juntarEscopoLinhaRir } from './rirEscopoLinha';

/** v7 — rodapé controlado + QR de arquivo/auditoria. */
const DOC_VERSION = '7';

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

/** Faixa titulo (logo + titulo + meta) — marca premium v6. Repete em cada folha via thead. */
export function montarFaixaTituloInstitucionalRirHtml(params: CabecalhoRirParams): string {
  return `<header class="rir-hdr">
    <div class="rir-hdr-logo">${params.logoBlock}</div>
    <div class="rir-hdr-title">
      <p class="rir-hdr-eyebrow">Qualidade · Recebimento</p>
      <h1>Relatório de inspeção de recebimento</h1>
      <p class="rir-hdr-sub">Documento oficial de inspeção de materiais</p>
      <p class="rir-hdr-escopo">RIR · ${escapeHtmlRelatorio(params.escopoLinha)}</p>
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
  return `<div class="rir-context-wrap">
    <span class="rir-context-label">Contexto do recebimento</span>
    <div class="rir-info-grid">
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
  </div>
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
      <p class="rir-hdr-eyebrow">Qualidade · Recebimento</p>
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

function montarTabelaMaterialRir(
  faixaTituloHtml: string,
  blocoInfoHtml: string,
  linhas: string,
  rodapeHtml: string,
): string {
  const linhaRodape = `<tr class="rir-footer-row">
    <td colspan="6" class="rir-footer-cell">${rodapeHtml}</td>
  </tr>`;
  // Titulo no thead (repete em cada folha, como o modelo INS antigo).
  // Contexto do recebimento só na 1.ª folha (tbody), para não empurrar a tabela.
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
          <td colspan="6" class="rir-thead-repeat-cell">${faixaTituloHtml}</td>
        </tr>
        ${montarTheadRirInspecao()}
      </thead>
      <tbody>
        <tr class="rir-context-row">
          <td colspan="6" class="rir-context-cell">${blocoInfoHtml}</td>
        </tr>
        ${linhas}${linhaRodape}
      </tbody>
    </table>
  </div>`;
}

function montarRodapeRir(params: {
  r: RirRegistro;
  laudo: RirRegistro['laudo'];
  laudoTxt: string;
  statusTxt: string;
  refReceb: string;
  rodapeInstitucionalHtml: string;
}): string {
  const { r, laudo, laudoTxt, statusTxt, refReceb, rodapeInstitucionalHtml } = params;
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
  ${rodapeInstitucionalHtml}
</div>`;
}

function cssEstilosRelatorioRir(): string {
  return `
${cssLogoInstitucionalImpressaoDaConfig()}
${cssRodapeInstitucionalControle()}
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@page {
  size: A4;
  margin: 8mm 9mm 11mm 9mm;
}
body.rir-print-body,
body.rir-print-body.iso-report-native-body {
  margin: 0 !important;
  padding: 0 !important;
  width: 100%;
  font-family: 'Noto Sans', Arial, Helvetica, sans-serif;
  color: #1c1917;
  font-size: 9pt;
  line-height: 1.35;
  font-synthesis: none;
  text-rendering: geometricPrecision;
  -webkit-font-smoothing: auto;
  hyphens: none;
}
.rir-doc {
  max-width: none;
  width: 100%;
  margin: 0;
  padding: 0;
  position: relative;
}
.rir-doc::before {
  content: '';
  display: block;
  height: 3px;
  margin: 0 0 10px;
  border-radius: 2px;
  background: linear-gradient(90deg, #047857 0%, #86efac 42%, #1c1917 100%);
}
.rir-doc * { box-sizing: border-box; }
.rir-print-main { display: block; width: 100%; }
.rir-thead-repeat-cell {
  padding: 0 !important;
  border: none !important;
  background: #fff !important;
  vertical-align: top;
}
.rir-context-cell {
  padding: 0 !important;
  border: none !important;
  background: #fff !important;
  vertical-align: top;
}
.rir-context-row {
  break-inside: avoid;
  page-break-inside: avoid;
}
.rir-hdr {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: nowrap;
  padding-bottom: 10px;
  margin-bottom: 10px;
  border-bottom: 1px solid #d6d3d1;
}
.rir-hdr--compact {
  margin-bottom: 6px;
  padding-bottom: 6px;
}
.rir-hdr-logo { flex: 0 0 auto; max-width: var(--iso-logo-slot-w, 220px); min-width: 96px; }
.rir-logo-badge {
  display: inline-block;
  background: linear-gradient(135deg, #1c1917 0%, #292524 100%);
  border-radius: 3px;
  padding: 7px 11px 6px;
  line-height: 1.1;
  box-shadow: 0 1px 0 rgba(255,255,255,0.08) inset;
}
.rir-logo-badge--img { background: transparent; padding: 0; border-radius: 0; box-shadow: none; }
.rir-logo-iso { color: #fff; font-weight: 700; font-size: 10pt; letter-spacing: 0.08em; white-space: nowrap; }
.rir-logo-pro { color: #86efac; }
.rir-logo-sep { color: #a8a29e; margin: 0 2px; font-weight: 600; }
.rir-logo-sub { display: block; color: #86efac; font-size: 6.5pt; font-weight: 700; margin-top: 3px; letter-spacing: 0.06em; }
.rir-logo-img { display: block; width: auto; height: auto; max-width: var(--iso-logo-slot-w, 178px); max-height: var(--iso-logo-slot-h, 68px); object-fit: contain; }
.rir-hdr-title { flex: 1 1 220px; text-align: center; min-width: 0; }
.rir-hdr-eyebrow {
  margin: 0 0 5px;
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #047857;
}
.rir-hdr-title h1 {
  margin: 0;
  font-size: 12pt;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: #1c1917;
  line-height: 1.22;
  text-transform: none;
}
.rir-hdr-sub {
  margin: 5px 0 0;
  font-size: 7.5pt;
  font-weight: 400;
  color: #78716c;
}
.rir-hdr-escopo {
  margin: 6px 0 0;
  font-size: 7.5pt;
  font-weight: 600;
  color: #57534e;
  line-height: 1.35;
}
.rir-hdr-title--compact h1 { font-size: 11pt; font-weight: 700; }
.rir-hdr-title--compact p {
  margin: 3px 0 0;
  font-size: 8pt;
  color: #78716c;
  font-weight: 400;
  line-height: 1.3;
}
.rir-hdr-meta { flex: 0 0 auto; text-align: right; min-width: 118px; }
.rir-hdr-rir-num {
  font-weight: 700;
  font-size: 12pt;
  color: #1c1917;
  line-height: 1.2;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
}
.rir-hdr-date { font-size: 7.5pt; color: #78716c; margin-top: 4px; line-height: 1.35; }
.rir-hdr-date strong { color: #1c1917; }
.rir-context-wrap {
  margin: 0 0 10px;
  padding: 10px 12px;
  background: #fafaf9;
  border: 1px solid #e7e5e4;
  border-radius: 4px;
}
.rir-context-label {
  display: block;
  margin: 0 0 8px;
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #a8a29e;
}
.rir-info-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px 12px;
  background: transparent;
  padding: 0;
  border: none;
  margin: 0;
}
.rir-info-cell { display: flex; flex-direction: column; min-width: 0; }
.rir-info-cell--full { grid-column: 1 / -1; }
.rir-info-label {
  font-size: 7pt;
  font-weight: 700;
  text-transform: uppercase;
  color: #78716c;
  letter-spacing: 0.04em;
  line-height: 1.2;
}
.rir-info-value {
  font-size: 9pt;
  font-weight: 400;
  color: #1c1917;
  margin-top: 1px;
  word-break: normal;
  overflow-wrap: break-word;
  hyphens: none;
  line-height: 1.3;
}
.rir-inspecao-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
  align-items: center;
}
.rir-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 7.5pt;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: #f5f5f4;
  padding: 3px 10px;
  border-radius: 999px;
  color: #a8a29e;
  border: 1px solid #e7e5e4;
}
.rir-tag--on { background: #ecfdf5; color: #047857; border-color: #a7f3d0; }
.rir-tag--off { background: #fff; color: #a8a29e; border: 1px solid #e7e5e4; }
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
  background: #1c1917 !important;
  color: #fff !important;
  padding: 8px 10px !important;
  font-weight: 700;
  font-size: 7.5pt;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  border: none !important;
  border-top: 2px solid #047857 !important;
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
  border-bottom: 1px solid #e7e5e4;
}
.rir-table td {
  color: #44403c;
  vertical-align: middle;
  line-height: 1.35;
  white-space: normal;
  word-break: normal;
  overflow-wrap: break-word;
  hyphens: none;
}
.rir-table tbody tr.rir-item-row:nth-child(even) { background: #fafaf9; }
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
  color: #78716c;
  font-size: 9pt;
  white-space: nowrap;
  word-break: normal;
  overflow-wrap: normal;
  font-variant-numeric: tabular-nums;
  padding-left: 5px !important;
  padding-right: 5px !important;
}
.rir-c-q { font-weight: 700; color: #1c1917; font-size: 9pt; }
.rir-c-u { font-size: 9pt; color: #78716c; }
.rir-c-desc {
  line-height: 1.35;
  font-size: 8.5pt;
  font-weight: 400;
  vertical-align: top;
  word-break: normal;
  overflow-wrap: break-word;
  hyphens: none;
}
.rir-c-cod {
  font-weight: 600;
  color: #1c1917;
  font-size: 8.5pt;
  line-height: 1.25;
  word-break: break-word;
  overflow-wrap: break-word;
  hyphens: none;
  vertical-align: top;
}
.rir-c-cert {
  font-weight: 600;
  color: #1c1917;
  font-size: 8.5pt;
  line-height: 1.25;
  word-break: break-word;
  overflow-wrap: break-word;
  hyphens: none;
  vertical-align: top;
}
.rir-norms-disclaimer { display: none; }
.rir-empty-row { text-align: center; color: #a8a29e; padding: 12px !important; font-style: italic; }
.rir-laudo-block {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  break-inside: avoid;
  page-break-inside: avoid;
}
.rir-laudo-box {
  width: 100%;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 4px;
  padding: 8px 12px;
}
.rir-laudo-obs { min-width: 0; }
.rir-laudo-obs strong { font-size: 7.5pt; color: #b45309; display: block; margin-bottom: 3px; letter-spacing: 0.06em; text-transform: uppercase; }
.rir-laudo-obs p { margin: 0; font-size: 9pt; color: #78716c; line-height: 1.4; white-space: pre-wrap; }
.rir-laudo-pill {
  text-align: center;
  padding: 4px 14px;
  border-radius: 999px;
  flex-shrink: 0;
  break-inside: avoid;
  page-break-inside: avoid;
}
.rir-laudo-pill span { color: #fff; font-weight: 700; font-size: 8pt; letter-spacing: 0.06em; line-height: 1.2; text-transform: uppercase; }
.rir-laudo-pill--aprovado { background: #047857; }
.rir-laudo-pill--reprovado { background: #9f1239; }
.rir-laudo-pill--obs { background: #b45309; }
.rir-trace {
  background: #fafaf9;
  padding: 8px 10px;
  border-radius: 4px;
  margin-top: 8px;
  font-size: 7.5pt;
  color: #78716c;
  border-left: 3px solid #047857;
}
.rir-trace code { font-family: ui-monospace, monospace; background: #e7e5e4; padding: 1px 4px; border-radius: 3px; font-size: 7pt; color: #44403c; }
.rir-signatures {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid #d6d3d1;
  border-bottom: none;
  break-inside: avoid;
  page-break-inside: avoid;
}
.rir-sign-card { text-align: center; padding: 0 6px; }
.rir-sign-space { min-height: 28px; }
.rir-sign-line { width: 85%; border-top: 1.5px solid #1c1917; margin: 0 auto 8px; }
.rir-sign-role {
  font-size: 7pt;
  font-weight: 700;
  color: #44403c;
  margin-bottom: 4px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.rir-sign-name { font-weight: 700; font-size: 10pt; color: #1c1917; margin-bottom: 3px; }
.rir-sign-date { font-size: 7.5pt; color: #78716c; }
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
  .rir-table thead { display: table-header-group; }
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
    background: #fafaf9 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .rir-signatures, .rir-laudo-block {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .rir-tag--on {
    background: #ecfdf5 !important;
    color: #047857 !important;
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
    box-shadow: 0 6px 20px rgba(28, 25, 23, 0.12);
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

async function montarConteudoRir(r: RirRegistro, opts?: { paraPdf?: boolean }): Promise<string> {
  const paraPdf = opts?.paraPdf === true;
  const cfg = readConfiguracoes();
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
  const escopoLinha = juntarEscopoLinhaRir(clienteNome, projetoNome, uoExibir);
  const refReceb = r.recebimentoId ? escapeHtmlRelatorio(r.recebimentoId) : '—';
  const emitidoIso = new Date().toISOString();
  const qrDataUrl = await dataUrlQrDocumentoControle({
    tipo: 'RIR',
    codigo: r.codigo,
    emitidoEm: emitidoIso,
    versaoDoc: DOC_VERSION,
  });
  const rodapeInstitucionalHtml = htmlRodapeInstitucionalControle({
    nomeEmpresa: cfg.documentoRodapeNome,
    cnpj: cfg.documentoRodapeCnpj,
    codigo: r.codigo,
    versaoDoc: DOC_VERSION,
    qrDataUrl,
  });

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

  const faixaTitulo = montarFaixaTituloInstitucionalRirHtml(cabecalhoParams);
  const blocoInfo = montarBlocoInfoRir(cabecalhoParams);
  const linhas = montarLinhasTabelaRir(itens, 0);
  const rodapeParams = { r, laudo, laudoTxt, statusTxt, refReceb, rodapeInstitucionalHtml };

  return `<div class="rir-doc" lang="pt-BR">
<div class="rir-print-main">
${montarTabelaMaterialRir(faixaTitulo, blocoInfo, linhas, montarRodapeRir(rodapeParams))}
</div>
</div>`;
}

function montarPdfMetaRir(r: RirRegistro, escopoLinha: string): RelatorioPdfMeta {
  return {
    headerTitle: 'Relatório de inspeção de recebimento',
    headerSub: escopoLinha,
    headerCode: (r.codigo || '').trim() || '—',
    footerPrefix: 'Folha',
    footerOnly: true,
  };
}

export async function montarDocumentoHtmlImpressaoRir(
  registro: RirRegistro,
  opts?: { paraPdf?: boolean },
): Promise<string> {
  const codigo = (registro.codigo || '').trim() || '—';
  const cfg = readConfiguracoes();
  const clienteNome = cfg.cliente || '';
  const projetoNome = cfg.projeto || '';
  const obCfg = rirObraDefaultsFromConfig(cfg);
  const uoExibir = (registro.uo || '').trim() || obCfg.uo;
  const escopoLinha = juntarEscopoLinhaRir(clienteNome, projetoNome, uoExibir);
  const fontesCss = await cssFontesNotoRelatorioInline();

  return montarDocumentoHtmlInstitucionalPaged({
    title: `I.S.O PRO — RIR ${codigo}`,
    bodyClass: 'rir-print-body',
    reportStyles: `${fontesCss}${cssEstilosRelatorioRir()}`,
    contentHtml: await montarConteudoRir(registro, { paraPdf: opts?.paraPdf }),
    usePagedJs: false,
    includeToolbar: !opts?.paraPdf,
    pdfMeta: montarPdfMetaRir(registro, escopoLinha),
  });
}

export async function montarHtmlRelatorioRirCompleto(registro: RirRegistro): Promise<string> {
  return montarDocumentoHtmlImpressaoRir(registro);
}

/** HTML optimizado para printToPDF / Playwright (sem barra de pré-visualização). */
export async function montarHtmlRelatorioRirParaPdf(registro: RirRegistro): Promise<string> {
  return montarDocumentoHtmlImpressaoRir(registro, { paraPdf: true });
}

/**
 * Motor oficial RIR — HTML institucional + paginação explícita + Chromium (Playwright / printToPDF).
 * Ver `imprimirRirPdf.ts`.
 */
export async function preVisualizarRirRelatorioHtmlLegado(
  registro: RirRegistro,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return abrirPreVisualizacaoHtmlRelatorio(await montarDocumentoHtmlImpressaoRir(registro));
}
