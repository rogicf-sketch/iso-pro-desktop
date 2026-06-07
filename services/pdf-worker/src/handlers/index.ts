const HTML_TIPOS = new Set([
  'rir',
  'rnc',
  'relatorio_fotografico',
  'planejamento_campo',
  'etiqueta',
  'recibo_atendimento',
  'recibo_estorno',
  'recibo_sessao',
  'relatorio_final_obra',
]);

export async function processPdfJob(tipo: string, payload: unknown): Promise<Uint8Array> {
  if (HTML_TIPOS.has(tipo)) {
    const { gerarHtmlPdfFromPayload } = await import('./htmlPaged.ts');
    return gerarHtmlPdfFromPayload(payload);
  }
  throw new Error(`Tipo de PDF não suportado: ${tipo}`);
}
