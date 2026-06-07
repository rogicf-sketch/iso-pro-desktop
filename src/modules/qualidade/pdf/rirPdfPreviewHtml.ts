import { escapeHtmlRelatorio } from '../../../lib/htmlRelatorioInstitucional';
import type { RirRegistro, RirLaudo } from '../types/qualidade.types';
import type { RirPdfContexto } from './rirPdfDocument';
import { RIR_PDF_COLS, RIR_PDF_VERSION } from './rirPdfLayout';
import { cssPreviewRirPdfTheme, RIR_PDF_THEME, RIR_PDF_TIPO_CSS } from './rirPdfTheme';
import { formatDatePtPdf } from './rirPdfText';

export type RirPreviewHtmlOpts = {
  pdfBase64: string;
  pdfFileName: string;
  logoDataUrl?: string;
};

function laudoLabel(l: RirLaudo): string {
  if (l === 'reprovado') return 'REPROVADO';
  if (l === 'observacoes') return 'CONFORME OBSERVAÇÕES';
  return 'APROVADO';
}

function laudoClass(l: RirLaudo): string {
  if (l === 'reprovado') return 'rir-preview-laudo--reprovado';
  if (l === 'observacoes') return 'rir-preview-laudo--obs';
  return 'rir-preview-laudo--aprovado';
}

function mkTag(label: string, on: boolean): string {
  return `<span class="rir-preview-tag${on ? ' rir-preview-tag--on' : ''}">${on ? '✓' : '☐'} ${escapeHtmlRelatorio(label)}</span>`;
}

function linhasTabela(r: RirRegistro): string {
  const itens = r.itensRir ?? [];
  if (itens.length === 0) {
    return '<tr><td colspan="6" class="rir-preview-empty">Nenhum item registrado.</td></tr>';
  }
  return itens
    .map(
      (it, i) => `<tr class="${i % 2 === 1 ? 'rir-preview-row-alt' : ''}">
      <td>${i + 1}</td>
      <td>${escapeHtmlRelatorio(it.codigoMaterial)}</td>
      <td>${escapeHtmlRelatorio(String(it.quantidade))}</td>
      <td>${escapeHtmlRelatorio(it.unidade)}</td>
      <td class="rir-preview-desc">${escapeHtmlRelatorio(it.descricaoMaterial)}</td>
      <td><span class="rir-preview-cert">${escapeHtmlRelatorio((it.certificado || 'N/A').trim() || 'N/A')}</span></td>
    </tr>`,
    )
    .join('');
}

function cssPreviewRir(): string {
  const c = RIR_PDF_THEME.colors;
  const t = RIR_PDF_TIPO_CSS;
  const col = (k: keyof typeof RIR_PDF_COLS) => `${(RIR_PDF_COLS[k] * 100).toFixed(1)}%`;
  return `
${cssPreviewRirPdfTheme()}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body.rir-preview-body {
  background: #cbd5e1;
  font-family: ${RIR_PDF_THEME.fontFamily};
  color: ${c.ink};
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.rir-preview-toolbar {
  display: flex; flex-wrap: wrap; gap: 10px; align-items: center;
  margin: 0 auto 14px; max-width: 210mm; padding: 10px 12px;
  background: #0f172a; border-radius: 8px; border: 1px solid #334155;
}
.rir-preview-toolbar button {
  padding: 8px 16px; font: 600 13px ${RIR_PDF_THEME.fontFamily};
  border-radius: 6px; border: 1px solid #38bdf8; background: #0284c7; color: #fff; cursor: pointer;
}
.rir-preview-toolbar button.secondary { border-color: #64748b; background: #1e293b; }
.rir-preview-toolbar span { color: #cbd5e1; font-size: 12px; flex: 1 1 200px; }
.rir-preview-sheet {
  max-width: 210mm; margin: 0 auto 18px; background: ${c.white};
  padding: 10mm 10mm 12mm; box-shadow: 0 6px 20px rgba(15,23,42,.14);
}
.rir-preview-hdr { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; padding-bottom: 6px; border-bottom: 2.5px solid ${c.blueLight}; }
.rir-preview-hdr-logo img { display: block; max-width: ${RIR_PDF_THEME.logo.maxWidthPx}px; max-height: ${RIR_PDF_THEME.logo.maxHeightPx}px; object-fit: contain; }
.rir-preview-logo-fallback { background: ${c.ink}; border-radius: 8px; padding: 6px 10px; color: #fff; font-weight: 800; font-size: 9.5px; line-height: 1.15; }
.rir-preview-logo-fallback small { display: block; color: #22c55e; font-size: 6.5px; margin-top: 2px; }
.rir-preview-hdr-title { flex: 1; text-align: center; min-width: 0; }
.rir-preview-hdr-title h1 { margin: 0; font-size: ${t.titulo}; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
.rir-preview-badge { display: inline-block; margin-top: 4px; background: ${c.blueLight}; color: ${c.badgeInk}; padding: 3px 10px; border-radius: 20px; font-size: ${t.badge}; font-weight: 600; max-width: 100%; }
.rir-preview-meta { text-align: right; min-width: 110px; }
.rir-preview-meta .cod { font-size: ${t.codigoRir}; font-weight: 700; color: ${c.blue}; }
.rir-preview-meta div { font-size: ${t.meta}; color: ${c.muted}; margin-top: 2px; }
.rir-preview-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 8px;
  background: ${c.gridBg}; border: 1px solid ${c.border}; border-radius: 8px;
  padding: 10px 12px; margin: 10px 0 8px;
}
.rir-preview-grid label { display: block; font-size: ${t.gridLabel}; font-weight: 700; text-transform: uppercase; color: ${c.muted}; letter-spacing: .03em; }
.rir-preview-grid span { display: block; font-size: ${t.gridValor}; font-weight: 600; margin-top: 2px; word-break: break-word; }
.rir-preview-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.rir-preview-tag { font-size: ${t.tag}; font-weight: 600; padding: 3px 10px; border-radius: 20px; background: ${c.white}; border: 1px solid ${c.border}; color: ${c.muted}; }
.rir-preview-tag--on { background: ${c.greenBg}; color: ${c.green}; border-color: ${c.greenBorder}; }
.rir-preview-folha { text-align: right; font-size: ${t.folha}; color: ${c.muted}; font-weight: 600; margin: 4px 0; }
.rir-preview-table-wrap { border: 1px solid ${c.border}; border-radius: 8px; overflow: hidden; margin-bottom: 10px; }
.rir-preview-sec { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid ${c.border}; font-size: ${t.secao}; font-weight: 700; }
.rir-preview-sec::before { content: ''; width: 4px; height: 16px; background: ${c.blue}; border-radius: 2px; }
.rir-preview-table { width: 100%; border-collapse: collapse; font-size: ${t.td}; table-layout: fixed; }
.rir-preview-table col.col-item { width: ${col('item')}; }
.rir-preview-table col.col-cod { width: ${col('cod')}; }
.rir-preview-table col.col-q { width: ${col('q')}; }
.rir-preview-table col.col-u { width: ${col('u')}; }
.rir-preview-table col.col-desc { width: ${col('desc')}; }
.rir-preview-table col.col-cert { width: ${col('cert')}; }
.rir-preview-table thead { display: table-header-group; }
.rir-preview-table thead th { background: ${c.blueHead}; font-size: ${t.th}; font-weight: 700; padding: 5px 3px; border: 1px solid ${c.border}; text-align: center; }
.rir-preview-table tbody td { padding: 4px 4px; border: 1px solid ${c.border}; vertical-align: top; color: ${c.ink}; line-height: 1.25; }
.rir-preview-table tbody td:first-child,
.rir-preview-table tbody td:nth-child(3),
.rir-preview-table tbody td:nth-child(4) { text-align: center; padding-left: 2px; padding-right: 2px; }
.rir-preview-row-alt { background: ${c.rowAlt}; }
.rir-preview-desc { word-break: break-word; }
.rir-preview-cert { display: inline-block; background: ${c.blueLight}; color: ${c.badgeInk}; padding: 2px 8px; border-radius: 10px; font-size: ${t.cert}; font-weight: 700; }
.rir-preview-empty { text-align: center; color: ${c.muted}; font-style: italic; padding: 16px !important; }
.rir-preview-tail { margin-top: 12px; }
.rir-preview-obs { background: ${c.yellowBg}; border: 1px solid ${c.yellowBorder}; border-radius: 8px; padding: 10px 12px; display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.rir-preview-obs strong { display: block; font-size: 9px; color: #854d0e; margin-bottom: 4px; }
.rir-preview-obs p { margin: 0; font-size: 9px; color: #854d0e; line-height: 1.4; white-space: pre-wrap; max-width: 420px; }
.rir-preview-laudo { padding: 8px 18px; border-radius: 24px; color: #fff; font-weight: 800; font-size: 11px; align-self: center; }
.rir-preview-laudo--aprovado { background: #16a34a; }
.rir-preview-laudo--reprovado { background: #dc2626; }
.rir-preview-laudo--obs { background: #d97706; }
.rir-preview-trace { margin-top: 8px; background: #f1f5f9; border: 1px solid ${c.border}; border-left: 4px solid ${c.blue}; border-radius: 6px; padding: 8px 10px; font-size: 8px; color: ${c.muted}; }
.rir-preview-signs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 12px; padding-bottom: 8px; border-bottom: 2px solid ${c.blue}; }
.rir-preview-sign { text-align: center; font-size: 8px; }
.rir-preview-sign .role { color: ${c.blue}; font-weight: 700; margin: 8px 0 4px; }
.rir-preview-sign .name { font-weight: 700; font-size: 10px; }
.rir-preview-sign .line { border-top: 1px dashed ${c.muted}; margin: 0 8px 8px; }
.rir-preview-foot { margin-top: 10px; text-align: center; font-size: 7px; color: ${c.muted}; line-height: 1.4; }
.rir-preview-nota { max-width: 210mm; margin: 0 auto 12px; font-size: 11px; color: #475569; text-align: center; }
@media print {
  .rir-preview-toolbar, .rir-preview-nota { display: none !important; }
  body.rir-preview-body { background: #fff; }
  .rir-preview-sheet { box-shadow: none; margin: 0; max-width: none; padding: 8mm 10mm; }
  .rir-preview-hdr { position: fixed; top: 0; left: 0; right: 0; padding: 4mm 10mm 2mm; background: #fff; border-bottom: 2px solid ${c.blueLight}; }
  .rir-preview-hdr-title h1 { font-size: 10pt; margin: 0; }
  .rir-preview-hdr-logo img { max-height: 28px; }
  .rir-preview-grid, .rir-preview-tags, .rir-preview-folha, .rir-preview-tail { break-inside: avoid; }
  .rir-preview-table-wrap { break-inside: auto; }
}
@media print { .rir-preview-toolbar, .rir-preview-nota { display: none !important; } body { background: #fff !important; } .rir-preview-sheet { box-shadow: none; margin: 0; max-width: none; } }
`;
}

function scriptPreviewRir(): string {
  return `<script>
(function () {
  var pdfB64 = window.__rirPdfBase64 || '';
  var pdfName = window.__rirPdfFileName || 'RIR-documento.pdf';
  document.querySelectorAll('[data-rir-action]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var action = btn.getAttribute('data-rir-action');
      if (!window.isoProDesktop) { alert('Disponível apenas no I.S.O PRO Desktop.'); return; }
      if (action === 'save' && window.isoProDesktop.saveRirPdf) {
        void window.isoProDesktop.saveRirPdf(pdfB64, pdfName);
      } else if (action === 'print' && window.isoProDesktop.printRirPdf) {
        void window.isoProDesktop.printRirPdf(pdfB64);
      }
    });
  });
})();
</script>`;
}

/** Preview HTML espelhando o PDF (pdf-lib) — mesmos tokens visuais; PDF oficial via botões. */
export function montarHtmlPreviewRir(ctx: RirPdfContexto, opts: RirPreviewHtmlOpts): string {
  const r = ctx.registro;
  const laudo = r.laudo || 'aprovado';
  const logoHtml = opts.logoDataUrl
    ? `<img src="${escapeHtmlRelatorio(opts.logoDataUrl)}" alt="Logo" />`
    : `<div class="rir-preview-logo-fallback">I · S · O | <span style="color:#22c55e">PRO</span><small>GESTÃO DE MATERIAIS</small></div>`;

  const grid: [string, string][] = [
    ['UO (Obra/Depto)', ctx.uoExibir || '—'],
    ['Local', ctx.localExibir || '—'],
    ['Contrato', ctx.contratoExibir || '—'],
    ['Nota Fiscal', r.recebimentoNotaFiscal ?? '—'],
    ['Fornecedor', r.fornecedorNome || '—'],
    ['Romaneio', r.recebimentoRomaneio ?? '—'],
    ['Nº Procedimento', r.procedimentoNumero || '—'],
    ['Sol. compra / Pack-list', (r.solCompraPackList ?? '').trim() || '—'],
    ['Disciplina', ctx.disciplinaExibir || '—'],
  ];

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Pré-visualização — RIR ${escapeHtmlRelatorio(r.codigo)}</title>
  <style>${cssPreviewRir()}</style>
</head>
<body class="rir-preview-body">
<div class="rir-preview-toolbar" role="toolbar">
  <button type="button" data-rir-action="print">Imprimir PDF</button>
  <button type="button" data-rir-action="save" class="secondary">Guardar PDF…</button>
  <span>Pré-visualização espelhada do PDF (${RIR_PDF_VERSION}, fonte ${escapeHtmlRelatorio(ctx.fonteFamilia ?? 'Noto Sans')}). Impressão/arquivo: motor pdf-lib.</span>
</div>
<p class="rir-preview-nota">O PDF final pode dividir a tabela em várias folhas A4; o conteúdo abaixo é o mesmo do documento oficial.</p>
<div class="rir-preview-sheet">
  <header class="rir-preview-hdr">
    <div class="rir-preview-hdr-logo">${logoHtml}</div>
    <div class="rir-preview-hdr-title">
      <h1>Relatório de inspeção de recebimento</h1>
      <div class="rir-preview-badge">RIR · ${escapeHtmlRelatorio(ctx.escopoLinha)}</div>
    </div>
    <div class="rir-preview-meta">
      <div class="cod">${escapeHtmlRelatorio(r.codigo)}</div>
      <div>Data: ${escapeHtmlRelatorio(formatDatePtPdf(r.dataRegistro))}</div>
      <div>Emitido: ${escapeHtmlRelatorio(ctx.emitidoEm)}</div>
    </div>
  </header>
  <div class="rir-preview-grid">
    ${grid.map(([l, v]) => `<div><label>${escapeHtmlRelatorio(l)}</label><span>${escapeHtmlRelatorio(v)}</span></div>`).join('')}
  </div>
  <div class="rir-preview-tags">
    ${mkTag('Quantitativa', !!r.inspecaoQuantitativa)}
    ${mkTag('Qualitativa', !!r.inspecaoQualitativa)}
    ${mkTag('Dimensional', !!r.inspecaoDimensional)}
  </div>
  <div class="rir-preview-folha">Pré-visualização contínua</div>
  <div class="rir-preview-table-wrap">
    <div class="rir-preview-sec">Material recebido (nota fiscal)</div>
    <table class="rir-preview-table">
      <colgroup>
        <col class="col-item" /><col class="col-cod" /><col class="col-q" /><col class="col-u" /><col class="col-desc" /><col class="col-cert" />
      </colgroup>
      <thead><tr><th>Item</th><th>Código</th><th>Qtd.</th><th>Unid.</th><th>Descrição</th><th>Certificado</th></tr></thead>
      <tbody>${linhasTabela(r)}</tbody>
    </table>
  </div>
  <div class="rir-preview-tail">
    <div class="rir-preview-obs">
      <div><strong>Observações da inspeção:</strong><p>${escapeHtmlRelatorio(r.observacoesQc || '—')}</p></div>
      <div class="rir-preview-laudo ${laudoClass(laudo)}">${escapeHtmlRelatorio(laudoLabel(laudo))}</div>
    </div>
    <div class="rir-preview-trace">Rastreabilidade: ID recebimento ${escapeHtmlRelatorio(r.recebimentoId || '—')} · ID RIR ${escapeHtmlRelatorio(r.id)} · Relatório ${RIR_PDF_VERSION}</div>
    <div class="rir-preview-signs">
      ${(
        [
          ['Responsável — recebimento', r.assinaturaRecebimento],
          ['Controle de qualidade', r.assinaturaCq],
          ['Cliente', r.assinaturaCliente],
        ] as const
      )
        .map(
          ([role, bloco]) =>
            `<div class="rir-preview-sign"><div class="line"></div><div class="role">${escapeHtmlRelatorio(role)}</div><div class="name">${escapeHtmlRelatorio(bloco.nome || '—')}</div><div>${bloco.data ? escapeHtmlRelatorio(formatDatePtPdf(bloco.data)) : '—'}</div></div>`,
        )
        .join('')}
    </div>
    <div class="rir-preview-foot">Documento gerado eletronicamente pelo I.S.O PRO Desktop${escapeHtmlRelatorio(ctx.branding.rodapeInstituicao ?? '')}. Referência: ${escapeHtmlRelatorio(r.codigo)}.</div>
  </div>
</div>
<script>window.__rirPdfBase64=${JSON.stringify(opts.pdfBase64)};window.__rirPdfFileName=${JSON.stringify(opts.pdfFileName)};</script>
${scriptPreviewRir()}
</body>
</html>`;
}
