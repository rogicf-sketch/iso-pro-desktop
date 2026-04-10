export function escapeHtmlRelatorio(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Estilos compartilhados: cabecalho com logo + titulo (impressao HTML). */
export function cssInstitucionalRelatorio(): string {
  return `
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; padding: 20px 24px; color: #111; font-size: 11pt; line-height: 1.4; }
    .inst-topbar { display: flex; justify-content: space-between; align-items: center; font-size: 9pt; color: #444; margin-bottom: 10px; flex-wrap: wrap; gap: 8px; }
    .inst-topbar span:last-child { font-weight: 600; color: #111; }
    .inst-header { display: flex; gap: 20px; align-items: flex-start; margin-bottom: 16px; }
    .inst-logo-col { flex: 0 0 150px; min-height: 76px; display: flex; align-items: center; justify-content: flex-start; }
    .inst-logo-col--pequeno { flex-basis: 100px; min-height: 48px; }
    .inst-logo-img { max-width: 150px; max-height: 76px; width: auto; height: auto; object-fit: contain; display: block; }
    .inst-logo-col--pequeno .inst-logo-img { max-width: 100px; max-height: 48px; }
    .inst-logo-placeholder { width: 150px; min-height: 76px; border: 1px dashed #bbb; border-radius: 4px; display: flex; align-items: center; justify-content: center; text-align: center; padding: 8px; background: #fafafa; }
    .inst-logo-col--pequeno .inst-logo-placeholder { width: 100px; min-height: 48px; padding: 4px; }
    .inst-logo-hint { font-size: 8.5pt; color: #777; line-height: 1.3; }
    .inst-logo-sub { font-size: 7.5pt; color: #999; }
    .inst-title-col { flex: 1; min-width: 0; }
    h1 { font-size: 1.35rem; margin: 0 0 0; padding-bottom: 10px; border-bottom: 2px solid #333; }
    h2 { font-size: 1rem; margin: 16px 0 8px; color: #222; }
    .bloco { margin-bottom: 14px; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; }
    .grid2 p { margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 10pt; margin-top: 8px; }
    th, td { border: 1px solid #333; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #eee; font-weight: 600; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    dl.campos { margin: 0; }
    dl.campos dt { font-weight: 600; margin-top: 10px; color: #333; }
    dl.campos dd { margin: 4px 0 0 0; white-space: pre-wrap; }
    @media print {
      body { padding: 12px; }
      .inst-logo-placeholder { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  `;
}

export function htmlBlocoLogoInstitucional(logoUrl: string, compacto = false): string {
  const colClass = compacto ? 'inst-logo-col inst-logo-col--pequeno' : 'inst-logo-col';
  if (logoUrl) {
    return `<div class="${colClass}">
      <img class="inst-logo-img" src="${escapeHtmlRelatorio(logoUrl)}" alt="" />
    </div>`;
  }
  return `<div class="${colClass}">
    <div class="inst-logo-placeholder" title="Logo em Configuracoes do sistema">
      <span class="inst-logo-hint">Logo da empresa<br /><span class="inst-logo-sub">(opcional)</span></span>
    </div>
  </div>`;
}

/**
 * Abre HTML em nova janela e dispara impressao.
 * @returns false se o navegador bloqueou popup.
 */
export function abrirImpressaoHtmlRelatorio(html: string): boolean {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank', 'width=960,height=720');
  if (!w) {
    URL.revokeObjectURL(url);
    return false;
  }

  let printed = false;
  const imprimir = () => {
    if (printed) return;
    printed = true;
    try {
      w.focus();
      w.print();
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(url), 3_000);
    }
  };

  w.addEventListener(
    'load',
    () => {
      window.setTimeout(imprimir, 150);
    },
    { once: true },
  );

  window.setTimeout(() => {
    if (!printed && w.document?.readyState === 'complete') {
      imprimir();
    }
  }, 600);

  return true;
}
