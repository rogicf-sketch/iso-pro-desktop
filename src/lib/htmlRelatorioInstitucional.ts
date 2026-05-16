export function escapeHtmlRelatorio(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Barra «Imprimir / PDF» comum a relatórios HTML (RF, RIR, RNC, recibo).
 * Só em ecrã; oculta na impressão. Classe: `iso-pro-doc-preview-toolbar`.
 */
export function cssBarraPreVisualizacaoImpressaoHtml(): string {
  return `
    .iso-pro-doc-preview-toolbar { display: none; }
    @media screen {
      .iso-pro-doc-preview-toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
        margin: 0 0 14px;
        padding: 10px 12px;
        background: #0f172a;
        border-radius: 8px;
        border: 1px solid #334155;
      }
      .iso-pro-doc-preview-toolbar__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }
      .iso-pro-doc-preview-toolbar button {
        padding: 8px 16px;
        font: 600 13px 'Segoe UI', system-ui, sans-serif;
        border-radius: 6px;
        border: 1px solid #38bdf8;
        background: #0284c7;
        color: #fff;
        cursor: pointer;
      }
      .iso-pro-doc-preview-toolbar button.iso-pro-doc-preview-toolbar__secondary {
        border-color: #64748b;
        background: #1e293b;
        color: #f1f5f9;
      }
      .iso-pro-doc-preview-toolbar button:hover {
        filter: brightness(1.08);
      }
      .iso-pro-doc-preview-toolbar span {
        color: #cbd5e1;
        font-size: 12px;
        flex: 1 1 200px;
      }
    }
    @media print {
      .iso-pro-doc-preview-toolbar {
        display: none !important;
      }
    }
  `;
}

export function htmlBarraPreVisualizacaoImpressao(): string {
  return `<div class="iso-pro-doc-preview-toolbar" role="toolbar" aria-label="Ações de pré-visualização">
    <div class="iso-pro-doc-preview-toolbar__actions">
      <button type="button" data-iso-pro-action="print">Imprimir ou guardar como PDF</button>
      <button type="button" data-iso-pro-action="save-pdf" class="iso-pro-doc-preview-toolbar__secondary">Guardar PDF…</button>
    </div>
    <span>«Guardar PDF» mantém o aspeto da pré-visualização (cores de fundo). Na impressão tradicional, em «Mais definições», ative «Gráficos de fundo».</span>
  </div>`;
}

export function scriptBarraPreVisualizacaoImpressao(): string {
  return `<script>
    (function () {
      function docHtml() {
        var dt = document.doctype;
        var dtStr = dt ? '<!DOCTYPE ' + dt.name + '>' : '<!DOCTYPE html>';
        return dtStr + '\\n' + document.documentElement.outerHTML;
      }
      var root = document.querySelector('.iso-pro-doc-preview-toolbar');
      if (!root) return;
      var btnPrint = root.querySelector('[data-iso-pro-action="print"]');
      var btnPdf = root.querySelector('[data-iso-pro-action="save-pdf"]');
      if (btnPrint) {
        btnPrint.addEventListener('click', function () {
          if (window.isoProDesktop && window.isoProDesktop.printHtml) {
            void window.isoProDesktop.printHtml(docHtml());
          } else {
            window.print();
          }
        });
      }
      if (btnPdf) {
        if (window.isoProDesktop && window.isoProDesktop.saveHtmlAsPdf) {
          btnPdf.addEventListener('click', function () {
            void window.isoProDesktop.saveHtmlAsPdf(docHtml());
          });
        } else {
          btnPdf.style.display = 'none';
        }
      }
    })();
  </script>`;
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

/**
 * Fragmento HTML (já escapado) a inserir logo após «I.S.O PRO Desktop» no rodapé legal
 * (mesmo corpo tipográfico do parágrafo cinza). Prioriza CNPJ; sem CNPJ, usa a razão social se existir.
 */
export function segmentoInstituicaoRodapeEletronico(nome: string, cnpj: string): string {
  const n = nome.trim();
  const c = cnpj.trim();
  if (c) return ` CNPJ: ${escapeHtmlRelatorio(c)}`;
  if (n) return ` · ${escapeHtmlRelatorio(n)}`;
  return '';
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
 * Dispara impressão do HTML (recibos, relatórios, etc.).
 *
 * No **I.S.O PRO desktop (Electron)** usa primeiro **IPC → processo principal** (`printHtml`): carrega o HTML
 * numa janela oculta e chama `webContents.print` — evita PDF / folha em branco típicos do `print()` no renderer.
 * Fora do Electron (ex.: só Vite no browser), usa **iframe oculto** como recurso.
 *
 * @returns false se não houver `document.body` (ex.: SSR) e não houver API desktop.
 */
export function abrirImpressaoHtmlRelatorio(html: string): boolean {
  const api = typeof window !== 'undefined' ? window.isoProDesktop : undefined;
  if (api?.printHtml) {
    void api.printHtml(html).then((res) => {
      if (!res.ok && typeof window !== 'undefined') {
        console.error('[I.S.O PRO] Falha na impressão:', res.error);
      }
    });
    return true;
  }

  if (typeof document === 'undefined' || !document.body) {
    return false;
  }

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', 'iso-pro-impressao');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    'width:1px',
    'height:1px',
    'opacity:0',
    'pointer-events:none',
    'border:none',
    'z-index:-1',
  ].join(';');

  let printed = false;

  const cleanup = () => {
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
      iframe.remove();
    }, 1500);
  };

  const runPrint = () => {
    if (printed) return;
    const w = iframe.contentWindow;
    if (!w) {
      URL.revokeObjectURL(url);
      iframe.remove();
      return;
    }
    printed = true;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.setTimeout(() => {
          try {
            w.focus();
            w.print();
          } finally {
            cleanup();
          }
        }, 320);
      });
    });
  };

  iframe.addEventListener(
    'load',
    () => {
      runPrint();
    },
    { once: true },
  );

  document.body.appendChild(iframe);
  iframe.src = url;

  window.setTimeout(() => {
    if (!printed && iframe.contentDocument?.readyState === 'complete') {
      runPrint();
    }
  }, 900);

  return true;
}

const ERRO_PREVISUALIZACAO_POPUP =
  'Não foi possível abrir a janela de pré-visualização. Permita pop-ups para este site ou use Editar e depois «Imprimir / PDF».';

const OVERLAY_PREVISUALIZACAO_ID = 'iso-pro-html-preview-overlay';

/** Pré-visualização dentro da própria janela (iframe + blob) — não depende de `window.open` nem de IPC. */
function abrirPreVisualizacaoInAppOverlay(html: string): boolean {
  if (typeof document === 'undefined' || !document.body) {
    return false;
  }
  document.getElementById(OVERLAY_PREVISUALIZACAO_ID)?.remove();

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const root = document.createElement('div');
  root.id = OVERLAY_PREVISUALIZACAO_ID;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.style.cssText =
    'position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,0.72);display:flex;flex-direction:column;padding:12px;box-sizing:border-box;';

  const bar = document.createElement('div');
  bar.style.cssText =
    'display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px;flex-shrink:0;flex-wrap:wrap;';
  const left = document.createElement('div');
  left.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:10px;flex:1;min-width:0;';
  const hint = document.createElement('span');
  hint.style.cssText = 'color:#e2e8f0;font-size:13px;';
  hint.textContent =
    'Pré-visualização — «Guardar PDF» igual ao ecrã; «Imprimir / PDF»: no diálogo ative «Gráficos de fundo» se faltar cor.';
  const btnPrint = document.createElement('button');
  btnPrint.type = 'button';
  btnPrint.textContent = 'Imprimir / PDF';
  btnPrint.style.cssText =
    'padding:8px 16px;cursor:pointer;font-size:14px;border-radius:8px;border:1px solid #38bdf8;background:#0284c7;color:#fff;font-weight:600;';
  btnPrint.addEventListener('click', () => {
    void abrirImpressaoHtmlRelatorio(html);
  });
  const btnPdf = document.createElement('button');
  btnPdf.type = 'button';
  btnPdf.textContent = 'Guardar PDF…';
  btnPdf.style.cssText =
    'padding:8px 16px;cursor:pointer;font-size:14px;border-radius:8px;border:1px solid #64748b;background:#1e293b;color:#f1f5f9;font-weight:600;';
  btnPdf.addEventListener('click', () => {
    const api = typeof window !== 'undefined' ? window.isoProDesktop : undefined;
    if (api?.saveHtmlAsPdf) {
      void api.saveHtmlAsPdf(html).then((res) => {
        if (!res.ok && typeof console !== 'undefined') {
          console.error('[I.S.O PRO] PDF:', res.error);
        }
      });
    }
  });
  left.appendChild(hint);
  left.appendChild(btnPdf);
  left.appendChild(btnPrint);
  if (typeof window !== 'undefined' && !window.isoProDesktop?.saveHtmlAsPdf) {
    btnPdf.style.display = 'none';
  }
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Fechar';
  btn.style.cssText =
    'padding:8px 16px;cursor:pointer;font-size:14px;border-radius:8px;border:1px solid #94a3b8;background:#1e293b;color:#f1f5f9;font-weight:600;';
  bar.appendChild(left);
  bar.appendChild(btn);

  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', 'Pré-visualização do relatório');
  iframe.style.cssText = 'flex:1;width:100%;min-height:0;border:0;border-radius:10px;background:#fff;';

  const cleanup = () => {
    document.removeEventListener('keydown', onKeyDown, true);
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
    root.remove();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      cleanup();
    }
  };

  btn.addEventListener('click', cleanup);
  root.addEventListener('click', (e) => {
    if (e.target === root) cleanup();
  });
  document.addEventListener('keydown', onKeyDown, true);

  root.appendChild(bar);
  root.appendChild(iframe);
  document.body.appendChild(root);
  iframe.src = url;
  btn.focus();
  return true;
}

/**
 * Abre pré-visualização do HTML. No **Electron** tenta IPC (`previewHtml`); se falhar ou não existir,
 * usa **overlay** na própria aplicação (sem `window.open`). Último recurso: janela nova + blob.
 */
export async function abrirPreVisualizacaoHtmlRelatorio(
  html: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const api = typeof window !== 'undefined' ? window.isoProDesktop : undefined;
  let ipcFalhou = false;

  if (api?.previewHtml) {
    try {
      const res = await api.previewHtml(html);
      if (res.ok) return res;
      ipcFalhou = true;
    } catch {
      ipcFalhou = true;
    }
  }

  if (abrirPreVisualizacaoInAppOverlay(html)) {
    return { ok: true };
  }

  if (ipcFalhou) {
    return {
      ok: false,
      error:
        'Não foi possível mostrar a pré-visualização na janela extra. Reconstrua a aplicação (`npm run dist:win`) ou use Editar e depois «Imprimir / PDF».',
    };
  }

  const w = abrirJanelaPreVisualizacaoRelatorio();
  if (!w) {
    return { ok: false, error: ERRO_PREVISUALIZACAO_POPUP };
  }
  try {
    carregarHtmlPreVisualizacaoRelatorio(w, html);
    return { ok: true };
  } catch (e) {
    try {
      w.close();
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Falha ao carregar a pré-visualização.',
    };
  }
}

/**
 * Abre de imediato (no mesmo "gesto" do clique) uma janela vazia para pré-visualização.
 * Depois de `await`, use `carregarHtmlPreVisualizacaoRelatorio` — caso contrário o browser
 * / Electron costuma bloquear `window.open` e devolver `null`.
 */
export function abrirJanelaPreVisualizacaoRelatorio(): Window | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.open('about:blank', '_blank', 'noopener,noreferrer');
}

/**
 * Navega a janela já aberta para o HTML (blob). Evita `document.write` no filho (ecrã branco no Electron sandbox).
 */
export function carregarHtmlPreVisualizacaoRelatorio(child: Window, html: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const revoke = () => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  };
  child.location.href = url;
  try {
    child.addEventListener(
      'load',
      () => {
        window.setTimeout(revoke, 30_000);
      },
      { once: true },
    );
  } catch {
    window.setTimeout(revoke, 30_000);
  }
  child.focus();
}

/**
 * Abre o HTML do relatório numa janela normal (pré-visualização / leitura).
 * Só é fiável se for chamada **sem** `await` antes no mesmo handler (gesto do utilizador).
 * Com trabalho assíncrono primeiro, use `abrirJanelaPreVisualizacaoRelatorio` + `carregarHtmlPreVisualizacaoRelatorio`.
 */
export function abrirVisualizacaoHtmlRelatorio(html: string): boolean {
  const w = abrirJanelaPreVisualizacaoRelatorio();
  if (!w) {
    return false;
  }
  carregarHtmlPreVisualizacaoRelatorio(w, html);
  return true;
}
