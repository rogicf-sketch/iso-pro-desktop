import { BrowserWindow, type WebContents } from 'electron';
import { pathToFileURL } from 'node:url';

export const PDF_PRINT_LOAD_TIMEOUT_MS = 60_000;
export const HTML_REPORT_LOAD_TIMEOUT_MS = 30_000;
export const HTML_PDF_GEN_LOAD_TIMEOUT_MS = 90_000;
/** Pré-visualização: abrir rápido; impressão/PDF esperam mais no handler. */
export const PAGED_LAYOUT_PREVIEW_MS = 6_000;
export const PAGED_LAYOUT_PRINT_MS = 45_000;

/** Verifica se o documento já tem DOM utilizável (não depende de isLoading — pode ficar true após loadFile). */
async function paginaWebContentsJaCarregada(webContents: WebContents): Promise<boolean> {
  if (webContents.isDestroyed()) return false;
  try {
    return await webContents.executeJavaScript(
      `!!document.body && (document.readyState === 'complete' || document.readyState === 'interactive')`,
    );
  } catch {
    return false;
  }
}

/**
 * Após `loadFile`/`loadURL` resolver: estabiliza o DOM por polling.
 * Não falha por timeout — confia na Promise do Electron; só espera o body ficar acessível.
 */
export async function estabilizarDomAposLoadFile(webContents: WebContents): Promise<void> {
  if (webContents.isDestroyed()) return;
  for (let i = 0; i < 80; i++) {
    if (webContents.isDestroyed()) return;
    if (await paginaWebContentsJaCarregada(webContents)) {
      await new Promise((r) => setTimeout(r, 100));
      return;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  try {
    const hasBody = await webContents.executeJavaScript('!!document.body');
    if (hasBody) {
      await new Promise((r) => setTimeout(r, 100));
    }
  } catch {
    /* loadFile já resolveu — prosseguir */
  }
}

/**
 * Aguarda DOM pronto antes de imprimir ou gerar PDF (polling — eventos did-finish-load
 * podem ter disparado antes de registarmos listeners).
 */
export async function aguardarDomRelatorioHtml(
  webContents: WebContents,
  timeoutMs = HTML_REPORT_LOAD_TIMEOUT_MS,
): Promise<void> {
  if (webContents.isDestroyed()) {
    throw new Error('Janela de documento indisponível.');
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (webContents.isDestroyed()) {
      throw new Error('Janela de documento indisponível.');
    }
    if (await paginaWebContentsJaCarregada(webContents)) {
      await new Promise((r) => setTimeout(r, 100));
      return;
    }
    await new Promise((r) => setTimeout(r, 50));
  }

  try {
    const hasBody = await webContents.executeJavaScript('!!document.body');
    if (hasBody) {
      await new Promise((r) => setTimeout(r, 100));
      return;
    }
  } catch {
    /* ignore */
  }

  throw new Error('Timeout ao carregar HTML para impressão.');
}

/** Aguarda Paged.js concluir layout antes de imprimir, gerar PDF ou mostrar pré-visualização. */
export async function aguardarLayoutRelatorioHtml(
  webContents: WebContents,
  timeoutMs = PAGED_LAYOUT_PRINT_MS,
): Promise<void> {
  await webContents.executeJavaScript(`
    new Promise(function (resolve) {
      if (!window.__relatorioUsaPagedJs) { resolve(); return; }
      if (window.__relatorioPaginadoPronto) { resolve(); return; }
      var t = setTimeout(function () { resolve(); }, ${timeoutMs});
      document.addEventListener('relatorio-paginado-pronto', function () {
        clearTimeout(t);
        resolve();
      }, { once: true });
    })
  `);
}

/** Aguarda Paged.js apenas quando o documento usa paginação. */
export async function aguardarLayoutRelatorioHtmlCondicional(
  webContents: WebContents,
  timeoutMs = PAGED_LAYOUT_PRINT_MS,
): Promise<void> {
  const usaPaged = await webContents.executeJavaScript('!!window.__relatorioUsaPagedJs');
  if (!usaPaged) {
    await new Promise((r) => setTimeout(r, 150));
    return;
  }
  await aguardarLayoutRelatorioHtml(webContents, timeoutMs);
}

/** Espera curta de paginação só para exibir a janela (não bloqueia minutos). */
export async function aguardarLayoutRelatorioHtmlPreview(webContents: WebContents): Promise<void> {
  await aguardarLayoutRelatorioHtmlCondicional(webContents, PAGED_LAYOUT_PREVIEW_MS);
}

/** Aguarda carregamento completo de uma janela (shell HTML ou PDF). */
export async function aguardarCarregamentoWebContents(
  win: BrowserWindow,
  timeoutMs = PDF_PRINT_LOAD_TIMEOUT_MS,
  timeoutMessage = 'Timeout ao carregar pré-visualização.',
): Promise<void> {
  if (win.isDestroyed()) {
    throw new Error('Janela indisponível.');
  }

  const wc = win.webContents;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (win.isDestroyed()) {
      throw new Error('Janela indisponível.');
    }
    if (await paginaWebContentsJaCarregada(wc)) {
      await new Promise((r) => setTimeout(r, 80));
      return;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(timeoutMessage);
}

/** Aguarda iframe do visualizador PDF dentro do shell de pré-visualização. */
export async function aguardarIframePdfPreviewShell(
  webContents: WebContents,
  iframeId: string,
  timeoutMs = PDF_PRINT_LOAD_TIMEOUT_MS,
): Promise<void> {
  await webContents.executeJavaScript(`
    new Promise(function (resolve, reject) {
      var iframe = document.getElementById(${JSON.stringify(iframeId)});
      if (!iframe) { resolve(); return; }
      var done = false;
      var t = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error('Timeout ao carregar PDF na pré-visualização.'));
      }, ${timeoutMs});
      function finish() {
        if (done) return;
        done = true;
        clearTimeout(t);
        resolve();
      }
      iframe.addEventListener('load', finish, { once: true });
      try {
        var doc = iframe.contentDocument;
        if (doc && doc.readyState === 'complete') finish();
      } catch (e) {}
    })
  `);
}

/** Carrega PDF temporário numa janela oculta e aguarda o motor interno do Chromium. */
export async function carregarPdfTemporarioNaJanela(
  win: BrowserWindow,
  pdfPath: string,
  timeoutMs = PDF_PRINT_LOAD_TIMEOUT_MS,
): Promise<void> {
  const url = pathToFileURL(pdfPath).href;
  await win.loadURL(url);
  await aguardarCarregamentoWebContents(win, timeoutMs, 'Timeout ao carregar PDF para impressão.');
  await new Promise((r) => setTimeout(r, 350));
}

/** Limpa estado da janela reutilizada antes de carregar novo HTML. */
export async function resetarJanelaGeracaoPdf(win: BrowserWindow): Promise<void> {
  if (win.isDestroyed()) return;
  const wc = win.webContents;
  if (wc.isLoading()) {
    wc.stop();
  }
  await wc.loadURL('about:blank');
}
