import { describe, expect, it } from 'vitest';
import {
  FORCE_UPDATE_BELOW_VERSION,
  getAppUpdatePolicy,
  isAppVersionBelowMinimum,
  MIN_SUPPORTED_APP_VERSION,
} from './appVersionPolicy';

describe('appVersionPolicy', () => {
  it('expoe minima 0.1.247 e force abaixo de 0.1.246', () => {
    expect(MIN_SUPPORTED_APP_VERSION).toBe('0.1.247');
    expect(FORCE_UPDATE_BELOW_VERSION).toBe('0.1.246');
  });

  it('detecta versoes abaixo do minimo', () => {
    expect(isAppVersionBelowMinimum('0.1.246')).toBe(true);
    expect(isAppVersionBelowMinimum('0.1.247')).toBe(false);
    expect(isAppVersionBelowMinimum('0.1.250')).toBe(false);
    expect(isAppVersionBelowMinimum('0.1.255')).toBe(false);
    expect(isAppVersionBelowMinimum('0.1.256')).toBe(false);
    expect(isAppVersionBelowMinimum('0.1.257')).toBe(false);
  });

  it('ignora sufixos pre-release no parse', () => {
    expect(isAppVersionBelowMinimum('v0.1.246')).toBe(true);
    expect(isAppVersionBelowMinimum('0.1.247-canary')).toBe(false);
  });

  it('marca forceUpdate abaixo do limiar critico', () => {
    const force = getAppUpdatePolicy('0.1.245');
    expect(force.forceUpdate).toBe(true);
    expect(force.belowMinimum).toBe(true);

    const warn = getAppUpdatePolicy('0.1.246');
    expect(warn.forceUpdate).toBe(false);
    expect(warn.belowMinimum).toBe(true);

    const ok = getAppUpdatePolicy('0.1.247');
    expect(ok.forceUpdate).toBe(false);
    expect(ok.belowMinimum).toBe(false);
  });
});
