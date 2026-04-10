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
    };
  }
}
