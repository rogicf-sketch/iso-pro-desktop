import { describe, expect, it } from 'vitest';
import { resolveFonteNuvemOk } from './fonteNuvemLista';

describe('resolveFonteNuvemOk', () => {
  it('true quando listSource supabase e nuvem configurada', () => {
    expect(
      resolveFonteNuvemOk({ listSource: 'supabase', hasCloudConfig: true }),
    ).toBe(true);
  });

  it('false durante SWR (cache local — nao fingir nuvem OK)', () => {
    expect(
      resolveFonteNuvemOk({
        listSource: 'local',
        hasCloudConfig: true,
        staleWhileRevalidate: true,
      }),
    ).toBe(false);
  });

  it('false quando local sem SWR', () => {
    expect(
      resolveFonteNuvemOk({ listSource: 'local', hasCloudConfig: true }),
    ).toBe(false);
  });

  it('false quando SWR com fallbackReason', () => {
    expect(
      resolveFonteNuvemOk({
        listSource: 'local',
        hasCloudConfig: true,
        staleWhileRevalidate: true,
        fallbackReason: 'Timeout ao consultar nuvem',
      }),
    ).toBe(false);
  });

  it('false quando supabase mas com fallbackReason', () => {
    expect(
      resolveFonteNuvemOk({
        listSource: 'supabase',
        hasCloudConfig: true,
        fallbackReason: 'parcial',
      }),
    ).toBe(false);
  });
});
