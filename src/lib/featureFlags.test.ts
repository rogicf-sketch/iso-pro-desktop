/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FEATURE_FLAGS_STORAGE,
  applyRemoteFeatureFlags,
  extractRemoteFeatureFlags,
  isRemoteKillSwitched,
  parseFlagValue,
  readRemoteFeatureFlags,
  resolveFeatureEnabled,
} from './featureFlags';

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('parseFlagValue', () => {
  it('reconhece booleans e strings comuns', () => {
    expect(parseFlagValue(true)).toBe(true);
    expect(parseFlagValue('off')).toBe(false);
    expect(parseFlagValue('1')).toBe(true);
    expect(parseFlagValue('nao-sei')).toBeUndefined();
    expect(parseFlagValue(undefined)).toBeUndefined();
  });
});

describe('extractRemoteFeatureFlags', () => {
  it('extrai só valores boolean válidos', () => {
    const flags = extractRemoteFeatureFlags({ featureFlags: { estornoV2: false, x: 'on', lixo: 'talvez' } });
    expect(flags).toEqual({ estornoV2: false, x: true });
  });

  it('devolve vazio quando não há featureFlags', () => {
    expect(extractRemoteFeatureFlags({})).toEqual({});
    expect(extractRemoteFeatureFlags(null)).toEqual({});
  });
});

describe('applyRemoteFeatureFlags / cache', () => {
  it('guarda as flags do snapshot para leitura síncrona', () => {
    applyRemoteFeatureFlags({ featureFlags: { estornoV2: false } });
    expect(readRemoteFeatureFlags()).toEqual({ estornoV2: false });
    expect(JSON.parse(localStorage.getItem(FEATURE_FLAGS_STORAGE)!)).toEqual({ estornoV2: false });
  });

  it('snapshot parcial (sem featureFlags) não apaga o cache anterior', () => {
    applyRemoteFeatureFlags({ featureFlags: { estornoV2: false } });
    applyRemoteFeatureFlags({ documentos: [] }); // fatia sem featureFlags
    expect(readRemoteFeatureFlags()).toEqual({ estornoV2: false });
  });

  it('featureFlags presente porém vazio limpa as flags', () => {
    applyRemoteFeatureFlags({ featureFlags: { estornoV2: false } });
    applyRemoteFeatureFlags({ featureFlags: {} });
    expect(readRemoteFeatureFlags()).toEqual({});
  });
});

describe('resolveFeatureEnabled (precedência)', () => {
  it('kill-switch remoto vence env e default', () => {
    applyRemoteFeatureFlags({ featureFlags: { estornoV2: false } });
    expect(isRemoteKillSwitched('estornoV2')).toBe(true);
    expect(resolveFeatureEnabled('estornoV2', { envValue: 'true', defaultEnabled: true })).toBe(false);
  });

  it('sem remoto, env explícito decide', () => {
    expect(resolveFeatureEnabled('estornoV2', { envValue: 'false', defaultEnabled: true })).toBe(false);
    expect(resolveFeatureEnabled('estornoV2', { envValue: 'true', defaultEnabled: false })).toBe(true);
  });

  it('sem remoto e sem env, opt-out local desliga', () => {
    expect(resolveFeatureEnabled('estornoV2', { localOptOut: true, defaultEnabled: true })).toBe(false);
  });

  it('sem nada, usa o default', () => {
    expect(resolveFeatureEnabled('estornoV2', { defaultEnabled: true })).toBe(true);
    expect(resolveFeatureEnabled('estornoV2', { defaultEnabled: false })).toBe(false);
  });
});
