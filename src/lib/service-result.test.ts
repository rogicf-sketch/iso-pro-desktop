import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IsoProSnapshotConflictError } from './isoProSnapshot';
import {
  executeWrite,
  getErrorMessage,
  isSnapshotConflictResult,
  withLocalFallback,
} from './service-result';

describe('service-result', () => {
  describe('getErrorMessage', () => {
    it('usa message de Error', () => {
      expect(getErrorMessage(new Error('x'), 'fallback')).toBe('x');
    });

    it('usa fallback para valor nao-Error', () => {
      expect(getErrorMessage(null, 'fallback')).toBe('fallback');
    });
  });

  describe('isSnapshotConflictResult', () => {
    it('retorna true quando falha e snapshotConflict', () => {
      expect(isSnapshotConflictResult({ success: false, meta: { snapshotConflict: true } })).toBe(true);
    });

    it('retorna false quando sucesso ou sem flag', () => {
      expect(isSnapshotConflictResult({ success: true, meta: { snapshotConflict: true } })).toBe(false);
      expect(isSnapshotConflictResult({ success: false, meta: {} })).toBe(false);
    });
  });

  describe('executeWrite', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('grava local quando shouldWriteRemote e false', async () => {
      const writeLocal = vi.fn();
      const writeRemote = vi.fn();
      const result = await executeWrite({
        shouldWriteRemote: false,
        writeRemote,
        writeLocal,
        successData: { id: '1' },
        fallbackMessage: 'erro',
      });
      expect(writeLocal).toHaveBeenCalledTimes(1);
      expect(writeRemote).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: '1' });
      expect(result.meta?.source).toBe('local');
    });

    it('em sucesso remoto chama writeLocal e retorna meta supabase', async () => {
      const writeLocal = vi.fn();
      const result = await executeWrite({
        shouldWriteRemote: true,
        writeRemote: vi.fn().mockResolvedValue(undefined),
        writeLocal,
        successData: 42,
        fallbackMessage: 'falha',
      });
      expect(writeLocal).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      expect(result.data).toBe(42);
      expect(result.meta?.source).toBe('supabase');
    });

    it('em falha remota com conflito de snapshot popula meta.snapshotConflict e mensagem', async () => {
      const writeLocal = vi.fn();
      const result = await executeWrite({
        shouldWriteRemote: true,
        writeRemote: vi.fn().mockRejectedValue(new IsoProSnapshotConflictError('msg custom')),
        writeLocal,
        successData: null,
        fallbackMessage: 'generico',
      });
      expect(writeLocal).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.error).toBe('msg custom');
      expect(result.meta?.snapshotConflict).toBe(true);
      expect(result.meta?.source).toBe('local');
      expect(result.meta?.fallbackReason).toBe('msg custom');
    });

    it('em falha remota generica nao marca snapshotConflict', async () => {
      const result = await executeWrite({
        shouldWriteRemote: true,
        writeRemote: vi.fn().mockRejectedValue(new Error('rede')),
        writeLocal: vi.fn(),
        successData: null,
        fallbackMessage: 'generico',
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('rede');
      expect(result.meta?.snapshotConflict).toBe(false);
    });
  });

  describe('withLocalFallback', () => {
    it('retorna local quando shouldTryRemote e false', async () => {
      const r = await withLocalFallback({
        shouldTryRemote: false,
        loadRemote: vi.fn(),
        loadLocal: () => ({ a: 1 }),
        fallbackMessage: 'x',
      });
      expect(r.data).toEqual({ a: 1 });
      expect(r.meta.source).toBe('local');
    });

    it('retorna remoto quando sucesso', async () => {
      const r = await withLocalFallback({
        shouldTryRemote: true,
        loadRemote: async () => ({ a: 2 }),
        loadLocal: () => ({ a: 9 }),
        fallbackMessage: 'x',
      });
      expect(r.data).toEqual({ a: 2 });
      expect(r.meta.source).toBe('supabase');
    });

    it('cai no local quando loadRemote falha', async () => {
      const r = await withLocalFallback({
        shouldTryRemote: true,
        loadRemote: async () => {
          throw new Error('timeout');
        },
        loadLocal: () => ({ a: 3 }),
        fallbackMessage: 'fallback msg',
      });
      expect(r.data).toEqual({ a: 3 });
      expect(r.meta.source).toBe('local');
      expect(r.meta.fallbackReason).toBe('timeout');
    });
  });
});
