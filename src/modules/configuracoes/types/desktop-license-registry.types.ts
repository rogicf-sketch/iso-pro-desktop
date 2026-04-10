export type DesktopLicenseRegistryItem = {
  licenseId: string;
  issuedTo: string;
  machineFingerprint: string;
  machineLabel: string;
  appVersion: string;
  status: 'active' | 'revoked';
  emitidaEm: string;
  expiraEm: string;
  revogadaEm: string;
  motivoRevogacao: string;
};
