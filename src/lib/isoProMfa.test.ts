import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({
  getSupabase: vi.fn(),
}));
vi.mock('./isoProJwtSession', () => ({
  isIsoProJwtSessionActive: vi.fn(() => true),
}));

import { getSupabase } from './supabase';
import { isIsoProJwtSessionActive } from './isoProJwtSession';
import { listIsoProMfaFactors, startIsoProMfaTotpEnroll, verifyIsoProMfaTotpEnroll } from './isoProMfa';

const mockedGet = vi.mocked(getSupabase);
const mockedJwt = vi.mocked(isIsoProJwtSessionActive);

describe('isoProMfa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedJwt.mockReturnValue(true);
  });

  it('lista factors TOTP', async () => {
    mockedGet.mockReturnValue({
      auth: {
        mfa: {
          listFactors: vi.fn(async () => ({
            data: { totp: [{ id: 'f1', friendly_name: 'App', status: 'verified', factor_type: 'totp' }], phone: [] },
            error: null,
          })),
        },
      },
    } as never);

    const list = await listIsoProMfaFactors();
    expect(list).toEqual([
      { id: 'f1', friendlyName: 'App', status: 'verified', factorType: 'totp' },
    ]);
  });

  it('inicia enroll e verifica', async () => {
    const challenge = vi.fn(async () => ({ data: { id: 'c1' }, error: null }));
    const verify = vi.fn(async () => ({ data: {}, error: null }));
    mockedGet.mockReturnValue({
      auth: {
        mfa: {
          enroll: vi.fn(async () => ({
            data: {
              id: 'factor-1',
              totp: { qr_code: 'data:image/png;base64,xx', secret: 'ABC', uri: 'otpauth://' },
            },
            error: null,
          })),
          challenge,
          verify,
        },
      },
    } as never);

    const started = await startIsoProMfaTotpEnroll();
    expect(started.factorId).toBe('factor-1');
    await verifyIsoProMfaTotpEnroll('factor-1', '123456');
    expect(challenge).toHaveBeenCalledWith({ factorId: 'factor-1' });
    expect(verify).toHaveBeenCalledWith({ factorId: 'factor-1', challengeId: 'c1', code: '123456' });
  });

  it('bloqueia sem JWT', async () => {
    mockedJwt.mockReturnValue(false);
    await expect(listIsoProMfaFactors()).rejects.toThrow(/JWT/);
  });
});
