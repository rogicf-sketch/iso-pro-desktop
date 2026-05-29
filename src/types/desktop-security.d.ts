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
      /** IPC: impressão de HTML no processo principal (evita PDF em branco no Electron). */
      printHtml?: (html: string) => Promise<{ ok: true } | { ok: false; error: string }>;
      /** IPC: gera PDF com fundos (`printToPDF`), mais fiável que «Guardar como PDF» na impressão. */
      saveHtmlAsPdf?: (html: string) => Promise<{ ok: true } | { ok: false; error: string }>;
      /** IPC: pré-visualização de HTML numa janela (evita pop-up bloqueado / `window.open` null). */
      previewHtml?: (html: string) => Promise<{ ok: true } | { ok: false; error: string }>;
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
    };
  }
}
