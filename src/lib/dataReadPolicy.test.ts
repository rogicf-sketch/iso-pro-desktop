import { afterEach, describe, expect, it, vi } from 'vitest';
import * as pdfCloudConfig from './pdfCloud/pdfCloudConfig';
import * as supabase from './supabase';
import { readRemoteOrLocal, shouldTryRemoteRead, withRemoteReadTimeout } from './dataReadPolicy';

describe('dataReadPolicy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('shouldTryRemoteRead', () => {
    it('retorna false sem Supabase configurado', () => {
      vi.spyOn(supabase, 'hasSupabaseConfig').mockReturnValue(false);
      expect(shouldTryRemoteRead()).toBe(false);
    });

    it('retorna false no desktop mesmo com Supabase', () => {
      vi.spyOn(supabase, 'hasSupabaseConfig').mockReturnValue(true);
      vi.spyOn(pdfCloudConfig, 'isIsoProDesktop').mockReturnValue(true);
      expect(shouldTryRemoteRead()).toBe(false);
    });

    it('retorna false offline no browser', () => {
      vi.spyOn(supabase, 'hasSupabaseConfig').mockReturnValue(true);
      vi.spyOn(pdfCloudConfig, 'isIsoProDesktop').mockReturnValue(false);
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
      expect(shouldTryRemoteRead()).toBe(false);
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    });

    it('retorna true no browser online com Supabase', () => {
      vi.spyOn(supabase, 'hasSupabaseConfig').mockReturnValue(true);
      vi.spyOn(pdfCloudConfig, 'isIsoProDesktop').mockReturnValue(false);
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
      expect(shouldTryRemoteRead()).toBe(true);
    });
  });

  describe('withRemoteReadTimeout', () => {
    it('rejeita apos timeout', async () => {
      vi.useFakeTimers();
      const pending = withRemoteReadTimeout(() => new Promise<string>(() => {}), 100);
      vi.advanceTimersByTime(100);
      await expect(pending).rejects.toThrow(/Timeout/);
      vi.useRealTimers();
    });
  });

  describe('readRemoteOrLocal', () => {
    it('usa local quando remoto desactivado', async () => {
      vi.spyOn(supabase, 'hasSupabaseConfig').mockReturnValue(false);
      const readRemote = vi.fn();
      const readLocal = vi.fn().mockReturnValue(['local']);
      await expect(readRemoteOrLocal({ readRemote, readLocal })).resolves.toEqual(['local']);
      expect(readRemote).not.toHaveBeenCalled();
    });

    it('cai no local quando remoto falha', async () => {
      vi.spyOn(supabase, 'hasSupabaseConfig').mockReturnValue(true);
      vi.spyOn(pdfCloudConfig, 'isIsoProDesktop').mockReturnValue(false);
      await expect(
        readRemoteOrLocal({
          readRemote: () => Promise.reject(new Error('Failed to fetch')),
          readLocal: () => ['fallback'],
        }),
      ).resolves.toEqual(['fallback']);
    });
  });
});
