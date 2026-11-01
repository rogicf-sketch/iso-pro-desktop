/**
 * Sai da Fullscreen API do documento (ex.: modal com `browserFullscreen`).
 * Overlays / pré-visualizações anexados a `document.body` ficam invisíveis enquanto
 * outro elemento está em ecrã inteiro — é preciso sair antes de os abrir.
 */
export async function sairFullscreenDocumentoSeActivo(): Promise<void> {
  if (typeof document === 'undefined') return;
  if (!document.fullscreenElement) return;
  try {
    await document.exitFullscreen();
  } catch {
    /* API indisponível ou já a sair */
  }
}
