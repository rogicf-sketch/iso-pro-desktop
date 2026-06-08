/**
 * Barra nativa de pré-visualização (Electron + preload).
 * Oculta a barra embutida no HTML — evita duplicata e botões sem acesso ao IPC.
 */
export function injetarBarraPreviewElectronNoHtml(html: string): string {
  if (html.includes('id="iso-electron-preview-bar"')) {
    return html;
  }

  const injecao = `
<style id="iso-electron-preview-hide-embedded-toolbar">
  .iso-pro-doc-preview-toolbar { display: none !important; }
  @media print {
    #iso-electron-preview-bar,
    #iso-electron-preview-bar-script { display: none !important; height: 0 !important; overflow: hidden !important; }
  }
</style>
<div id="iso-electron-preview-bar" role="toolbar" aria-label="Pré-visualização I.S.O PRO" style="
  display:flex;flex-wrap:wrap;gap:10px;align-items:center;
  margin:0;padding:10px 14px;background:#0f172a;border-bottom:1px solid #334155;
  font-family:'Segoe UI',system-ui,sans-serif;position:sticky;top:0;z-index:99999;
">
  <button type="button" id="iso-electron-preview-print" style="
    padding:8px 18px;font:600 13px 'Segoe UI',system-ui,sans-serif;border-radius:6px;
    border:1px solid #38bdf8;background:#0284c7;color:#fff;cursor:pointer;
  ">Imprimir / PDF</button>
  <button type="button" id="iso-electron-preview-save" style="
    padding:8px 18px;font:600 13px 'Segoe UI',system-ui,sans-serif;border-radius:6px;
    border:1px solid #64748b;background:#1e293b;color:#f1f5f9;cursor:pointer;
  ">Guardar PDF…</button>
  <span id="iso-electron-preview-hint" style="flex:1 1 220px;font-size:12px;color:#94a3b8;line-height:1.35;">
    Pré-visualização I.S.O PRO — «Imprimir / PDF» é rápido (Folha 1/N). «Guardar PDF» gera ficheiro oficial idêntico ao arquivo.
  </span>
  <span id="iso-electron-preview-status" role="status" style="font-size:12px;color:#38bdf8;min-width:120px;text-align:right;"></span>
</div>
<script id="iso-electron-preview-bar-script">
(function () {
  function api() { return window.isoProDesktop || null; }
  function aviso(msg) {
    var el = document.getElementById('iso-electron-preview-status');
    if (el) el.textContent = msg || '';
  }
  function setBusy(busy) {
    var p = document.getElementById('iso-electron-preview-print');
    var s = document.getElementById('iso-electron-preview-save');
    if (p) { p.disabled = busy; p.style.opacity = busy ? '0.65' : '1'; }
    if (s) { s.disabled = busy; s.style.opacity = busy ? '0.65' : '1'; }
  }
  function aguardarPaginacao(fn) {
    if (!window.__relatorioUsaPagedJs || window.__relatorioPaginadoPronto) { fn(); return; }
    var t = setTimeout(fn, 8000);
    document.addEventListener('relatorio-paginado-pronto', function () { clearTimeout(t); fn(); }, { once: true });
  }
  var btnPrint = document.getElementById('iso-electron-preview-print');
  var btnSave = document.getElementById('iso-electron-preview-save');
  if (btnPrint) {
    btnPrint.addEventListener('click', function () {
      var desktop = api();
      if (!desktop || !desktop.printJanelaAtual) {
        aviso('Impressão indisponível — reinicie a aplicação.');
        return;
      }
      setBusy(true);
      aviso('A abrir impressão…');
      aguardarPaginacao(function () {
        void desktop.printJanelaAtual().then(function (res) {
          setBusy(false);
          if (res.ok) { aviso(''); return; }
          aviso(res.error || 'Falha na impressão.');
        }).catch(function (err) {
          setBusy(false);
          aviso(err && err.message ? err.message : 'Falha na impressão.');
        });
      });
    });
  }
  if (btnSave) {
    btnSave.addEventListener('click', function () {
      var desktop = api();
      if (!desktop || !desktop.savePdfJanelaAtual) {
        aviso('Guardar PDF indisponível — reinicie a aplicação.');
        return;
      }
      setBusy(true);
      aviso('A gerar PDF…');
      aguardarPaginacao(function () {
        if (document.getElementById('iso-pdf-meta')) {
          document.body.classList.add('iso-pdf-header-native');
        }
        void desktop.savePdfJanelaAtual().then(function (res) {
          document.body.classList.remove('iso-pdf-header-native');
          setBusy(false);
          if (res.ok) { aviso(''); return; }
          aviso(res.error || 'Falha ao guardar PDF.');
        }).catch(function (err) {
          document.body.classList.remove('iso-pdf-header-native');
          setBusy(false);
          aviso(err && err.message ? err.message : 'Falha ao guardar PDF.');
        });
      });
    });
  }
})();
</script>`;

  const match = html.match(/<body([^>]*)>/i);
  if (match && match.index !== undefined) {
    const insertAt = match.index + match[0].length;
    return html.slice(0, insertAt) + injecao + html.slice(insertAt);
  }
  return injecao + html;
}
