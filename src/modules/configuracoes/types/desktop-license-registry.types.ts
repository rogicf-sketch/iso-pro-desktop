export type DesktopLicenseRegistryItem = {
  licenseId: string;
  /** Preenchido na lista super-admin (todas as empresas). */
  tenantId?: string;
  tenantName?: string;
  tenantSlug?: string;
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
