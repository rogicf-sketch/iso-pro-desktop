export {};

declare global {
  interface Window {
    isoProDesktop?: {
      platform: 'desktop';
      version: string;
      getSecurityContext?: () => Promise<{
        isElectron: boolean;
        machineFingerprint: string;
        machineLabel: string;
        appVersion: string;
      }>;
      loadConfigSecrets?: () => Promise<
        | { ok: true; available: boolean; secrets: Record<string, string> }
        | { ok: false; error: string }
      >;
      saveConfigSecrets?: (secrets: Record<string, string>) => Promise<{ ok: true } | { ok: false; error: string }>;
      isConfigSecretsAvailable?: () => Promise<boolean>;
      /** IPC: impressão de HTML no processo principal (evita PDF em branco no Electron). */
      printHtml?: (html: string) => Promise<{ ok: true } | { ok: false; error: string }>;
      /** IPC: impressão da janela de pré-visualização (rápido — não reenvia HTML). */
      printJanelaAtual?: () => Promise<{ ok: true } | { ok: false; error: string }>;
      /** IPC: gera PDF com fundos (`printToPDF`), mais fiável que «Guardar como PDF» na impressão. */
      saveHtmlAsPdf?: (html: string) => Promise<{ ok: true } | { ok: false; error: string }>;
      /** IPC: PDF da janela de pré-visualização (já paginada pelo Paged.js). */
      savePdfJanelaAtual?: () => Promise<{ ok: true } | { ok: false; error: string }>;
      /** IPC: pré-visualização de HTML numa janela (evita pop-up bloqueado / `window.open` null). */
      beginHtmlPreviewLoading?: (titulo: string) => Promise<{ ok: true }>;
      previewHtml?: (html: string) => Promise<{ ok: true } | { ok: false; error: string }>;
      /** IPC: RIR em PDF programático (pdf-lib) — guardar, imprimir, pré-visualizar. */
      saveRirPdf?: (base64: string, defaultName: string) => Promise<{ ok: true } | { ok: false; error: string }>;
      printRirPdf?: (base64: string) => Promise<{ ok: true } | { ok: false; error: string }>;
      previewRirPdf?: (
        base64: string,
        titulo: string,
        defaultName: string,
      ) => Promise<{ ok: true } | { ok: false; error: string }>;
      /** IPC: gera PDF + abre preview no processo principal (mais rápido). */
      previewRirPdfFromHtml?: (
        html: string,
        titulo: string,
        defaultName: string,
      ) => Promise<{ ok: true } | { ok: false; error: string }>;
      openRirPdfExterno?: (base64: string) => Promise<{ ok: true } | { ok: false; error: string }>;
      /** IPC: PDF genérico (HTML → bytes → preview/guardar/imprimir). */
      gerarPdfBytesFromHtml?: (
        html: string,
      ) => Promise<
        | { ok: true; base64: string; bytes?: number }
        | { ok: false; error: string }
      >;
      saveReportPdf?: (
        base64: string,
        defaultName: string,
      ) => Promise<{ ok: true } | { ok: false; error: string }>;
      printReportPdf?: (base64: string) => Promise<{ ok: true } | { ok: false; error: string }>;
      previewReportPdf?: (
        base64: string,
        titulo: string,
        defaultName: string,
      ) => Promise<{ ok: true } | { ok: false; error: string }>;
      /** Abre janela «A gerar PDF…» antes de montar HTML (feedback imediato ao utilizador). */
      beginReportPdfPreviewLoading?: (titulo: string) => Promise<{ ok: true }>;
      /** IPC: gera PDF + abre preview no processo principal (mais rápido; todos os relatórios HTML). */
      previewReportPdfFromHtml?: (
        html: string,
        titulo: string,
        defaultName: string,
      ) => Promise<{ ok: true } | { ok: false; error: string }>;
      gerarRirPdfBytes?: (
        ctx: unknown,
      ) => Promise<
        | { ok: true; base64: string; fonteFamilia?: string; fontRegularBytes?: number; fontBoldBytes?: number }
        | { ok: false; error: string }
      >;
      diagnosticarRirPdfFontes?: () => Promise<
        | { ok: true; regularBytes: number; boldBytes: number; dirs: unknown }
        | { ok: false; error: string; dirs?: unknown }
      >;
      loadRirPdfFontesEmbutidas?: () => Promise<
        | { ok: true; familia: string; regular: string; bold: string }
        | { ok: false; reason?: string }
      >;
      /** IPC: contexto OCI backup (cliente/projeto das Configurações → ficheiro em userData). */
      writeOciUploadContext?: (payload: { cliente: string; projeto: string }) => Promise<
        { ok: true; path: string } | { ok: false; error: string }
      >;
      syncBackupOracleSettings?: (payload: {
        habilitado: boolean;
        intervaloRotinaDias: number;
        intervaloFluxoAltoDias: number;
        minAtendimentosFluxo: number;
        minRecebimentosFluxo: number;
        minCadastrosFluxo: number;
        supabaseUrl: string;
        supabaseAnonKey: string;
        cliente: string;
        projeto: string;
      }) => Promise<{ ok: true } | { ok: false; error: string }>;
      registrarAtividadeBackupOracle?: (
        kind: 'atendimento' | 'recebimento' | 'cadastro',
      ) => Promise<{ ok: true }>;
      obterEstadoBackupOracle?: () => Promise<
        | {
            ok: true;
            ultimoBackupEm: string | null;
            ultimoBackupOk: boolean;
            ultimoErro: string;
            ultimoMotivo: string;
            atividade: { atendimentos: number; recebimentos: number; cadastros: number };
            backupEmCurso: boolean;
          }
        | { ok: false; error: string }
      >;
      executarBackupOracleAgora?: () => Promise<{ ok: true; detail: string } | { ok: false; error: string }>;
      verifySmtpMail?: (payload: {
        smtp: { host: string; port: number; secure: boolean; user: string; pass: string };
        from: string;
        to: string[];
        subject: string;
        text: string;
        html: string;
      }) => Promise<{ ok: true } | { ok: false; error: string }>;
      sendMail?: (payload: {
        smtp: { host: string; port: number; secure: boolean; user: string; pass: string };
        from: string;
        to: string[];
        subject: string;
        text: string;
        html: string;
      }) => Promise<{ ok: true } | { ok: false; error: string }>;
      supabaseFetch?: (payload: {
        url: string;
        method: string;
        headers: Record<string, string>;
        body?: string | null;
      }) => Promise<{
        ok: boolean;
        status: number;
        statusText: string;
        headers: Record<string, string>;
        body: string;
      }>;
    };
  }
}
