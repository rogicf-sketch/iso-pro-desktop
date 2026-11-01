import { afterEach, describe, expect, it, vi } from 'vitest';
import { withExponentialBackoff } from './retryWithBackoff';

describe('withExponentialBackoff', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sucesso na primeira tentativa', async () => {
    const fn = vi.fn(async () => 42);
    await expect(withExponentialBackoff(fn, { maxAttempts: 3, baseMs: 1 })).resolves.toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('reintenta erros de rede e eventualmente sucede', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network request failed'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce('ok');
    await expect(
      withExponentialBackoff(fn, { maxAttempts: 4, baseMs: 1, maxMs: 5, timeoutMs: 5_000 }),
    ).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('nao reintenta held (lock)', async () => {
    const fn = vi.fn(async () => {
      throw new Error('held');
    });
    await expect(withExponentialBackoff(fn, { maxAttempts: 4, baseMs: 1 })).rejects.toThrow(/held/);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
