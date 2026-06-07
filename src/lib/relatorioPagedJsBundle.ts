/**
 * Paged.js para relatórios HTML.
 * - **Externo** (default): `<script src="paged.polyfill.min.js">` — Electron copia o ficheiro ao lado do HTML (IPC leve).
 * - **Inline**: fallback para pré-visualização em browser/`srcdoc` sem ficheiro auxiliar.
 * @see https://pagedjs.org
 */
import pagedPolyfillMin from '../../node_modules/pagedjs/dist/paged.polyfill.min.js?raw';
import { PAGEDJS_SCRIPT_FILENAME } from './relatorioPagedConstants';

export function tagScriptPagedPolyfill(external = true): string {
  if (external) {
    return `<script src="${PAGEDJS_SCRIPT_FILENAME}"></script>`;
  }
  return `<script>${pagedPolyfillMin}</script>`;
}

/** Troca referência externa por script inline (overlay web / srcdoc). */
export function substituirPagedJsPorInline(html: string): string {
  const ext = tagScriptPagedPolyfill(true);
  if (html.includes(ext)) {
    return html.replace(ext, tagScriptPagedPolyfill(false));
  }
  return html;
}
