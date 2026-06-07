/** Tipos de job PDF suportados pelo serviço na nuvem. */

export const PDF_JOB_TIPOS = [

  'rir',

  'rnc',

  'relatorio_fotografico',

  'planejamento_campo',

  'etiqueta',

  'recibo_atendimento',

  'recibo_estorno',

  'recibo_sessao',

  'relatorio_final_obra',

] as const;



export type PdfJobTipo = (typeof PDF_JOB_TIPOS)[number];



export type PdfJobStatus = 'pending' | 'processing' | 'done' | 'failed';



export type PdfGerado = {

  bytes: Uint8Array;

  fileName: string;

  origem: 'nuvem' | 'local';

};



export type EnqueuePdfResponse =

  | { ok: true; jobId: string; status: PdfJobStatus }

  | { ok: false; error: string };



export type StatusPdfResponse =

  | {

      ok: true;

      jobId: string;

      status: PdfJobStatus;

      fileName?: string;

      error?: string;

      signedUrl?: string;

    }

  | { ok: false; error: string };



export type HtmlPdfPayload = {

  html: string;

  waitPagedJs?: boolean;

};

