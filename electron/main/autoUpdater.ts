import { createRequire } from 'node:module';
import { app } from 'electron';
import { logMainProcessEvent } from './crashReporter';
import { resolveUpdateFeedUrl } from './updateFeed';

/**
 * electron-updater e CJS; em main ESM o named import quebra o boot do portable.
 * createRequire e o caminho seguro (nao carrega o modulo se nao houver feed).
 */
const require = createRequire(import.meta.url);

let started = false;

/**
 * Auto-update via feed generico (electron-updater).
 * So inicia em build empacotado. Feed: `ISO_PRO_UPDATE_FEED_URL` ou default de producao.
 */
export function initAutoUpdater(): void {
  if (started) return;
  if (!app.isPackaged) return;

  const feedUrl = resolveUpdateFeedUrl();
  if (!feedUrl) return;

  started = true;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const updaterMod = require('electron-updater') as {
      autoUpdater: {
        autoDownload: boolean;
        autoInstallOnAppQuit: boolean;
        setFeedURL: (opts: { provider: string; url: string }) => void;
        on: (event: string, listener: (...args: unknown[]) => void) => void;
        checkForUpdatesAndNotify: () => Promise<unknown>;
      };
    };
    const { autoUpdater } = updaterMod;

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl });

    autoUpdater.on('checking-for-update', () => {
      logMainProcessEvent('warning', 'autoUpdater', 'checking-for-update', { feedUrl });
    });
    autoUpdater.on('update-available', (...args: unknown[]) => {
      const info = args[0] as { version?: string } | undefined;
      logMainProcessEvent('warning', 'autoUpdater', 'update-available', {
        version: info?.version,
      });
    });
    autoUpdater.on('update-not-available', () => {
      logMainProcessEvent('warning', 'autoUpdater', 'update-not-available');
    });
    autoUpdater.on('error', (...args: unknown[]) => {
      logMainProcessEvent('error', 'autoUpdater', args[0]);
    });
    autoUpdater.on('update-downloaded', (...args: unknown[]) => {
      const info = args[0] as { version?: string } | undefined;
      logMainProcessEvent('warning', 'autoUpdater', 'update-downloaded', {
        version: info?.version,
      });
    });

    void autoUpdater.checkForUpdatesAndNotify().catch((err: unknown) => {
      logMainProcessEvent('error', 'autoUpdater', err);
    });
  } catch (err) {
    logMainProcessEvent('error', 'autoUpdater', err);
  }
}
