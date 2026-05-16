import { describe, expect, it } from 'vitest';
import { parseDesktopLicensePayloadJson } from './desktopLicensePayload.zod';

describe('parseDesktopLicensePayloadJson', () => {
  it('aceita payload minimo', () => {
    const p = {
      licenseId: 'L1',
      issuedTo: 'Acme',
      machineFingerprint: 'fp',
      issuedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(parseDesktopLicensePayloadJson(p)).toMatchObject(p);
  });

  it('rejeita sem licenseId', () => {
    expect(
      parseDesktopLicensePayloadJson({
        issuedTo: 'x',
        machineFingerprint: 'fp',
        issuedAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toBeNull();
  });
});
