/**
 * Mensagens de impressão / PDF / pré-visualização em linguagem operacional (sem jargão Electron).
 */
export function traduzirErroImpressaoIsoPro(message: string): string {
  const m = message.trim();
  if (!m) return 'Não foi possível concluir a impressão. Tente novamente.';

  const lower = m.toLowerCase();

  if (lower.includes('timeout ao carregar pdf para impressão')) {
    return 'A impressão demorou demais. Feche outras janelas de pré-visualização, aguarde alguns segundos e use «Imprimir» novamente.';
  }
  if (lower.includes('timeout ao carregar pdf na pré-visualização')) {
    return 'O PDF demorou demais a abrir. Tente «Pré-visualizar» novamente ou use «Imprimir / PDF».';
  }
  if (lower.includes('timeout ao carregar html para impressão')) {
    return 'O documento demorou demais a preparar. Tente «Pré-visualizar» primeiro ou reduza o volume de itens.';
  }
  if (lower.includes('timeout ao carregar html para pdf')) {
    return 'A geração do PDF demorou demais. Use «Imprimir / PDF» ou tente sem imagens externas no logo.';
  }
  if (lower.includes('timeout ao carregar pré-visualização') || lower.includes('timeout ao carregar pre-visualizacao')) {
    return 'A pré-visualização demorou demais a abrir. Tente novamente ou use «Imprimir / PDF».';
  }
  if (lower.includes('printing failed') || lower.includes('failed to generate pdf')) {
    return 'Não foi possível gerar o PDF neste momento. Use «Imprimir / PDF» ou reinicie a aplicação.';
  }
  if (lower.includes('cancelada') || lower.includes('cancelado') || lower.includes('canceled')) {
    return 'Operação cancelada.';
  }
  if (lower.includes('bloqueou') || lower.includes('popup') || lower.includes('pop-up')) {
    return 'O navegador bloqueou a janela. Permita pop-ups para este site ou use a aplicação desktop.';
  }

  return m;
}
