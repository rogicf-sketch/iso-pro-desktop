/** True quando a UI corre no executável Electron (I.S.O PRO Desktop). */
export function isElectronApp(): boolean {
  return typeof window !== 'undefined' && window.isoProDesktop?.platform === 'desktop';
}

export function isWebBrowserApp(): boolean {
  return !isElectronApp();
}
