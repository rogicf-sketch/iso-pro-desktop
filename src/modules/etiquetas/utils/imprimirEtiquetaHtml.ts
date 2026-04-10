import { abrirImpressaoHtmlRelatorio, cssInstitucionalRelatorio, escapeHtmlRelatorio, htmlBlocoLogoInstitucional } from '../../../lib/htmlRelatorioInstitucional';
import { resolverUrlLogoInstitucionalParaHtmlImpresso } from '../../../lib/logoInstitucional';
import type { EtiquetaFormData } from '../types/etiqueta.types';

export function montarHtmlEtiqueta(form: EtiquetaFormData): string {
  const logoUrl = resolverUrlLogoInstitucionalParaHtmlImpresso();
  const geradoEm = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const compacto = form.formato === 'termica_58' || form.formato === 'termica_80';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Etiqueta ${escapeHtmlRelatorio(form.codigo || '—')}</title>
  <style>
    ${cssInstitucionalRelatorio()}
    .etiq-body { margin-top: 12px; }
    .etiq-codigo { font-family: Consolas, 'Courier New', monospace; font-size: 14pt; margin: 8px 0; }
    .etiq-titulo { font-size: 18pt; margin: 8px 0 4px; }
  </style>
</head>
<body>
  <div class="inst-topbar">
    <span>Gerado em: ${escapeHtmlRelatorio(geradoEm)}</span>
    <span>${escapeHtmlRelatorio(form.formato)} • ${escapeHtmlRelatorio(String(form.larguraMm))}x${escapeHtmlRelatorio(String(form.alturaMm))} mm</span>
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
  </section>
</body>
</html>`;
}

export function imprimirEtiquetaHtml(form: EtiquetaFormData): boolean {
  return abrirImpressaoHtmlRelatorio(montarHtmlEtiqueta(form));
}
