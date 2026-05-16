import {
  abrirImpressaoHtmlRelatorio,
  cssBarraPreVisualizacaoImpressaoHtml,
  cssInstitucionalRelatorio,
  escapeHtmlRelatorio,
  htmlBarraPreVisualizacaoImpressao,
  htmlBlocoLogoInstitucional,
  scriptBarraPreVisualizacaoImpressao,
} from '../../../lib/htmlRelatorioInstitucional';
import { resolverUrlLogoInstitucionalParaHtmlImpresso } from '../../../lib/logoInstitucional';
import {
  resolverLocalizacaoExibicaoPlanejamento,
  resolverStatusLinhaDocumento,
  type MetricasPorCodigoMaterial,
} from '../services/documentoPlanejamento';
import type { Documento } from '../types/documento.types';

function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
}

function labelStatusLinha(s: ReturnType<typeof resolverStatusLinhaDocumento>): string {
  if (s === 'atendido') return 'Atendido';
  if (s === 'recebido') return 'Recebido';
  if (s === 'parcial') return 'Parcial';
  return 'Pendente';
}

function labelStatusDoc(status: Documento['status']): string {
  if (status === 'atendido') return 'Atendido';
  if (status === 'recebido') return 'Recebido';
  if (status === 'parcial') return 'Parcial';
  if (status === 'cancelado') return 'Cancelado';
  return 'Pendente';
}

function statusLinhaParaItem(
  it: Documento['itens'][number],
  metricas: Map<string, MetricasPorCodigoMaterial>,
): ReturnType<typeof resolverStatusLinhaDocumento> {
  if (it.codigoMaterial.trim() && metricas.size > 0) {
    return resolverStatusLinhaDocumento(it, metricas);
  }
  const qProj = Number(it.quantidadeProjeto) || 0;
  const qAtd = Number(it.quantidadeAtendida) || 0;
  if (qProj > 0 && qAtd + 1e-9 >= qProj) return 'atendido';
  return 'pendente';
}

function badgeDocClass(status: Documento['status']): string {
  if (status === 'atendido') return 'fc-pill fc-pill-doc fc-pill-doc--ok';
  if (status === 'recebido') return 'fc-pill fc-pill-doc fc-pill-doc--info';
  if (status === 'parcial') return 'fc-pill fc-pill-doc fc-pill-doc--warn';
  if (status === 'cancelado') return 'fc-pill fc-pill-doc fc-pill-doc--muted';
  return 'fc-pill fc-pill-doc fc-pill-doc--pend';
}

function badgeLinhaHtml(st: ReturnType<typeof resolverStatusLinhaDocumento>): string {
  const label = labelStatusLinha(st);
  let cls = 'fc-pill fc-pill-linha fc-pill-linha--pend';
  let ic = '&#9675;';
  if (st === 'atendido') {
    cls = 'fc-pill fc-pill-linha fc-pill-linha--ok';
    ic = '&#10003;';
  } else if (st === 'recebido') {
    cls = 'fc-pill fc-pill-linha fc-pill-linha--info';
    ic = '&#9632;';
  } else if (st === 'parcial') {
    cls = 'fc-pill fc-pill-linha fc-pill-linha--warn';
    ic = '&#9680;';
  }
  return `<span class="${cls}" role="status"><span class="fc-pill-ic" aria-hidden="true">${ic}</span>${escapeHtmlRelatorio(label)}</span>`;
}

function cssFolhaCampoV2(): string {
  return `
    body.folha-campo-v2 {
      font-size: 9.5pt;
      color: #0f172a;
      padding: 8px 12px !important;
    }
    body.folha-campo-v2 .inst-topbar {
      margin-bottom: 2px;
      font-size: 7.5pt;
      line-height: 1.15;
      gap: 6px;
    }
    body.folha-campo-v2 .bloco {
      margin-bottom: 4px;
    }
    body.folha-campo-v2 h1 {
      border-bottom: none;
      font-size: 0.98rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #0c4a6e;
      padding-bottom: 0;
      margin: 0;
      line-height: 1.08;
    }
    body.folha-campo-v2 .inst-header {
      margin-bottom: 4px;
      align-items: flex-start;
      gap: 8px;
    }
    body.folha-campo-v2 .inst-logo-col--pequeno {
      min-height: 34px;
      flex-basis: 76px;
    }
    body.folha-campo-v2 .inst-logo-col--pequeno .inst-logo-img {
      max-width: 76px;
      max-height: 36px;
    }
    body.folha-campo-v2 .inst-logo-col--pequeno .inst-logo-placeholder {
      width: 76px;
      min-height: 34px;
      padding: 3px;
    }
    .fc-doc-kicker {
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      background: none !important;
      font-size: 7.35pt !important;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #0284c7 !important;
      line-height: 1.15;
    }
    body.folha-campo-v2 .inst-title-col > p.fc-doc-desc {
      margin: 2px 0 0 0 !important;
      padding: 3px 0 3px 8px !important;
      border-left: 2px solid #0ea5e9;
      color: #0369a1 !important;
      font-weight: 600;
      font-size: 9pt !important;
      line-height: 1.22;
      background: linear-gradient(90deg, rgba(14, 165, 233, 0.1) 0%, transparent 100%);
      border-radius: 0 5px 5px 0;
    }
    .fc-meta-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 4px 5px;
      margin: 0 0 5px 0;
    }
    @media (max-width: 900px) {
      .fc-meta-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    .fc-meta-card {
      border: 1px solid #bae6fd;
      border-radius: 6px;
      padding: 3px 6px;
      background: linear-gradient(180deg, #f0f9ff 0%, #e0f2fe 100%);
    }
    .fc-meta-k {
      display: block;
      font-size: 6.65pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #64748b;
      margin-bottom: 1px;
    }
    .fc-meta-v { font-size: 8.65pt; font-weight: 700; color: #0f172a; word-break: break-word; line-height: 1.2; }
    .fc-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 8.5pt;
      font-weight: 600;
      max-width: 100%;
    }
    .fc-pill-ic { font-size: 11px; line-height: 1; opacity: 0.95; }
    .fc-pill-code {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      color: #0f172a;
      font-family: ui-monospace, Consolas, monospace;
      font-size: 8.5pt;
    }
    .fc-pill-loc {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      color: #334155;
      font-size: 8.5pt;
      white-space: normal;
    }
    .fc-pill-doc--ok { background: #d1fae5; border: 1px solid #6ee7b7; color: #065f46; }
    .fc-pill-doc--info { background: #dbeafe; border: 1px solid #93c5fd; color: #1e40af; }
    .fc-pill-doc--warn { background: #ffedd5; border: 1px solid #fdba74; color: #9a3412; }
    .fc-pill-doc--pend { background: #f1f5f9; border: 1px solid #cbd5e1; color: #475569; }
    .fc-pill-doc--muted { background: #e2e8f0; border: 1px solid #94a3b8; color: #334155; }
    .fc-pill-linha--ok { background: #d1fae5; border: 1px solid #34d399; color: #065f46; }
    .fc-pill-linha--info { background: #dbeafe; border: 1px solid #60a5fa; color: #1e3a8a; }
    .fc-pill-linha--warn { background: #ffedd5; border: 1px solid #fb923c; color: #9a3412; }
    .fc-pill-linha--pend { background: #f1f5f9; border: 1px solid #cbd5e1; color: #475569; }
    .fc-section-title {
      margin: 4px 0 4px 0;
      font-size: 8.65pt;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #0369a1;
      padding-bottom: 2px;
      border-bottom: 1px solid #bae6fd;
    }
    .fc-item-list { display: flex; flex-direction: column; gap: 5px; }
    .fc-item {
      display: grid;
      grid-template-columns: 28px minmax(100px, 0.88fr) minmax(140px, 1.5fr) minmax(88px, 0.72fr) 30px minmax(118px, auto) minmax(96px, 0.68fr);
      gap: 6px 8px;
      align-items: start;
      padding: 6px 9px;
      border: 1px solid #e0f2fe;
      border-radius: 9px;
      background: linear-gradient(165deg, #ffffff 0%, #f8fafc 55%, #f1f5f9 100%);
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
    }
    .fc-item-num {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: linear-gradient(145deg, #0ea5e9, #0284c7);
      color: #fff;
      font-weight: 800;
      font-size: 8.5pt;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .fc-item-desc {
      font-size: 8.5pt;
      line-height: 1.32;
      color: #1e293b;
      word-break: break-word;
    }
    .fc-item-um {
      font-size: 8.5pt;
      font-weight: 700;
      color: #475569;
      text-align: center;
      padding-top: 1px;
    }
    .fc-qty-row { display: flex; flex-wrap: wrap; gap: 5px; align-items: stretch; }
    .fc-qbox {
      flex: 1 1 34px;
      min-width: 34px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 2px 4px;
      text-align: center;
      background: #fff;
    }
    .fc-qbox-l {
      display: block;
      font-size: 7pt;
      font-weight: 800;
      letter-spacing: 0.06em;
      color: #64748b;
    }
    .fc-qbox-v {
      display: block;
      font-size: 9pt;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      color: #0f172a;
      margin-top: 1px;
    }
    .fc-qbox-v--ok { color: #047857; }
    .fc-qbox-v--zero { color: #b45309; }
    .fc-footnote {
      margin-top: 8px;
      padding: 6px 8px;
      font-size: 7.8pt;
      line-height: 1.4;
      color: #475569;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
    }
    .fc-obs {
      border: 1px solid #fde68a;
      border-radius: 6px;
      padding: 4px 6px;
      background: #fffbeb;
      margin-bottom: 4px;
    }
    .fc-obs h2 { margin: 0 0 3px 0; font-size: 8.5pt; color: #92400e; }
    .fc-obs-text { margin: 0; white-space: pre-wrap; font-size: 8.5pt; color: #78350f; line-height: 1.35; }
    @media print {
      body.folha-campo-v2 { padding: 2.5mm 4.5mm !important; }
      .fc-item { page-break-inside: avoid; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .fc-meta-card, .fc-pill, .fc-item-num { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  `;
}

/**
 * Folha de planejamento para equipe de campo: A4 paisagem, layout em cartoes (menos aspecto de folha de calculo).
 */
export function montarHtmlPlanejamentoCampo(
  doc: Documento,
  metricas: Map<string, MetricasPorCodigoMaterial>,
  localizacoesRecebimentoPorCodigo?: Map<string, string>,
): string {
  const logoUrl = resolverUrlLogoInstitucionalParaHtmlImpresso();
  const geradoEm = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const tituloDoc = `${doc.numero} Rev. ${doc.revisao}`;
  const observacaoBloco = doc.observacao?.trim()
    ? `<section class="bloco fc-obs"><h2>Observacoes do documento</h2><p class="fc-obs-text">${escapeHtmlRelatorio(doc.observacao)}</p></section>`
    : '';

  const locCell = (raw: string) => {
    const t = (raw ?? '').trim();
    if (!t) return '—';
    return escapeHtmlRelatorio(t).replace(/\n/g, '<br>');
  };

  const linhasHtml =
    doc.itens.length === 0
      ? '<p class="fc-footnote">Nenhum item neste documento.</p>'
      : doc.itens
          .map((it, idx) => {
            const st = statusLinhaParaItem(it, metricas);
            const qProj = Number(it.quantidadeProjeto) || 0;
            const qAtd = Number(it.quantidadeAtendida) || 0;
            const falta = Math.max(0, qProj - qAtd);
            const clsAtd =
              qProj > 0 && qAtd + 1e-9 >= qProj ? 'fc-qbox-v fc-qbox-v--ok' : qAtd <= 0 && qProj > 0 ? 'fc-qbox-v fc-qbox-v--zero' : 'fc-qbox-v';
            return `<article class="fc-item" role="row">
          <div class="fc-item-num" aria-label="Linha">${idx + 1}</div>
          <div><span class="fc-pill fc-pill-code">${escapeHtmlRelatorio(it.codigoMaterial)}</span></div>
          <div class="fc-item-desc">${escapeHtmlRelatorio(it.descricaoMaterial)}</div>
          <div><span class="fc-pill fc-pill-loc">${locCell(resolverLocalizacaoExibicaoPlanejamento(it, localizacoesRecebimentoPorCodigo))}</span></div>
          <div class="fc-item-um">${escapeHtmlRelatorio(it.unidade)}</div>
          <div class="fc-qty-row">
            <div class="fc-qbox"><span class="fc-qbox-l">DOC</span><span class="fc-qbox-v">${escapeHtmlRelatorio(fmtQty(qProj))}</span></div>
            <div class="fc-qbox"><span class="fc-qbox-l">ATEND</span><span class="${clsAtd}">${escapeHtmlRelatorio(fmtQty(qAtd))}</span></div>
            <div class="fc-qbox"><span class="fc-qbox-l">FALTA</span><span class="fc-qbox-v">${escapeHtmlRelatorio(fmtQty(falta))}</span></div>
          </div>
          <div style="padding-top:0;">${badgeLinhaHtml(st)}</div>
        </article>`;
          })
          .join('');

  const extra = `
    @page { size: A4 landscape; margin: 6mm 8mm; }
    ${cssFolhaCampoV2()}
  `;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtmlRelatorio(tituloDoc)} — Planejamento</title>
  <style>${cssInstitucionalRelatorio()}${cssBarraPreVisualizacaoImpressaoHtml()}${extra}</style>
</head>
<body class="folha-campo-v2">
  ${htmlBarraPreVisualizacaoImpressao()}
  <div class="inst-topbar">
    <span>Gerado em: ${escapeHtmlRelatorio(geradoEm)}</span>
    <span>Folha de campo — planejamento de materiais</span>
  </div>
  <header class="inst-header">
    ${htmlBlocoLogoInstitucional(logoUrl, true)}
    <div class="inst-title-col">
      <h1>${escapeHtmlRelatorio(tituloDoc)}</h1>
      <p class="fc-doc-kicker">Itens para atendimento / conferencia no campo</p>
      <p class="fc-doc-desc">${escapeHtmlRelatorio(doc.descricao || 'Sem descricao.')}</p>
    </div>
  </header>

  <section class="bloco">
    <div class="fc-meta-grid">
      <div class="fc-meta-card">
        <span class="fc-meta-k">Status do documento</span>
        <span class="${badgeDocClass(doc.status)}">${escapeHtmlRelatorio(labelStatusDoc(doc.status))}</span>
      </div>
      <div class="fc-meta-card">
        <span class="fc-meta-k">Responsavel</span>
        <span class="fc-meta-v">${escapeHtmlRelatorio(doc.responsavel || '—')}</span>
      </div>
      <div class="fc-meta-card">
        <span class="fc-meta-k">Data do documento</span>
        <span class="fc-meta-v">${escapeHtmlRelatorio(doc.dataDocumento)}</span>
      </div>
      <div class="fc-meta-card">
        <span class="fc-meta-k">Total de itens</span>
        <span class="fc-meta-v">${doc.itens.length}</span>
      </div>
    </div>
  </section>
  ${observacaoBloco}
  <section class="bloco">
    <h2 class="fc-section-title">Lista de materiais</h2>
    <div class="fc-item-list">
      ${linhasHtml}
    </div>
    <div class="fc-footnote">
      <strong>Notas:</strong> «Falta entregar» = quantidade do documento menos quantidade ja atendida neste documento.
      «Status» na linha segue recebimentos conferidos e baixas de atendimento (mesma regra da lista no sistema).
      «Localizacao» prioriza enderecos dos recebimentos agregados; se vazio, usa o texto opcional no item do documento.
      Em caso de divergencia com o ecra, prevalece o registo na base apos sincronizacao.
    </div>
  </section>
  ${scriptBarraPreVisualizacaoImpressao()}
</body>
</html>`;
}

export function imprimirPlanejamentoCampoHtml(
  doc: Documento,
  metricas: Map<string, MetricasPorCodigoMaterial>,
  localizacoesRecebimentoPorCodigo?: Map<string, string>,
): boolean {
  return abrirImpressaoHtmlRelatorio(montarHtmlPlanejamentoCampo(doc, metricas, localizacoesRecebimentoPorCodigo));
}
