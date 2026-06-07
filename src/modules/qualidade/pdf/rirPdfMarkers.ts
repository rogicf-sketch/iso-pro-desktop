/** Identidade do motor oficial RIR — único caminho de geração em produção. */
export const RIR_PDF_VERSION = '1.5';

/** Paginação INS: titulo+codigo em todas folhas; rodape Folha n/N; assinaturas no fim. */
export const RIR_PDF_LAYOUT = 'ins-ref';

export const RIR_PDF_ENGINE_MARKER = 'iso-pro-rir-programatico';

export const RIR_PDF_CREATOR = 'I.S.O PRO Desktop — Relatório programático';

export const RIR_PDF_PRODUCER_PREFIX = 'I.S.O PRO RIR Engine';

export const RIR_PDF_AUTHOR = 'I.S.O PRO Desktop';

export function assuntoMetadadosRir(): string {
  return `${RIR_PDF_ENGINE_MARKER};versao=${RIR_PDF_VERSION};layout=${RIR_PDF_LAYOUT};motor=pdf-lib-programatico`;
}

export function producerMetadadosRir(): string {
  return `${RIR_PDF_PRODUCER_PREFIX} ${RIR_PDF_VERSION}`;
}
