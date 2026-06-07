/** Metadados lidos pelo processo principal (Electron) ao gerar PDF com cabeçalho nativo. */
export type RelatorioPdfMeta = {
  headerTitle: string;
  headerSub?: string;
  headerCode?: string;
  /** Prefixo da numeração (ex.: Folha). */
  footerPrefix?: string;
  /** Só rodapé nativo (Folha X/Y) — evita cabeçalho Chromium duplicado. */
  footerOnly?: boolean;
};

export function scriptMetadadosPdfRelatorio(meta: RelatorioPdfMeta): string {
  const json = JSON.stringify(meta)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `<script type="application/json" id="iso-pdf-meta">${json}</script>`;
}
