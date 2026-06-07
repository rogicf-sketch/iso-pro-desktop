import { cssInstitucionalRelatorio, escapeHtmlRelatorio, htmlBlocoLogoInstitucional } from '../../../lib/htmlRelatorioInstitucional';
import { imprimirRelatorioProfissional, nomeArquivoRelatorioPdf } from '../../../lib/relatorioProfissional';
import { montarDocumentoHtmlInstitucionalPaged } from '../../../lib/relatorioPagedDocument';
import { resolverUrlLogoInstitucionalParaHtmlImpresso } from '../../../lib/logoInstitucional';
import type { EtiquetaFormData } from '../types/etiqueta.types';

export function montarHtmlEtiqueta(form: EtiquetaFormData): string {
  const logoUrl = resolverUrlLogoInstitucionalParaHtmlImpresso();
  const geradoEm = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const compacto = form.formato === 'termica_58' || form.formato === 'termica_80';
  const largura = Math.max(20, form.larguraMm);
  const altura = Math.max(15, form.alturaMm);

  const reportStyles = `
    ${cssInstitucionalRelatorio()}
    .etiq-body { margin-top: 12px; }
    .etiq-codigo { font-family: Consolas, 'Courier New', monospace; font-size: 14pt; margin: 8px 0; }
    .etiq-titulo { font-size: 18pt; margin: 8px 0 4px; }
  `;

  const contentHtml = `
  <div class="inst-topbar">
    <span>Gerado em: ${escapeHtmlRelatorio(geradoEm)}</span>
    <span>${escapeHtmlRelatorio(form.formato)} • ${escapeHtmlRelatorio(String(largura))}x${escapeHtmlRelatorio(String(altura))} mm</span>
  </div>
  <header class="inst-header">
    ${htmlBlocoLogoInstitucional(logoUrl, compacto)}
    <div class="inst-title-col">
      <h1>Etiqueta</h1>
    </div>
  </header>
  <section class="bloco etiq-body">
    <p><strong>Modelo:</strong> ${escapeHtmlRelatorio(form.modelo)} &nbsp; <strong>Copias:</strong> ${escapeHtmlRelatorio(String(form.quantidadeCopias))}</p>
    <p class="etiq-titulo">${escapeHtmlRelatorio(form.titulo || 'Titulo')}</p>
    <p class="etiq-codigo">${escapeHtmlRelatorio(form.codigo || 'CODIGO')}</p>
    <p>${escapeHtmlRelatorio(form.descricao || '')}</p>
    <p style="font-size:10pt;color:#64748b">Origem: ${escapeHtmlRelatorio(form.moduloOrigem)} ${form.referenciaId ? `• Ref ${escapeHtmlRelatorio(form.referenciaId)}` : ''}</p>
    ${form.observacoes ? `<p><strong>Observacoes:</strong></p><p>${escapeHtmlRelatorio(form.observacoes)}</p>` : ''}
    <p style="font-size:10pt;color:#64748b">Criado por: ${escapeHtmlRelatorio(form.criadoPor || '-')}</p>
  </section>`;

  return montarDocumentoHtmlInstitucionalPaged({
    title: `Etiqueta ${escapeHtmlRelatorio(form.codigo || '—')}`,
    bodyClass: 'etiq-lote-body',
    reportStyles,
    contentHtml,
    includeToolbar: true,
    pagedAtPage: {
      size: `${largura}mm ${altura}mm`,
      marginTopMm: 2,
      marginRightMm: 2,
      marginBottomMm: 2,
      marginLeftMm: 2,
      showPageNumbers: false,
      firstPageNoRunningHeader: false,
    },
  });
}

export function imprimirEtiquetaHtml(form: EtiquetaFormData): boolean {
  const html = montarHtmlEtiqueta(form);
  const fileName = nomeArquivoRelatorioPdf(form.codigo || 'documento', 'etiqueta');
  void imprimirRelatorioProfissional({ html, fileName });
  return true;
}
