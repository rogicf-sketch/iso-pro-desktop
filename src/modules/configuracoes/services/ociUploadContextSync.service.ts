import type { ConfiguracaoSistema } from '../types/configuracao.types';

/**
 * No desktop Electron, grava `oci-upload-context.json` em `app.getPath('userData')`
 * para o PowerShell `upload-backup-to-oci.ps1` preencher -Cliente/-Projeto automaticamente.
 */
export async function syncOciUploadContextFromConfig(
  config: Pick<ConfiguracaoSistema, 'cliente' | 'projeto'>,
): Promise<void> {
  if (typeof window === 'undefined') return;
  const api = window.isoProDesktop?.writeOciUploadContext;
  if (!api) return;
  try {
    await api({
      cliente: config.cliente.trim(),
      projeto: config.projeto.trim(),
    });
  } catch {
    /* não bloquear gravação de configurações */
  }
}
