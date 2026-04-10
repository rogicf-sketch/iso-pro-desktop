export type DesktopLicensePayload = {
  licenseId: string;
  issuedTo: string;
  machineFingerprint: string;
  machineLabel?: string;
  issuedAt: string;
  expiresAt?: string;
  appVersion?: string;
  status?: 'active' | 'revoked';
};
