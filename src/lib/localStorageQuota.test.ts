/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isQuotaExceededError,
  liberarCachesLocalStorageIsoPro,
  setItemComRecuperacaoQuota,
} from './localStorageQuota';

describe('localStorageQuota', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('detecta QuotaExceededError', () => {
    const err = new DOMException('exceeded the quota', 'QuotaExceededError');
    expect(isQuotaExceededError(err)).toBe(true);
    expect(isQuotaExceededError(new Error('other'))).toBe(false);
  });

  it('remove caches e preserva sessao', () => {
    localStorage.setItem('iso-pro-desktop-materiais', '["x"]');
    localStorage.setItem('iso-pro-desktop-documentos', '["y"]');
    localStorage.setItem('iso-pro-desktop-session::tenant:abc', '{"login":"a"}');
    localStorage.setItem('iso-pro-desktop-cloud-tenant-ativo-v1', '{"version":1}');
    expect(liberarCachesLocalStorageIsoPro()).toBe(2);
    expect(localStorage.getItem('iso-pro-desktop-materiais')).toBeNull();
    expect(localStorage.getItem('iso-pro-desktop-documentos')).toBeNull();
    expect(localStorage.getItem('iso-pro-desktop-session::tenant:abc')).toBeTruthy();
    expect(localStorage.getItem('iso-pro-desktop-cloud-tenant-ativo-v1')).toBeTruthy();
  });

  it('apos quota limpa caches e grava', () => {
    localStorage.setItem('iso-pro-desktop-materiais', 'huge');
    const storage = {
      setItem: vi
        .fn()
        .mockImplementationOnce(() => {
          throw new DOMException('quota', 'QuotaExceededError');
        })
        .mockImplementationOnce((k: string, v: string) => {
          localStorage.setItem(k, v);
        }),
      getItem: localStorage.getItem.bind(localStorage),
      removeItem: localStorage.removeItem.bind(localStorage),
      clear: localStorage.clear.bind(localStorage),
      key: localStorage.key.bind(localStorage),
      length: 0,
    } as unknown as Storage;

    setItemComRecuperacaoQuota(storage, 'iso-pro-desktop-session', '{"ok":1}');
    expect(localStorage.getItem('iso-pro-desktop-materiais')).toBeNull();
    expect(storage.setItem).toHaveBeenCalledTimes(2);
  });
});
